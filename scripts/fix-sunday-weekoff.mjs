/**
 * One-off: attendance records stored as "public-holiday" on Sundays (from old
 * ESSL import WO mapping) become "week-off" for everyone.
 * Run: node scripts/fix-sunday-weekoff.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const candidates = await db
  .collection("attendance")
  .find({ status: "public-holiday" })
  .toArray();

let fixed = 0;
for (const rec of candidates) {
  const d = rec.date instanceof Date ? rec.date : new Date((rec.date?.seconds ?? 0) * 1000);
  if (d.getDay() !== 0) continue; // only Sundays
  await db.collection("attendance").updateOne(
    { _id: rec._id },
    { $set: { status: "week-off", updatedAt: new Date() } }
  );
  fixed++;
}

console.log(`✅ ${fixed}/${candidates.length} public-holiday records on Sundays -> week-off`);
await mongoose.disconnect();
