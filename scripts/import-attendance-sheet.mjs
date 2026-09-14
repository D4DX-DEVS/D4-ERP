/**
 * Migrate the D4 attendance Google Sheet into the ERP, January to August 2026.
 *
 *   Phase "staff"        sheet people the ERP has never held -> relieved records
 *   Phase "attendance"   the eight daily grids -> `attendance`
 *   Phase "entitlement"  the CL/EL/ML tab -> staff quota overrides + FL openings
 *   Phase "reconcile"    leave days on the register -> `leave_adjustments`
 *
 * The design this follows is docs/superpowers/specs/2026-09-14-attendance-sheet-full-import-design.md.
 * The short version: the daily grids are the record of what was taken, so usage
 * is counted off them day by day. The balance tab supplies entitlement only —
 * its USED column is a month behind and disagrees with its own grids for about
 * half the roster, and posting it as well would deduct every leave day twice.
 *
 * The mappings and the arithmetic live in scripts/lib/sheet-import.mjs and are
 * unit-tested in src/lib/leave-sheet-import.test.ts; this file is the IO around
 * them. Staff match by name where the sheet is known to reuse a code for two
 * people, and by employee code everywhere else.
 *
 * Every phase is idempotent. Attendance folds onto the row the register already
 * shows for that staff member and *local day* — not the stored instant, because
 * the writers disagree about midnight — so an existing biometric row keeps its
 * punch times, working hours and lateness flags and only takes the status the
 * sheet asserts. A day a person edited by hand in the app is left to them.
 * Entitlement adjustments carry importTag "sheet-2026" and are rewritten on
 * every run. The reconcile finds its own rows again by the attendance day that
 * caused them, so a second pass writes nothing.
 *
 * Run: node scripts/import-attendance-sheet.mjs                  (dry run)
 *      node scripts/import-attendance-sheet.mjs --commit
 *      node scripts/import-attendance-sheet.mjs --phase=reconcile --commit
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
  buildEntitlement,
  buildFormerStaffDoc,
  buildVariance,
  clean,
  codeOf,
  isSectionRow,
  midnight,
  SECTION_LABELS,
  parseCsv,
  resolveSheetRow,
  titleCase,
} from "./lib/sheet-import.mjs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const PHASES = ["staff", "attendance", "entitlement", "reconcile"];
const phaseArg = (args.find((a) => a.startsWith("--phase=")) ?? "--phase=all").split("=")[1];
const runs = (phase) => phaseArg === "all" || phaseArg === phase;

/** Statuses that draw a leave bucket down, and which bucket each one draws. */
const BUCKET_FOR_STATUS = {
  "casual-leave": "CL",
  "earned-leave": "EL",
  "medical-leave": "ML",
  "full-leave": "FL",
};

const log = (...a) => console.log(...a);
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchTab(gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error(`Sheet ${gid} returned ${res.status}`);
  return parseCsv(await res.text());
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (phaseArg !== "all" && !PHASES.includes(phaseArg)) {
    throw new Error(`--phase must be one of: all, ${PHASES.join(", ")}`);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  log("Reading the sheet…");
  const grids = [];
  for (const tab of MONTH_TABS) grids.push({ ...tab, rows: await fetchTab(tab.gid) });
  const balanceRows = await fetchTab(BALANCE_GID);

  const sheetPeople = indexGridPeople(grids);
  const balanceByCode = indexBalanceRows(balanceRows);
  log(`Sheet: ${sheetPeople.size} people across ${grids.length} monthly tabs, ${balanceByCode.size} balance rows`);

  let roster = await loadRoster(db);
  log(`ERP roster: ${roster.size} staff with an employee code`);
  log(COMMIT ? "MODE: COMMIT — writing to the database\n" : "MODE: DRY RUN — nothing will be written\n");

  if (runs("staff")) roster = await importFormerStaff(db, sheetPeople, balanceByCode, roster);

  const attendancePlan = runs("attendance") ? await importAttendance(db, grids, roster) : [];
  const entitlement = runs("entitlement") ? await importEntitlement(db, balanceRows, roster) : new Map();
  const usage = runs("reconcile") ? await reconcileLeaveDays(db, roster, attendancePlan) : new Map();

  if (entitlement.size && usage.size) reportVariance(entitlement, usage);

  const missing = [...sheetPeople.values()].filter((p) => !roster.has(p.code));
  if (missing.length) {
    log(`\n${missing.length} sheet row(s) still without an ERP record (run --phase=staff to create them):`);
    for (const p of missing) log(`   ${p.code} ${p.name}`);
  }

  if (!COMMIT) log("\nDry run complete. Re-run with --commit to write.");
  await mongoose.disconnect();
}

// ==================== Sheet indexes ====================

/**
 * Everyone the daily grids carry, keyed by the ERP employee code their row
 * resolves to. A person can appear under two codes and in two bands across the
 * year, so the months are accumulated rather than taken from the first row seen.
 */
function indexGridPeople(grids) {
  const people = new Map();
  for (const grid of grids) {
    const dayNumbers = grid.rows[2].slice(4).map(clean);
    let band = "";
    for (const row of grid.rows.slice(3)) {
      const label = clean(row[1]).toUpperCase();
      if (SECTION_LABELS.includes(label)) {
        band = label;
        continue;
      }
      if (row.length < 5 || !label) continue;
      const hit = resolveSheetRow(row[2], row[1]);
      if (hit.kind === "none") continue;

      let person = people.get(hit.code);
      if (!person) {
        person = {
          code: hit.code,
          name: titleCase(row[1]),
          section: band,
          department: clean(row[3]),
          firstMonth: grid.month,
          lastMonth: grid.month,
          lastDay: null,
        };
        people.set(hit.code, person);
      }
      person.firstMonth = Math.min(person.firstMonth, grid.month);
      person.lastMonth = Math.max(person.lastMonth, grid.month);
      if (band) person.section = band;
      if (!person.department && clean(row[3])) person.department = clean(row[3]);

      // The last day the sheet says anything about this person, which is the
      // closest the sheet comes to stating when somebody left.
      for (let j = 0; j < dayNumbers.length; j++) {
        const day = Number(dayNumbers[j]);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        if (!codeOf(row[4 + j])) continue;
        const date = midnight(YEAR, grid.month, day);
        if (!person.lastDay || date > person.lastDay) person.lastDay = date;
      }
    }
  }
  return people;
}

/** The CL/EL/ML rows, keyed by the same resolved employee code. */
function indexBalanceRows(rows) {
  const byCode = new Map();
  for (const row of rows.slice(2)) {
    if (row.length < COL.total || isSectionRow(row[1])) continue;
    const hit = resolveSheetRow(row[2], row[1]);
    if (hit.kind === "none") continue;
    byCode.set(hit.code, { row, designation: clean(row[3]), section: clean(row[4]), name: titleCase(row[1]) });
  }
  return byCode;
}

async function loadRoster(db) {
  const staff = await db.collection("staff").find({}).toArray();
  const byCode = new Map();
  for (const s of staff) {
    const code = codeOf(s.employeeCode);
    if (code) byCode.set(code, s);
  }
  return byCode;
}

// ==================== Phase: former staff ====================

/**
 * Gives every sheet person without an ERP record a relieved, soft-deleted one.
 *
 * Their months are real history and the register is where it belongs, so the
 * alternative — dropping them — leaves eight months of the sheet unimportable
 * and the grids missing whole rows.
 */
async function importFormerStaff(db, sheetPeople, balanceByCode, roster) {
  log("--- Phase: staff (sheet people the ERP has never held) ---");
  const missing = [...sheetPeople.values()].filter((p) => !roster.has(p.code));
  if (!missing.length) {
    log("  Every sheet person already has an ERP record.\n");
    return roster;
  }

  const companyId = String((await db.collection("companies").findOne({}))?._id ?? "");
  const departments = await db.collection("departments").find({}).toArray();
  const departmentFor = matchDepartment(departments, roster);
  const departmentName = new Map(departments.map((d) => [String(d._id), d.name]));

  const docs = [];
  for (const person of missing.sort((a, b) => a.code.localeCompare(b.code))) {
    const balance = balanceByCode.get(person.code);
    const doc = buildFormerStaffDoc({
      name: person.name,
      code: person.code,
      section: balance?.section || person.section,
      designation: balance?.designation ?? "",
      firstMonth: person.firstMonth,
      lastDay: person.lastDay,
      departmentId: departmentFor(person.code, balance?.section, person.department),
      companyId,
    });
    docs.push(doc);
    const months = `${MONTH_TABS[person.firstMonth - 1].name.slice(0, 3)}–${MONTH_TABS[person.lastMonth - 1].name.slice(0, 3)}`;
    log(
      `  ${COMMIT ? "creating" : "would create"} ${doc.employeeCode.padEnd(12)} ${`${doc.firstName} ${doc.lastName}`.padEnd(22)}` +
        ` ${doc.employmentType.padEnd(9)} ${months}  joined ${dayKey(doc.dateOfJoining)} (approx)` +
        `  last day ${doc.deletedAt ? dayKey(doc.deletedAt) : "—"}` +
        `  dept ${departmentName.get(doc.departmentId) ?? "— unmatched —"}`
    );
  }

  if (COMMIT) {
    await db.collection("staff").insertMany(docs);
    log(`  ${docs.length} relieved record(s) created`);
    return loadRoster(db);
  }
  log(`  ${docs.length} relieved record(s) would be created — dry run, so later phases will skip them`);
  return roster;
}

/**
 * Which ERP department a former staff member belonged to.
 *
 * The sheet's DEPT column is not a department column: it holds "D4 EVENTS" for
 * some people and "CREATIVE DIRECTOR" or "CEO" for others, and even where it is
 * a department the names do not line up — "DIGITAL OUTREACH" covers two ERP
 * departments. So the text is tried first, and what it cannot answer is taken
 * from the employee code prefix, read off the colleagues who share it: every
 * D4D on the roster sits in one department, so a D4D who has left belongs there
 * too.
 */
function matchDepartment(departments, roster) {
  const normalise = (v) => clean(v).toUpperCase().replace(/^D4\s*/, "").replace(/[^A-Z]/g, "");
  const byName = new Map();
  for (const d of departments) {
    const key = normalise(d.name);
    if (key) byName.set(key, String(d._id));
  }

  // Employee code prefix -> the department most of that prefix's holders are in.
  const counts = new Map();
  for (const [code, staff] of roster) {
    const prefix = code.split("-")[0];
    const id = String(staff.departmentId ?? "");
    if (!prefix || !id) continue;
    if (!counts.has(prefix)) counts.set(prefix, new Map());
    const tally = counts.get(prefix);
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const byPrefix = new Map(
    [...counts].map(([prefix, tally]) => [prefix, [...tally].sort((a, b) => b[1] - a[1])[0][0]])
  );

  const fromText = (value) => {
    const key = normalise(value ?? "");
    if (!key) return "";
    if (byName.has(key)) return byName.get(key);
    for (const [name, id] of byName) {
      if (name.length >= 4 && (name.startsWith(key) || key.startsWith(name))) return id;
      // "MANAGEMANT" is how the sheet spells Management.
      if (name.length >= 5 && key.length >= 5 && name.slice(0, 5) === key.slice(0, 5)) return id;
    }
    return "";
  };

  return (code, ...texts) => {
    for (const text of texts) {
      const hit = fromText(text);
      if (hit) return hit;
    }
    return byPrefix.get(String(code).split("-")[0]) ?? "";
  };
}

// ==================== Phase: attendance ====================

async function importAttendance(db, grids, roster) {
  log(`--- Phase: attendance (${MONTH_TABS[0].name}..${MONTH_TABS.at(-1).name} ${YEAR}) ---`);
  const attendance = db.collection("attendance");
  const unknownCodes = new Map();
  const planned = [];
  let inserted = 0;
  let updated = 0;
  let kept = 0;
  let removed = 0;

  // Every row the year already holds, grouped by staff and *local* day rather
  // than by the stored instant. The writers disagree about midnight — the ESSL
  // import stores UTC midnight, this app stores server-local — so matching on
  // the instant finds nothing and quietly files a second row for a day that is
  // already there. Grouping by the day is what makes the upsert an upsert.
  const byDay = new Map();
  const existing = await attendance
    .find(
      { date: { $gte: midnight(YEAR, 1, 1), $lte: midnight(YEAR, 12, 31) } },
      { projection: { staffId: 1, date: 1, status: 1, source: 1, importBatchId: 1, updatedAt: 1, createdAt: 1, isDeleted: 1 } }
    )
    .toArray();
  for (const row of existing) {
    if (row.isDeleted) continue;
    const key = `${row.staffId}|${dayKey(new Date(row.date))}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(row);
  }

  for (const grid of grids) {
    const dayNumbers = grid.rows[2].slice(4).map(clean);
    const writes = [];
    const stale = [];
    let monthInserted = 0;
    let monthUpdated = 0;
    let monthKept = 0;

    for (const row of grid.rows.slice(3)) {
      if (row.length < 5 || isSectionRow(row[1])) continue;
      const hit = resolveSheetRow(row[2], row[1]);
      const staff = hit.kind === "none" ? null : roster.get(hit.code);
      if (!staff) continue;
      const staffId = String(staff._id);

      for (let j = 0; j < dayNumbers.length; j++) {
        const day = Number(dayNumbers[j]);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        const raw = codeOf(row[4 + j]);
        if (!raw) continue;
        const mapped = CODE_MAP[raw];
        if (mapped === null) continue; // deliberately untracked
        if (!mapped) {
          unknownCodes.set(raw, (unknownCodes.get(raw) ?? 0) + 1);
          continue;
        }

        const date = midnight(YEAR, grid.month, day);
        planned.push({ staffId, date, status: mapped.status });

        // The sheet knows the day's status and nothing else. Where a record
        // already exists its punch times, hours and lateness flags stay put —
        // only what the sheet actually asserts is overwritten.
        const set = {
          status: mapped.status,
          source: "sheet",
          importBatchId: IMPORT_TAG,
          isDeleted: false,
          updatedAt: new Date(),
          ...(mapped.remarks ? { remarks: mapped.remarks } : {}),
        };

        const group = byDay.get(`${staffId}|${dayKey(date)}`) ?? [];
        if (!group.length) {
          monthInserted++;
          if (COMMIT) {
            writes.push({
              insertOne: {
                document: { ...set, staffId, date, isLate: false, isEarlyDeparture: false, createdAt: new Date() },
              },
            });
          }
          continue;
        }

        // Fold onto the row the register itself would show, preferring one this
        // import did not write so its punch times survive.
        const others = group.filter((r) => r.source !== "sheet");
        const base = pickRow(others.length ? others : group);
        if (base.source === "correction" || base.source === "manual") {
          // A person decided this day in the app. The app's own precedence puts
          // that above an import, so the sheet does not overrule it.
          monthKept++;
        } else {
          monthUpdated++;
          if (COMMIT) writes.push({ updateOne: { filter: { _id: base._id }, update: { $set: set } } });
        }

        // Rows this migration added beside a day that already existed. They are
        // the bug this grouping fixes, and they are only ever ours to remove.
        for (const r of group) {
          if (r === base) continue;
          if (r.source === "sheet" && r.importBatchId === IMPORT_TAG) stale.push(r._id);
        }
      }
    }

    if (COMMIT && writes.length) await attendance.bulkWrite(writes, { ordered: false });
    if (COMMIT && stale.length) await attendance.deleteMany({ _id: { $in: stale } });
    const healed = stale.length ? `, ${stale.length} duplicate(s) removed` : "";
    log(`  ${grid.name}: ${monthInserted} new, ${monthUpdated} updated, ${monthKept} left to a hand edit${healed}`);
    inserted += monthInserted;
    updated += monthUpdated;
    kept += monthKept;
    removed += stale.length;
  }

  log(`  TOTAL: ${inserted} new, ${updated} updated, ${kept} left to a hand edit, ${removed} duplicate(s) removed`);
  if (unknownCodes.size) {
    log(`  !! Unmapped day codes seen: ${[...unknownCodes].map(([c, n]) => `${c}x${n}`).join(" ")}`);
  }
  return planned;
}

/**
 * The one row a day should be read from, chosen the way every view chooses it:
 * a correction beats a hand edit beats an import, and the newest write wins a
 * tie. Mirrors `pickAttendanceRecord` in src/lib/attendance-dedupe.ts.
 */
function pickRow(rows) {
  const rank = (r) => (r.source === "correction" ? 3 : r.source === "manual" ? 2 : 1);
  const at = (r) => new Date(r.updatedAt ?? r.createdAt ?? 0).getTime();
  return rows.reduce((best, r) => {
    if (rank(r) !== rank(best)) return rank(r) > rank(best) ? r : best;
    if (at(r) !== at(best)) return at(r) > at(best) ? r : best;
    if (best.status === "absent" && r.status !== "absent") return r;
    return best;
  });
}

// ==================== Phase: entitlement ====================

/**
 * Writes what each person was entitled to, and nothing about what they took.
 * Usage is the reconcile's job, off the register.
 */
async function importEntitlement(db, balanceRows, roster) {
  log("\n--- Phase: entitlement (CL/EL/ML tab) ---");
  const adjustments = db.collection("leave_adjustments");
  const pending = [];
  const entitlement = new Map();

  for (const row of balanceRows.slice(2)) {
    if (row.length < COL.total || isSectionRow(row[1])) continue;
    const hit = resolveSheetRow(row[2], row[1]);
    const staff = hit.kind === "none" ? null : roster.get(hit.code);
    if (!staff) continue;

    const base = {
      staffId: String(staff._id),
      staffName: `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim(),
      departmentId: staff.departmentId,
      importTag: IMPORT_TAG,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { quota, adjustments: rows, sheet } = buildEntitlement(row, base);
    entitlement.set(String(staff._id), { name: base.staffName, code: hit.code, sheet });
    pending.push(...rows);

    // Per-staff quota override, so permanent staff keep the sheet's blank (zero)
    // allocation instead of inheriting the flat 15/15/15 policy.
    if (COMMIT) {
      await db.collection("staff").updateOne({ _id: staff._id }, { $set: { leaveQuota: quota, updatedAt: new Date() } });
    }
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

  if (COMMIT) {
    const removed = await adjustments.deleteMany({ importTag: IMPORT_TAG, year: YEAR });
    if (pending.length) await adjustments.insertMany(pending);
    log(`  ${entitlement.size} staff matched · ${entitlement.size} quota override(s) written`);
    log(`  ${removed.deletedCount} previous migrated adjustment(s) removed, ${pending.length} FL opening(s) written`);
  } else {
    log(`  ${entitlement.size} staff matched · ${entitlement.size} quota override(s) would be written`);
    log(`  ${pending.length} FL opening credit(s) would be written, no usage — the register supplies that`);
  }
  return entitlement;
}

// ==================== Phase: reconcile ====================

/**
 * Posts one ledger debit per leave day the register carries.
 *
 * This is the script's copy of `reconcileAttendanceLeave`, which the Reconcile
 * button on Leave Balances runs — same rule, same `sourceAttendanceId` tag, so
 * pressing the button afterwards finds nothing left to do. Days an approved
 * request already consumed are skipped: the request moved the balance once
 * already.
 */
async function reconcileLeaveDays(db, roster, attendancePlan) {
  log("\n--- Phase: reconcile (leave days on the register -> ledger) ---");
  const adjustments = db.collection("leave_adjustments");
  const staffById = new Map([...roster.values()].map((s) => [String(s._id), s]));

  const rows = await db
    .collection("attendance")
    .find(
      { date: { $gte: midnight(YEAR, 1, 1), $lte: midnight(YEAR, 12, 31) } },
      {
        projection: {
          staffId: 1, date: 1, status: 1, source: 1, leaveRequestId: 1, isDeleted: 1, updatedAt: 1, createdAt: 1,
        },
      }
    )
    .toArray();

  // One row per staff member per day, chosen the way the register shows it — a
  // day can hold several live rows because the writers disagree about midnight,
  // and a day shown once must be deducted once. This mirrors `oneRowPerDay` in
  // src/lib/leave-attendance-sync.ts, so pressing Reconcile in the app after
  // this run finds nothing left to do.
  const byDay = new Map();
  for (const r of rows) {
    if (r.isDeleted) continue;
    const key = `${r.staffId}|${dayKey(new Date(r.date))}`;
    const held = byDay.get(key);
    byDay.set(key, held ? pickRow([held, r]) : r);
  }
  const effective = [...byDay.values()].map((r) => ({
    id: String(r._id),
    staffId: r.staffId,
    date: new Date(r.date),
    status: r.status,
    source: r.source,
    leaveRequestId: r.leaveRequestId,
  }));

  // A dry run has written nothing, so the register still holds whatever it held
  // before — including biometric rows on days the sheet marks as leave. Folding
  // the planned days over the top is what makes the preview show the counts a
  // real run would produce; without it every day the import would overwrite is
  // counted at its old status.
  if (!COMMIT) {
    const plannedByDay = new Map(effective.map((r) => [`${r.staffId}|${dayKey(r.date)}`, r]));
    for (const p of attendancePlan) {
      const key = `${p.staffId}|${dayKey(p.date)}`;
      const existing = plannedByDay.get(key);
      if (existing) {
        // The attendance phase leaves a hand edit alone, so the preview must too.
        if (existing.source !== "correction" && existing.source !== "manual") existing.status = p.status;
        continue;
      }
      const row = { id: `planned:${key}`, staffId: p.staffId, date: p.date, status: p.status };
      plannedByDay.set(key, row);
      effective.push(row);
    }
  }

  const coveredDays = await approvedRequestDays(db);
  const existing = await adjustments.find({ year: YEAR, sourceAttendanceId: { $exists: true } }).toArray();

  const wanted = new Map();
  const usage = new Map();
  let mismatched = 0;
  for (const row of effective) {
    if (row.isDeleted || row.leaveRequestId) continue;
    const bucket = BUCKET_FOR_STATUS[row.status];
    if (!bucket) continue;
    const staff = staffById.get(row.staffId);
    if (!staff) continue;
    const key = dayKey(row.date);
    if (coveredDays.has(`${row.staffId}|${key}`)) {
      mismatched++;
      continue;
    }
    wanted.set(row.id, { id: row.id, staffId: row.staffId, staff, dayKey: key, date: row.date, bucket });
    if (!usage.has(row.staffId)) usage.set(row.staffId, { CL: 0, EL: 0, ML: 0, FL: 0 });
    usage.get(row.staffId)[bucket] += 1;
  }

  const seen = new Set();
  const updates = [];
  const removals = [];
  for (const adjustment of existing) {
    seen.add(adjustment.sourceAttendanceId);
    const entry = wanted.get(adjustment.sourceAttendanceId);
    if (!entry) {
      removals.push(adjustment._id);
      continue;
    }
    if (adjustment.bucket !== entry.bucket || adjustment.days !== -1) updates.push({ _id: adjustment._id, entry });
  }
  const creates = [...wanted.values()].filter((e) => !seen.has(e.id));

  if (COMMIT) {
    if (creates.length) {
      await adjustments.insertMany(creates.map((e) => debitDoc(e)));
    }
    for (const { _id, entry } of updates) {
      await adjustments.updateOne(
        { _id },
        { $set: { bucket: entry.bucket, days: -1, reason: debitReason(entry), updatedAt: new Date() } }
      );
    }
    if (removals.length) await adjustments.deleteMany({ _id: { $in: removals } });
  }

  const verb = COMMIT ? "" : "would be ";
  log(`  ${creates.length} debit(s) ${verb}posted, ${updates.length} corrected, ${removals.length} withdrawn`);
  if (mismatched) log(`  ${mismatched} day(s) left alone because an approved request already covers them`);
  const totals = BUCKETS.map((b) => `${b} ${[...usage.values()].reduce((sum, u) => sum + u[b], 0)}`);
  log(`  leave days counted off the register: ${totals.join(" · ")}`);
  return usage;
}

function debitReason(entry) {
  return `${entry.bucket} marked on the attendance register for ${entry.dayKey}`;
}

function debitDoc(entry) {
  const staff = entry.staff;
  return {
    staffId: entry.staffId,
    staffName: `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim(),
    departmentId: staff.departmentId,
    year: YEAR,
    bucket: entry.bucket,
    kind: "attendance",
    days: -1,
    date: entry.date,
    reason: debitReason(entry),
    sourceAttendanceId: entry.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Staff+day keys an approved leave request already consumed. */
async function approvedRequestDays(db) {
  const requests = await db
    .collection("leaveRequests")
    .find({ status: "approved", type: { $in: ["leave", "long-leave"] } })
    .toArray();
  const covered = new Set();
  for (const request of requests) {
    if (!BUCKETS.includes(bucketForLeaveType(request.leaveType))) continue;
    const start = request.startDate ? new Date(request.startDate) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const end = request.endDate ? new Date(request.endDate) : start;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      covered.add(`${request.staffId}|${dayKey(cursor)}`);
    }
  }
  return covered;
}

/** Stored leave-type codes are legacy: SL holds Medical Leave, CO holds Flexible. */
function bucketForLeaveType(leaveType) {
  return { CL: "CL", SL: "ML", EL: "EL", CO: "FL" }[leaveType] ?? null;
}

// ==================== Variance report ====================

/**
 * What the ERP now says against what the sheet says. They are expected to
 * differ — the balance tab is a month behind and undercounts Jan–Jul — so this
 * is printed for the team to read, not acted on.
 */
function reportVariance(entitlement, usage) {
  log("\n--- Variance: ERP against the printed sheet ---");
  log("  staff                  bucket  entitled  sheet used  grid used  sheet bal  ERP bal   diff");
  let differing = 0;
  for (const [staffId, { name, sheet }] of entitlement) {
    const used = usage.get(staffId) ?? { CL: 0, EL: 0, ML: 0, FL: 0 };
    for (const line of buildVariance(sheet, used)) {
      if (line.diff === 0 && line.erpUsed === 0 && line.sheetUsed === 0) continue;
      if (line.diff !== 0) differing++;
      const mark = line.diff === 0 ? "  " : line.diff < 0 ? "<-" : "->";
      log(
        `  ${name.slice(0, 21).padEnd(22)} ${line.bucket.padEnd(6)} ${String(line.entitled).padStart(8)}` +
          ` ${String(line.sheetUsed).padStart(11)} ${String(line.erpUsed).padStart(10)}` +
          ` ${String(line.sheetBalance).padStart(10)} ${String(line.erpBalance).padStart(8)} ${mark}${String(line.diff).padStart(5)}`
      );
    }
  }
  log(`  ${differing} bucket(s) where the ERP and the sheet disagree — the grids carry days the balance tab never recorded`);
}

main().catch(async (err) => {
  console.error("Import failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
