/**
 * Check the ERP against the attendance sheet, person by person and day by day.
 *
 * Independent of scripts/import-attendance-sheet.mjs on purpose: it re-reads the
 * sheet and re-reads the database and compares them, rather than trusting the
 * counters the import printed. Two questions, for every person on the sheet:
 *
 *   Attendance  does the register show, for each day, the status the grid marks?
 *   Balances    does the ledger land where the grid's leave days say it should,
 *               and where does that differ from the balance tab's own numbers?
 *
 * A day can hold several live attendance rows — the ESSL import stores UTC
 * midnight and the app stores server-local, so both sit there — so the register's
 * own rule (correction > manual > import, newest wins) picks which one counts,
 * exactly as every view does.
 *
 * Run: node scripts/verify-attendance-sheet.mjs
 *      node scripts/verify-attendance-sheet.mjs --details   (list every mismatch)
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import {
  BALANCE_GID,
  BUCKETS,
  CODE_MAP,
  COL,
  MONTH_TABS,
  SHEET_ID,
  YEAR,
  clean,
  codeOf,
  isSectionRow,
  midnight,
  parseCsv,
  readBalanceRow,
  resolveSheetRow,
  round2,
} from "./lib/sheet-import.mjs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const DETAILS = process.argv.includes("--details");
const log = (...a) => console.log(...a);
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const BUCKET_FOR_STATUS = {
  "casual-leave": "CL",
  "earned-leave": "EL",
  "medical-leave": "ML",
  "full-leave": "FL",
};

async function fetchTab(gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error(`Sheet ${gid} returned ${res.status}`);
  return parseCsv(await res.text());
}

/** The row a day is read from, the way every view reads it. */
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

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  log("Reading the sheet…");
  const grids = [];
  for (const tab of MONTH_TABS) grids.push({ ...tab, rows: await fetchTab(tab.gid) });
  const balanceRows = await fetchTab(BALANCE_GID);

  // ---------- what the sheet says ----------
  /** code -> { name, days: Map<dayKey, status>, leave: {CL,EL,ML,FL} } */
  const sheet = new Map();
  const unmapped = new Map();
  for (const grid of grids) {
    const dayNumbers = grid.rows[2].slice(4).map(clean);
    for (const row of grid.rows.slice(3)) {
      if (row.length < 5 || isSectionRow(row[1])) continue;
      const hit = resolveSheetRow(row[2], row[1]);
      if (hit.kind === "none") continue;
      if (!sheet.has(hit.code)) {
        sheet.set(hit.code, {
          code: hit.code,
          name: clean(row[1]),
          days: new Map(),
          leave: { CL: 0, EL: 0, ML: 0, FL: 0 },
        });
      }
      const person = sheet.get(hit.code);
      for (let j = 0; j < dayNumbers.length; j++) {
        const day = Number(dayNumbers[j]);
        if (!Number.isInteger(day) || day < 1 || day > 31) continue;
        const raw = codeOf(row[4 + j]);
        if (!raw) continue;
        const mapped = CODE_MAP[raw];
        if (mapped === null) continue;
        if (!mapped) {
          unmapped.set(raw, (unmapped.get(raw) ?? 0) + 1);
          continue;
        }
        person.days.set(dayKey(midnight(YEAR, grid.month, day)), { code: raw, status: mapped.status });
        if (BUCKETS.includes(raw)) person.leave[raw] += 1;
      }
    }
  }

  const balance = new Map();
  for (const row of balanceRows.slice(2)) {
    if (row.length < COL.total || isSectionRow(row[1])) continue;
    const hit = resolveSheetRow(row[2], row[1]);
    if (hit.kind === "none") continue;
    balance.set(hit.code, readBalanceRow(row));
  }

  // ---------- what the ERP says ----------
  const staff = await db.collection("staff").find({}).toArray();
  const byCode = new Map(staff.map((s) => [codeOf(s.employeeCode), s]));

  const attendance = await db
    .collection("attendance")
    // The whole year, not Jan..Aug: a day is stored at UTC midnight by the ESSL
    // import and at server-local midnight by the app, so an August 31 row can sit
    // on either side of an August 31 bound. The comparison keys on the local day,
    // so widening the query is what makes the last day of the window visible.
    .find({ date: { $gte: midnight(YEAR, 1, 1), $lte: midnight(YEAR, 12, 31) } })
    .toArray();
  /** staffId -> Map<dayKey, row> after the register's own duplicate rule. */
  const erpDays = new Map();
  for (const r of attendance) {
    if (r.isDeleted) continue;
    const id = String(r.staffId);
    if (!erpDays.has(id)) erpDays.set(id, new Map());
    const days = erpDays.get(id);
    const key = dayKey(new Date(r.date));
    const held = days.get(key);
    days.set(key, held ? pickRow([held, r]) : r);
  }

  const adjustments = await db.collection("leave_adjustments").find({ year: YEAR }).toArray();
  const adjustmentsByStaff = new Map();
  for (const a of adjustments) {
    const id = String(a.staffId);
    if (!adjustmentsByStaff.has(id)) adjustmentsByStaff.set(id, []);
    adjustmentsByStaff.get(id).push(a);
  }

  const requests = await db
    .collection("leaveRequests")
    .find({ status: "approved", type: { $in: ["leave", "long-leave"] } })
    .toArray();
  const requestDays = new Map();
  for (const req of requests) {
    const bucket = { CL: "CL", SL: "ML", EL: "EL", CO: "FL" }[req.leaveType];
    if (!bucket || !req.startDate) continue;
    const id = String(req.staffId);
    if (!requestDays.has(id)) requestDays.set(id, { CL: 0, EL: 0, ML: 0, FL: 0 });
    const end = req.endDate ? new Date(req.endDate) : new Date(req.startDate);
    let days = 0;
    for (const c = new Date(req.startDate); c <= end; c.setDate(c.getDate() + 1)) days++;
    requestDays.get(id)[bucket] += req.isHalfDay ? 0.5 : Math.max(1, days);
  }

  const settings = await db.collection("settings").findOne({});
  const negativeTypes = settings?.leavePolicy?.negativeEmploymentTypes ?? [];
  const policyQuota = settings?.leavePolicy ?? {};

  // ---------- compare ----------
  let totalDays = 0;
  let totalMatched = 0;
  const problems = [];
  const rows = [];

  for (const [code, person] of [...sheet].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const s = byCode.get(code);
    if (!s) {
      problems.push(`NO ERP RECORD: ${code} ${person.name} (${person.days.size} sheet days)`);
      continue;
    }
    const id = String(s._id);
    const days = erpDays.get(id) ?? new Map();

    let matched = 0;
    const wrong = [];
    for (const [key, cell] of person.days) {
      const row = days.get(key);
      if (!row) {
        wrong.push({ key, want: cell.code, got: "(no row)" });
        continue;
      }
      if (row.status === cell.status) matched++;
      else wrong.push({ key, want: `${cell.code}/${cell.status}`, got: row.status, source: row.source });
    }
    // Days the ERP holds inside the sheet's window that the sheet never marked.
    const lastSheetDay = [...person.days.keys()].sort().at(-1) ?? "";
    const extra = [...days.keys()].filter((k) => k <= lastSheetDay && !person.days.has(k));

    totalDays += person.days.size;
    totalMatched += matched;

    // Ledger: entitlement from quota + credits, usage from debits + approved requests.
    const quota = s.leaveQuota ?? {};
    const quotaFor = {
      CL: quota.casualLeave ?? policyQuota.casualLeave ?? 0,
      EL: quota.earnedLeave ?? policyQuota.earnedLeave ?? 0,
      ML: quota.sickLeave ?? policyQuota.sickLeave ?? 0,
      FL: 0,
    };
    const credit = { CL: 0, EL: 0, ML: 0, FL: 0 };
    const debit = { CL: 0, EL: 0, ML: 0, FL: 0 };
    // Split in two: what the migrated months account for, and what happened
    // after them. Only the first half is comparable to the grid — a day taken in
    // September is real usage the sheet was never going to know about.
    const inWindow = { CL: 0, EL: 0, ML: 0, FL: 0 };
    const afterWindow = { CL: 0, EL: 0, ML: 0, FL: 0 };
    const windowEnd = midnight(YEAR, 8, 31);
    for (const a of adjustmentsByStaff.get(id) ?? []) {
      if (!BUCKETS.includes(a.bucket)) continue;
      if (a.days >= 0) {
        credit[a.bucket] += a.days;
        continue;
      }
      debit[a.bucket] += -a.days;
      const when = a.date ? new Date(a.date) : null;
      if (when && dayKey(when) <= dayKey(windowEnd)) inWindow[a.bucket] += -a.days;
      else afterWindow[a.bucket] += -a.days;
    }
    const fromRequests = requestDays.get(id) ?? { CL: 0, EL: 0, ML: 0, FL: 0 };
    const allowNegative = negativeTypes.includes(s.employmentType ?? "staff");
    const sheetBalance = balance.get(code);

    const buckets = BUCKETS.map((b) => {
      const entitled = round2(quotaFor[b] + credit[b]);
      const used = round2(debit[b] + fromRequests[b]);
      const raw = round2(entitled - used);
      return {
        bucket: b,
        entitled,
        used,
        balance: allowNegative ? raw : Math.max(0, raw),
        gridDays: person.leave[b],
        fromGridDays: round2(inWindow[b]),
        later: round2(afterWindow[b] + fromRequests[b]),
        sheetUsed: sheetBalance?.used[b] ?? null,
        sheetBalance: sheetBalance?.balance[b] ?? null,
      };
    });

    rows.push({ code, name: person.name, staff: s, matched, wrong, extra, buckets, sheetDays: person.days.size });
  }

  // ---------- report ----------
  log(`\nSheet: ${sheet.size} people · ERP: ${staff.length} staff records`);
  if (unmapped.size) log(`!! Unmapped sheet day codes: ${[...unmapped].map(([c, n]) => `${c}x${n}`).join(" ")}`);
  for (const p of problems) log(`!! ${p}`);

  log("\n==================== ATTENDANCE, day by day ====================");
  log("person                   code         sheet days  matched  differ  extra ERP days");
  for (const r of rows) {
    const flag = r.wrong.length ? " <-" : "";
    log(
      `${r.name.slice(0, 24).padEnd(25)}${r.code.padEnd(13)}${String(r.sheetDays).padStart(10)}` +
        `${String(r.matched).padStart(9)}${String(r.wrong.length).padStart(8)}${String(r.extra.length).padStart(15)}${flag}`
    );
  }
  log(`\nTOTAL: ${totalMatched} of ${totalDays} sheet cells match the register (${round2((totalMatched / totalDays) * 100)}%)`);

  const differing = rows.filter((r) => r.wrong.length);
  if (differing.length) {
    log(`\n${differing.length} person(s) with at least one day that differs:`);
    for (const r of differing) {
      const shown = DETAILS ? r.wrong : r.wrong.slice(0, 4);
      for (const w of shown) {
        log(`   ${r.name.slice(0, 20).padEnd(21)} ${w.key}  sheet ${String(w.want).padEnd(22)} ERP ${w.got}${w.source ? ` (${w.source})` : ""}`);
      }
      if (!DETAILS && r.wrong.length > shown.length) log(`   ${" ".repeat(21)} …and ${r.wrong.length - shown.length} more`);
    }
    if (!DETAILS) log("   Re-run with --details for the full list.");
  }

  const withExtra = rows.filter((r) => r.extra.length);
  if (withExtra.length) {
    log(`
${withExtra.length} person(s) with ERP days inside their sheet window that the sheet never marks:`);
    for (const r of withExtra) {
      const shown = DETAILS ? r.extra : r.extra.slice(0, 6);
      log(`   ${r.name.slice(0, 20).padEnd(21)} ${shown.join(" ")}${r.extra.length > shown.length ? ` …+${r.extra.length - shown.length}` : ""}`);
    }
  }

  log("\n==================== LEAVE BALANCES ====================");
  log("person                   bucket  entitled  ERP used  Jan-Aug  grid days  after Aug  ERP bal  sheet bal   diff");
  const mismatchedUsage = [];
  const laterUsage = [];
  for (const r of rows) {
    for (const b of r.buckets) {
      if (!b.entitled && !b.used && !b.gridDays && !b.sheetUsed) continue;
      const diff = b.sheetBalance === null ? null : round2(b.balance - b.sheetBalance);
      // The comparison that means something: days the ledger charges inside the
      // sheet's own window against the days the grid marks there.
      if (b.fromGridDays !== b.gridDays) {
        mismatchedUsage.push(`${r.name} ${b.bucket}: ledger charges ${b.fromGridDays} for Jan-Aug, grid marks ${b.gridDays}`);
      }
      if (b.later) laterUsage.push(`${r.name} ${b.bucket}: ${b.later} day(s) after August, which the sheet cannot know about`);
      const flag = b.fromGridDays !== b.gridDays ? " <-" : "";
      log(
        `${r.name.slice(0, 24).padEnd(25)}${b.bucket.padEnd(8)}${String(b.entitled).padStart(9)}` +
          `${String(b.used).padStart(10)}${String(b.fromGridDays).padStart(9)}${String(b.gridDays).padStart(11)}` +
          `${String(b.later).padStart(11)}${String(b.balance).padStart(9)}` +
          `${String(b.sheetBalance ?? "—").padStart(11)}${String(diff ?? "—").padStart(7)}${flag}`
      );
    }
  }

  log("\n==================== SUMMARY ====================");
  log(`attendance cells matching the sheet : ${totalMatched}/${totalDays}`);
  log(`people with every day matching      : ${rows.filter((r) => !r.wrong.length).length}/${rows.length}`);
  if (mismatchedUsage.length) {
    log(`\n!! ${mismatchedUsage.length} bucket(s) where the ledger does not equal the grid's leave days:`);
    for (const m of mismatchedUsage) log(`   ${m}`);
  } else {
    log("every bucket's Jan-Aug ledger usage equals the number of leave days the grid marks");
  }
  if (laterUsage.length) {
    log(`
${laterUsage.length} bucket(s) also carrying leave from after the sheet's window:`);
    for (const m of laterUsage) log(`   ${m}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Verify failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
