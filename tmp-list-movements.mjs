// Read-only inventory of asset movements + what references them.
import fs from "node:fs";
import mongoose from "mongoose";

const env = fs.readFileSync(".env", "utf8");
const uri = env.match(/^MONGODB_URI=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!uri) { console.error("no MONGODB_URI"); process.exit(1); }

await mongoose.connect(uri);
const db = mongoose.connection.db;

const movements = await db.collection("asset-movements").find({}).sort({ createdAt: 1 }).toArray();
const damage = await db.collection("asset-damage-reports").find({}).toArray();
const events = await db.collection("asset-events").find({}).toArray();
const assets = await db.collection("assets").find({}).toArray();

const eventName = (id) => events.find((e) => String(e._id) === String(id))?.name ?? "(missing event)";
const assetName = (id) => assets.find((a) => String(a._id) === String(id))?.name ?? "(missing asset)";
const damageFor = (id) => damage.filter((d) => String(d.movementId) === String(id)).length;

const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "—");

console.log(`\nMOVEMENTS: ${movements.length}\n`);
console.log(
  ["#", "id", "asset", "event", "status", "out", "in", "outCond", "inCond", "issuedBy", "dmgRefs", "created"].join(" | ")
);
movements.forEach((m, i) => {
  console.log([
    i + 1,
    String(m._id),
    (m.assetName || assetName(m.assetId) || "—").slice(0, 18),
    (m.eventName || eventName(m.eventId) || "—").slice(0, 18),
    m.status,
    d(m.outDate),
    d(m.inDate),
    m.outCondition ?? "(legacy)",
    m.inCondition ?? "(legacy)",
    m.outByName || "—",
    damageFor(m._id),
    d(m.createdAt),
  ].join(" | "));
});

console.log(`\nDAMAGE REPORTS: ${damage.length}`);
for (const r of damage) {
  const orphan = movements.some((m) => String(m._id) === String(r.movementId)) ? "" : "  <- ORPHAN";
  console.log(` ${String(r._id)} | ${r.assetName || "—"} | ${r.type} | resolved=${!!r.isResolved} | mv=${r.movementId}${orphan}`);
}

console.log(`\nEVENTS: ${events.length}`);
for (const e of events) {
  const n = movements.filter((m) => String(m.eventId) === String(e._id)).length;
  console.log(` ${String(e._id)} | ${e.name} | ${e.status} | movements=${n}`);
}

console.log(`\nASSETS: ${assets.length}`);
for (const a of assets) {
  const open = movements.filter((m) => String(m.assetId) === String(a._id) && m.status === "OUT").length;
  console.log(` ${String(a._id)} | ${a.name} | status=${a.status} | openOUT=${open}`);
}

await mongoose.disconnect();
