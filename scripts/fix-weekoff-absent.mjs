/**
 * Repair: attendance records stored "absent" with no punches on configured
 * non-working days (weekly off / holiday) become "week-off". These come from
 * ESSL PDF imports that mark punch-less days "A".
 * Dry run: node scripts/fix-weekoff-absent.mjs
 * Apply:   node scripts/fix-weekoff-absent.mjs --apply
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

const APPLY = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const settings = (await db.collection("settings").findOne({})) ?? {};
const schedule = settings.weeklySchedule ?? {};
// Default mirrors src/lib/settings.ts: Sunday off, rest working
const offDays = new Set(
  DAY_KEYS.filter((k, i) => (schedule[k] ? !schedule[k].enabled : i === 0))
);
const holidayDates = new Set((settings.holidays ?? []).map((h) => h.date));

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const candidates = await db
  .collection("attendance")
  .find({
    status: "absent",
    checkIn: { $in: [null, undefined] },
    checkOut: { $in: [null, undefined] },
    isDeleted: { $ne: true },
  })
  .toArray();

let fixed = 0;
const byDay = {};
for (const rec of candidates) {
  const d = rec.date instanceof Date ? rec.date : new Date((rec.date?.seconds ?? 0) * 1000);
  const dayName = DAY_KEYS[d.getDay()];
  if (!offDays.has(dayName) && !holidayDates.has(dateKey(d))) continue;
  byDay[dayName] = (byDay[dayName] ?? 0) + 1;
  if (APPLY) {
    await db.collection("attendance").updateOne(
      { _id: rec._id },
      { $set: { status: "week-off", updatedAt: new Date(), weekOffRepairedAt: new Date() } }
    );
  }
  fixed++;
}

console.log(`Off days configured: ${[...offDays].join(", ") || "(none)"}; holidays: ${holidayDates.size}`);
console.log(`Candidates (absent, no punches): ${candidates.length}`);
console.log(`${APPLY ? "Fixed" : "Would fix"}: ${fixed}`, byDay);
if (!APPLY) console.log("Dry run — rerun with --apply to write.");
await mongoose.disconnect();
