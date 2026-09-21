/**
 * Re-anchor imported attendance punches to the office clock.
 *
 * The ESSL import used to build a punch with `new Date(y, m, d, h, min)`, which
 * reads the device's wall clock in the HOST's timezone. On Vercel (UTC) a 09:54
 * check-in was stored as 09:54Z — the same moment as 03:24 pm in India, which
 * is exactly how the register printed it. The importer now stores the true
 * instant (see src/lib/tz.ts); this fixes the rows written before that.
 *
 * Only rows an importer wrote are touched — `source: "biometric"` (ESSL PDF)
 * and `source: "sheet"` (the Jan-Aug register import), both of which ran on a
 * UTC host. Rows a person typed (`manual`) or a supervisor fixed
 * (`correction`) came from a browser already on the office clock: a dry run
 * against live data showed those sitting at 09-10 am, exactly where they
 * belong, so shifting them would break correct records. Pass --sources to
 * override the allowlist.
 *
 * Idempotent: a migrated row is stamped `punchTimeZone`, and stamped rows are
 * skipped, so a second run cannot shift the same punch twice.
 *
 * Dry run by default. Every run writes a JSON backup of the rows it would
 * change before it changes them.
 *
 *   node scripts/fix-attendance-punch-timezone.mjs                       # preview
 *   node scripts/fix-attendance-punch-timezone.mjs --apply               # write
 *   node scripts/fix-attendance-punch-timezone.mjs --from 2026-09-01 --to 2026-09-30
 *   node scripts/fix-attendance-punch-timezone.mjs --host-offset-minutes 330   # import ran on an IST box
 *   node scripts/fix-attendance-punch-timezone.mjs --tz Asia/Kolkata
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const APPLY = args.includes("--apply");
const TZ = flag("tz", "Asia/Kolkata");
const FROM = flag("from", null);
const TO = flag("to", null);
// Offset of the machine that RAN the import, in minutes east of UTC.
// Vercel is UTC (0); a laptop in India would be 330.
const HOST_OFFSET_MIN = Number(flag("host-offset-minutes", "0"));
const SOURCES = flag("sources", "biometric,sheet")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set (.env.local).");
  process.exit(1);
}
if (!Number.isFinite(HOST_OFFSET_MIN)) {
  console.error("--host-offset-minutes must be a number.");
  process.exit(1);
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Minutes the org zone runs ahead of UTC at this instant (DST included). */
function zoneOffsetMinutes(instant) {
  const parts = partsFormatter.formatToParts(instant);
  const read = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour") % 24, read("minute"), read("second"));
  return (asIfUtc - (instant.getTime() - instant.getMilliseconds())) / 60000;
}

function shiftedBy(date, deltaMinutes) {
  return new Date(date.getTime() + deltaMinutes * 60000);
}

function clock(date) {
  return date
    ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(date)
    : "—";
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const query = {
    isDeleted: { $ne: true },
    punchTimeZone: { $exists: false },
    source: { $in: SOURCES },
    $or: [{ checkIn: { $ne: null } }, { checkOut: { $ne: null } }],
  };
  if (FROM || TO) {
    query.date = {};
    if (FROM) query.date.$gte = new Date(`${FROM}T00:00:00.000Z`);
    if (TO) query.date.$lte = new Date(`${TO}T23:59:59.999Z`);
  }

  const rows = await db.collection("attendance").find(query).toArray();
  console.log(
    `Zone: ${TZ} · import host offset: ${HOST_OFFSET_MIN} min · sources: ${SOURCES.join(", ")} · candidate rows: ${rows.length}`
  );
  if (rows.length === 0) {
    console.log("Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  const writes = [];
  for (const row of rows) {
    const anchor = row.checkIn ?? row.checkOut ?? row.date;
    // stored = wall - host; wanted = wall - org; so delta = host - org.
    const delta = HOST_OFFSET_MIN - zoneOffsetMinutes(new Date(anchor));
    const set = { punchTimeZone: TZ, updatedAt: new Date() };
    if (row.checkIn) set.checkIn = shiftedBy(new Date(row.checkIn), delta);
    if (row.checkOut) set.checkOut = shiftedBy(new Date(row.checkOut), delta);
    writes.push({ row, set, delta });
  }

  const sample = writes.slice(0, 8);
  console.log("\nSample of the change (office clock):");
  for (const { row, set, delta } of sample) {
    console.log(
      `  ${new Date(row.date).toISOString().slice(0, 10)} staff ${row.staffId}` +
        `  in ${clock(row.checkIn && new Date(row.checkIn))} -> ${clock(set.checkIn)}` +
        `  out ${clock(row.checkOut && new Date(row.checkOut))} -> ${clock(set.checkOut)}` +
        `  (${delta} min)`
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(".backups", "attendance-punch-tz");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `attendance-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      writes.map(({ row }) => ({
        _id: row._id,
        staffId: row.staffId,
        date: row.date,
        checkIn: row.checkIn ?? null,
        checkOut: row.checkOut ?? null,
        source: row.source ?? null,
        importBatchId: row.importBatchId ?? null,
      })),
      null,
      2
    )
  );
  console.log(`\nBackup of the original punches: ${backupPath}`);

  if (!APPLY) {
    console.log(`Dry run — ${writes.length} row(s) would change. Re-run with --apply to write.`);
    await mongoose.disconnect();
    return;
  }

  const ops = writes.map(({ row, set }) => ({ updateOne: { filter: { _id: row._id }, update: { $set: set } } }));
  for (let i = 0; i < ops.length; i += 500) {
    const chunk = ops.slice(i, i + 500);
    const res = await db.collection("attendance").bulkWrite(chunk, { ordered: false });
    console.log(`  wrote ${res.modifiedCount} of ${chunk.length}`);
  }
  console.log(`Done. ${writes.length} row(s) re-anchored to ${TZ}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
