/**
 * Migrate the D4 attendance Google Sheet into the ERP.
 *
 *   Phase "attendance"  JANUARY..AUGUST 2026 daily grids -> `attendance`
 *   Phase "balances"    the CL/EL/ML tab -> staff quota overrides + `leave_adjustments`
 *
 * The mappings and the arithmetic live in scripts/lib/sheet-import.mjs and are
 * unit-tested in src/lib/leave-sheet-import.test.ts; this file is the IO around
 * them. Staff match by name where the sheet is known to reuse a code for two
 * people, and by employee code everywhere else — a dry run prints every row
 * where a code matches but the name does not, so a swap cannot pass unnoticed.
 *
 * Sheet rows with no ERP staff record are skipped and nothing is created for
 * them; they are people who have left.
 *
 * Both phases are idempotent. Attendance upserts on staff + day and the sheet
 * wins on any day the ERP already has, but only for what the sheet actually
 * asserts: an existing biometric row keeps its punch times, working hours and
 * lateness flags. Adjustments carry importTag "sheet-2026" and are deleted and
 * rewritten on every run, so re-running never doubles a balance.
 *
 * Run: node scripts/import-attendance-sheet.mjs                  (dry run)
 *      node scripts/import-attendance-sheet.mjs --commit
 *      node scripts/import-attendance-sheet.mjs --phase=balances --commit
 *      node scripts/import-attendance-sheet.mjs --skip-collisions
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import {
  BALANCE_GID,
  BUCKETS,
  CODE_MAP,
  COL,
  IMPORT_TAG,
  MONTH_TABS,
  SHEET_ID,
  YEAR,
  buildBalanceAdjustments,
  clean,
  codeOf,
  isSectionRow,
  midnight,
  nameKey,
  parseCsv,
  resolveSheetRow,
} from "./lib/sheet-import.mjs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const phaseArg = (args.find((a) => a.startsWith("--phase=")) ?? "--phase=all").split("=")[1];
/**
 * With --skip-collisions, a sheet row is dropped when its code belongs to a
 * different person in the ERP. "Different person" means the first name differs:
 * "RAHEEF" vs "Raheef M" is the same human written two ways, "BILAL M SHAREEF"
 * vs "Shahid Ameen" is not.
 */
const SKIP_COLLISIONS = args.includes("--skip-collisions");

const log = (...a) => console.log(...a);

async function fetchTab(gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error(`Sheet ${gid} returned ${res.status}`);
  return parseCsv(await res.text());
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const staff = await db.collection("staff").find({}).toArray();
  const byCode = new Map();
  for (const s of staff) {
    const code = codeOf(s.employeeCode);
    if (code) byCode.set(code, s);
  }
  log(`ERP roster: ${staff.length} staff, ${byCode.size} with an employee code`);
  log(COMMIT ? "MODE: COMMIT — writing to the database\n" : "MODE: DRY RUN — nothing will be written\n");

  const collisions = new Map();
  const skippedCollisions = new Set();
  const resigned = new Set();
  const unmatched = new Set();

  /** Resolves a sheet row to an ERP staff doc, recording anything suspicious. */
  function resolve(code, sheetName) {
    const hit = resolveSheetRow(code, sheetName);
    if (hit.kind === "resigned") {
      resigned.add(hit.who);
      return null;
    }
    if (hit.kind === "none") return null;

    const s = byCode.get(hit.code);
    if (!s) {
      unmatched.add(`${hit.code} ${clean(sheetName)}`);
      return null;
    }
    if (hit.kind === "alias") return s;

    const erpName = nameKey(`${s.firstName ?? ""} ${s.lastName ?? ""}`);
    const swapped = Boolean(erpName && hit.who && erpName.split(" ")[0] !== hit.who.split(" ")[0]);
    if (erpName && hit.who && erpName !== hit.who && !collisions.has(hit.code)) {
      collisions.set(hit.code, {
        code: hit.code,
        sheet: clean(sheetName),
        erp: `${s.firstName} ${s.lastName}`,
        swapped,
      });
    }
    if (swapped && SKIP_COLLISIONS) {
      skippedCollisions.add(hit.code);
      return null;
    }
    return s;
  }

  if (phaseArg === "all" || phaseArg === "attendance") await importAttendance(db, resolve);
  if (phaseArg === "all" || phaseArg === "balances") await importBalances(db, resolve);

  if (collisions.size) {
    log("\n!! CODE MATCHES BUT NAME DOES NOT:");
    for (const c of collisions.values()) {
      const verdict = c.swapped
        ? SKIP_COLLISIONS
          ? "DIFFERENT PERSON — skipped"
          : "DIFFERENT PERSON — their days land on the wrong record"
        : "same person spelled differently — imported";
      log(`   ${c.code}: sheet "${c.sheet}" vs ERP "${c.erp}"  [${verdict}]`);
    }
    if (!SKIP_COLLISIONS && [...collisions.values()].some((c) => c.swapped)) {
      log("   Re-run with --skip-collisions to leave those people out.");
    }
  }
  if (resigned.size) {
    log(`\nSkipped ${resigned.size} employee(s) who have left: ${[...resigned].sort().join(", ")}`);
  }
  if (unmatched.size) {
    log(`\nSkipped ${unmatched.size} sheet row(s) with no matching ERP employee code:`);
    for (const u of [...unmatched].sort()) log(`   ${u}`);
  }
  if (!COMMIT) log("\nDry run complete. Re-run with --commit to write.");
  await mongoose.disconnect();
}

// ==================== Attendance ====================

async function importAttendance(db, resolve) {
  log(`--- Phase: attendance (${MONTH_TABS[0].name}..${MONTH_TABS.at(-1).name} ${YEAR}) ---`);
  const attendance = db.collection("attendance");
  const unknownCodes = new Map();
  let inserted = 0;
  let overwritten = 0;

  // One read of the year's existing staff+day keys, so a dry run can report what
  // it would overwrite without a round trip per cell.
  const existing = await attendance
    .find(
      { date: { $gte: midnight(YEAR, 1, 1), $lte: midnight(YEAR, 12, 31) } },
      { projection: { staffId: 1, date: 1 } }
    )
    .toArray();
  const keyOf = (staffId, date) =>
    `${staffId}|${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const existingKeys = new Set(existing.map((a) => keyOf(String(a.staffId), new Date(a.date))));

  for (const tab of MONTH_TABS) {
    const rows = await fetchTab(tab.gid);
    // Row 1 carries the weekday names, row 2 the day numbers, data starts at row 3.
    const dayNumbers = rows[2].slice(4).map((c) => clean(c));
    const writes = [];
    let monthInserted = 0;
    let monthOverwritten = 0;

    for (const r of rows.slice(3)) {
      if (r.length < 5 || isSectionRow(r[1])) continue;
      const s = resolve(r[2], r[1]);
      if (!s) continue;
      const staffId = String(s._id);

      for (let j = 0; j < dayNumbers.length; j++) {
        const day = Number(dayNumbers[j]);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        const raw = codeOf(r[4 + j]);
        if (!raw) continue;
        const mapped = CODE_MAP[raw];
        if (mapped === null) continue; // deliberately untracked
        if (!mapped) {
          unknownCodes.set(raw, (unknownCodes.get(raw) ?? 0) + 1);
          continue;
        }

        const date = midnight(YEAR, tab.month, day);
        // The sheet knows the day's status and nothing else. Where a biometric
        // record already exists its punch times, hours and lateness flags stay
        // put — only what the sheet actually asserts is overwritten.
        const set = {
          status: mapped.status,
          source: "sheet",
          importBatchId: IMPORT_TAG,
          isDeleted: false,
          updatedAt: new Date(),
          ...(mapped.remarks ? { remarks: mapped.remarks } : {}),
        };
        const onInsert = { staffId, date, isLate: false, isEarlyDeparture: false, createdAt: new Date() };

        if (existingKeys.has(keyOf(staffId, date))) monthOverwritten++;
        else monthInserted++;
        if (COMMIT) {
          writes.push({
            updateOne: { filter: { staffId, date }, update: { $set: set, $setOnInsert: onInsert }, upsert: true },
          });
        }
      }
    }

    if (COMMIT && writes.length) await attendance.bulkWrite(writes, { ordered: false });
    log(`  ${tab.name}: ${monthInserted} new, ${monthOverwritten} overwritten`);
    inserted += monthInserted;
    overwritten += monthOverwritten;
  }

  log(`  TOTAL: ${inserted} new, ${overwritten} overwritten (sheet wins on overlap)`);
  if (unknownCodes.size) {
    log(`  !! Unmapped day codes seen: ${[...unknownCodes].map(([c, n]) => `${c}x${n}`).join(" ")}`);
  }
}

// ==================== Balances ====================

async function importBalances(db, resolve) {
  log("\n--- Phase: balances (CL/EL/ML tab) ---");
  const rows = await fetchTab(BALANCE_GID);
  const adjustments = db.collection("leave_adjustments");
  const pending = [];
  const unreconciled = [];
  let people = 0;

  for (const r of rows.slice(2)) {
    if (r.length < COL.total || isSectionRow(r[1])) continue;
    const s = resolve(r[2], r[1]);
    if (!s) continue;
    people++;

    const base = {
      staffId: String(s._id),
      staffName: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
      departmentId: s.departmentId,
      importTag: IMPORT_TAG,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { quota, adjustments: rowAdjustments, sheet } = buildBalanceAdjustments(r, base);
    for (const bucket of BUCKETS) {
      if (!sheet.monthsReconcile[bucket] && sheet.used[bucket] > 0) {
        unreconciled.push(`${base.staffName} ${bucket}`);
      }
    }

    // Per-staff quota override, so permanent staff keep the sheet's blank (zero)
    // allocation instead of inheriting the flat 15/15/15 policy.
    if (COMMIT) {
      await db.collection("staff").updateOne({ _id: s._id }, { $set: { leaveQuota: quota, updatedAt: new Date() } });
    }
    pending.push(...rowAdjustments);
  }

  // Permanent staff carry a deficit on the sheet — Rashid is at CL -3 — and the
  // ledger floors a bucket at zero unless the policy says otherwise, so the
  // migrated numbers would read as 0 without this.
  const settings = await db.collection("settings").findOne({});
  const negativeTypes = settings?.leavePolicy?.negativeEmploymentTypes ?? [];
  const needsNegative = !negativeTypes.includes("permanent");
  if (needsNegative && COMMIT && settings?._id) {
    await db.collection("settings").updateOne(
      { _id: settings._id },
      { $set: { "leavePolicy.negativeEmploymentTypes": [...negativeTypes, "permanent"], updatedAt: new Date() } }
    );
  }
  if (needsNegative) {
    log(`  leavePolicy.negativeEmploymentTypes ${COMMIT ? "set to" : "would be set to"} ["permanent"] — without it the sheet deficits read as 0`);
  }

  if (unreconciled.length) {
    log(`  ${unreconciled.length} bucket(s) where the sheet month cells do not add up to USED — USED kept, months dropped:`);
    log(`     ${unreconciled.join(", ")}`);
  }

  if (COMMIT) {
    const removed = await adjustments.deleteMany({ importTag: IMPORT_TAG, year: YEAR });
    if (pending.length) await adjustments.insertMany(pending);
    log(`  ${people} staff matched · ${people} quota override(s) written`);
    log(`  ${removed.deletedCount} previous migrated adjustment(s) removed, ${pending.length} written`);
  } else {
    log(`  ${people} staff matched · ${people} quota override(s) would be written`);
    log(`  ${pending.length} leave adjustment(s) would be written`);
    const byBucket = BUCKETS.map((b) => `${b} ${pending.filter((p) => p.bucket === b).length}`);
    log(`  by bucket: ${byBucket.join(" · ")}`);
  }
}

main().catch(async (err) => {
  console.error("Import failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
