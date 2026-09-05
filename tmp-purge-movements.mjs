// One-off: back up and delete all legacy asset movements + their damage
// reports, then release assets left "assigned" only by a deleted OUT movement.
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const env = fs.readFileSync(".env", "utf8");
const uri = env.match(/^MONGODB_URI=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!uri) { console.error("no MONGODB_URI"); process.exit(1); }

const backupDir = process.argv[2];
fs.mkdirSync(backupDir, { recursive: true });

await mongoose.connect(uri);
const db = mongoose.connection.db;

const movements = await db.collection("asset-movements").find({}).toArray();
const movementIds = movements.map((m) => String(m._id));
const damage = await db
  .collection("asset-damage-reports")
  .find({ movementId: { $in: movementIds } })
  .toArray();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const write = (name, rows) => {
  const file = path.join(backupDir, `${name}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`backed up ${rows.length} → ${file}`);
};
write("asset-movements", movements);
write("asset-damage-reports", damage);

// Assets held "assigned" by an OUT movement that is about to disappear.
const openOutAssetIds = [...new Set(movements.filter((m) => m.status === "OUT").map((m) => String(m.assetId)))];
const heldAssets = await db
  .collection("assets")
  .find({ _id: { $in: openOutAssetIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: "assigned" })
  .toArray();
write("assets-status-before", heldAssets.map((a) => ({ _id: a._id, name: a.name, status: a.status })));

const delMovements = await db.collection("asset-movements").deleteMany({});
const delDamage = await db
  .collection("asset-damage-reports")
  .deleteMany({ movementId: { $in: movementIds } });

let released = 0;
if (heldAssets.length) {
  const res = await db.collection("assets").updateMany(
    { _id: { $in: heldAssets.map((a) => a._id) } },
    { $set: { status: "available", updatedAt: new Date() } }
  );
  released = res.modifiedCount;
}

console.log(`\ndeleted movements: ${delMovements.deletedCount}`);
console.log(`deleted damage reports: ${delDamage.deletedCount}`);
console.log(`assets released to available: ${released}`);
console.log(`remaining movements: ${await db.collection("asset-movements").countDocuments()}`);
console.log(`remaining damage reports: ${await db.collection("asset-damage-reports").countDocuments()}`);
console.log(`activity logs left untouched: ${await db.collection("asset-activity-logs").countDocuments()}`);

await mongoose.disconnect();
