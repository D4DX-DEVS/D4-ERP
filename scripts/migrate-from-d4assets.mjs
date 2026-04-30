/**
 * Migration script: D4-Assets → D4-ERP
 *
 * SOURCE  : mongodb+srv://...D4-Asset   (D4-Assets project)
 * TARGET  : mongodb+srv://...D4-ERP     (this project)
 *
 * Collections migrated:
 *   categories (D4-Assets)  → asset-categories (D4-ERP)
 *   persons                 → asset-persons
 *   assets                  → assets            (extended with D4-Assets fields)
 *   events                  → asset-events       (responsiblePerson → populated name)
 *   movements               → asset-movements    (all ObjectId refs → denormalized strings)
 *   damagereports           → asset-damage-reports
 *   activitylogs            → asset-activity-logs
 *
 * Run:
 *   node scripts/migrate-from-d4assets.mjs
 */

import mongoose from "mongoose";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ── Config ────────────────────────────────────────────────────────────────────
const SOURCE_URI =
  "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/D4-Asset?retryWrites=true&w=majority&appName=Developer";
const TARGET_URI =
  "mongodb+srv://D4DX-3:pcjVVr858aDDs31F@cluster0.ub8mvqx.mongodb.net/D4-ERP?appName=Cluster0";

// ── Helpers ───────────────────────────────────────────────────────────────────
function id(doc) {
  return doc._id?.toString();
}

function toDate(val) {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  return new Date(val);
}

// ── Connect two separate Mongoose connections ─────────────────────────────────
console.log("Connecting to SOURCE (D4-Asset)…");
const srcConn = await mongoose.createConnection(SOURCE_URI).asPromise();
console.log("✓ Source connected");

console.log("Connecting to TARGET (D4-ERP)…");
const tgtConn = await mongoose.createConnection(TARGET_URI).asPromise();
console.log("✓ Target connected\n");

// ── Raw collections on source ─────────────────────────────────────────────────
const srcDB = srcConn.db;
const srcUsers       = srcDB.collection("users");
const srcCategories  = srcDB.collection("categories");
const srcPersons     = srcDB.collection("persons");
const srcAssets      = srcDB.collection("assets");
const srcEvents      = srcDB.collection("events");
const srcMovements   = srcDB.collection("movements");
const srcDamage      = srcDB.collection("damagereports");
const srcActivity    = srcDB.collection("activitylogs");

// ── Raw collections on target ─────────────────────────────────────────────────
const tgtDB = tgtConn.db;

async function upsertMany(collection, docs) {
  if (!docs.length) return 0;
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { _id: d._id },
      update: { $set: d },
      upsert: true,
    },
  }));
  const result = await collection.bulkWrite(ops, { ordered: false });
  return result.upsertedCount + result.modifiedCount + result.matchedCount;
}

// ── 1. USERS lookup (for name resolution) ────────────────────────────────────
console.log("Loading users from source…");
const usersRaw = await srcUsers.find({}).toArray();
const userMap = new Map(); // _id.toString() → name
for (const u of usersRaw) {
  userMap.set(id(u), u.name || "Unknown");
}
console.log(`  ${userMap.size} users loaded`);

// ── 2. CATEGORIES → asset-categories ─────────────────────────────────────────
console.log("\nMigrating categories…");
const categoriesRaw = await srcCategories.find({}).toArray();
const categoryDocs = categoriesRaw.map((c) => ({
  _id: c._id,
  name: c.name,
  description: c.description || "",
  isActive: c.isActive !== false,
  createdAt: toDate(c.createdAt) || new Date(),
  updatedAt: toDate(c.updatedAt) || new Date(),
}));
const tgtCategories = tgtDB.collection("asset-categories");
const catCount = await upsertMany(tgtCategories, categoryDocs);
console.log(`  ✓ ${catCount} categories migrated`);

// ── 3. PERSONS → asset-persons ───────────────────────────────────────────────
console.log("\nMigrating persons…");
const personsRaw = await srcPersons.find({}).toArray();
const personMap = new Map(); // _id.toString() → name
for (const p of personsRaw) {
  personMap.set(id(p), p.name || "Unknown");
}
const personDocs = personsRaw.map((p) => ({
  _id: p._id,
  name: p.name,
  phone: p.phone || "",
  email: p.email || "",
  department: p.department || "",
  isActive: p.isActive !== false,
  createdAt: toDate(p.createdAt) || new Date(),
  updatedAt: toDate(p.updatedAt) || new Date(),
}));
const tgtPersons = tgtDB.collection("asset-persons");
const personCount = await upsertMany(tgtPersons, personDocs);
console.log(`  ✓ ${personCount} persons migrated`);

// ── 4. ASSETS → assets ───────────────────────────────────────────────────────
console.log("\nMigrating assets…");
const assetsRaw = await srcAssets.find({}).toArray();
const assetMap = new Map(); // _id.toString() → { name, category }
for (const a of assetsRaw) {
  assetMap.set(id(a), { name: a.name, category: a.category });
}
const assetDocs = assetsRaw.map((a) => ({
  _id: a._id,
  name: a.name,
  category: a.category,
  // D4-ERP Asset fields — map from D4-Assets equivalents
  brand: "",
  model: "",
  serialNumber: a.productCode || id(a), // no serial in D4-Assets; use productCode or id
  purchaseDate: toDate(a.dateOfPurchase) || new Date(),
  purchasePrice: 0,
  currentValue: 0,
  companyId: "",
  status: a.isActive ? "available" : "retired",
  isActive: a.isActive !== false,
  // D4-Assets specific extended fields
  productCode: a.productCode || "",
  allowOutside: a.allowOutside === true,
  warrantyDetails: a.warrantyDetails || "",
  warrantyExpiryDate: toDate(a.warrantyExpiryDate),
  noWarranty: a.noWarranty === true,
  billUrl: a.billUrl || "",
  createdAt: toDate(a.createdAt) || new Date(),
  updatedAt: toDate(a.updatedAt) || new Date(),
}));
const tgtAssets = tgtDB.collection("assets");
const assetCount = await upsertMany(tgtAssets, assetDocs);
console.log(`  ✓ ${assetCount} assets migrated`);

// ── 5. EVENTS → asset-events ─────────────────────────────────────────────────
console.log("\nMigrating events…");
const eventsRaw = await srcEvents.find({}).toArray();
const eventMap = new Map(); // _id.toString() → { name, location }
for (const e of eventsRaw) {
  eventMap.set(id(e), { name: e.name, location: e.location });
}
const eventDocs = eventsRaw.map((e) => {
  const responsibleId = e.responsiblePerson?.toString();
  const responsibleName = personMap.get(responsibleId) || "";
  return {
    _id: e._id,
    name: e.name,
    location: e.location,
    fromDate: toDate(e.fromDate),
    toDate: toDate(e.toDate),
    responsiblePersonId: responsibleId || "",
    responsiblePersonName: responsibleName,
    status: e.status || "upcoming",
    isActive: e.isActive !== false,
    createdAt: toDate(e.createdAt) || new Date(),
    updatedAt: toDate(e.updatedAt) || new Date(),
  };
});
const tgtEvents = tgtDB.collection("asset-events");
const eventCount = await upsertMany(tgtEvents, eventDocs);
console.log(`  ✓ ${eventCount} events migrated`);

// ── 6. MOVEMENTS → asset-movements ───────────────────────────────────────────
console.log("\nMigrating movements…");
const movementsRaw = await srcMovements.find({}).toArray();
const movementMap = new Map(); // _id.toString() → true
for (const m of movementsRaw) movementMap.set(id(m), true);

const movementDocs = movementsRaw.map((m) => {
  const assetId  = m.asset?.toString();
  const eventId  = m.event?.toString();
  const personId = m.allocatedPerson?.toString();
  const outById  = m.outBy?.toString();
  const assetInfo  = assetMap.get(assetId)  || {};
  const eventInfo  = eventMap.get(eventId)  || {};

  return {
    _id: m._id,
    assetId:               assetId || "",
    assetName:             assetInfo.name     || "",
    assetCategory:         assetInfo.category || "",
    eventId:               eventId || "",
    eventName:             eventInfo.name     || "",
    eventLocation:         eventInfo.location || "",
    allocatedPersonId:     personId           || "",
    allocatedPersonName:   personMap.get(personId) || "",
    outByName:             userMap.get(outById)    || "",
    status:                m.status           || "OUT",
    outDate:               toDate(m.outDate)  || new Date(),
    inDate:                toDate(m.inDate),
    returnBy:              m.returnBy         || "",
    verifiedBy:            m.verifiedBy       || "",
    condition:             m.condition        || "good",
    damageReason:          m.damageReason     || "",
    remarks:               m.remarks          || "",
    createdAt:             toDate(m.createdAt) || new Date(),
    updatedAt:             toDate(m.updatedAt) || new Date(),
  };
});
const tgtMovements = tgtDB.collection("asset-movements");
const movementCount = await upsertMany(tgtMovements, movementDocs);
console.log(`  ✓ ${movementCount} movements migrated`);

// ── 7. DAMAGE REPORTS → asset-damage-reports ─────────────────────────────────
console.log("\nMigrating damage reports…");
const damageRaw = await srcDamage.find({}).toArray();
const damageDocs = damageRaw.map((d) => {
  const assetId  = d.asset?.toString();
  const eventId  = d.event?.toString();
  const movId    = d.movement?.toString();
  const repById  = d.reportedBy?.toString();
  const resById  = d.resolvedBy?.toString();
  const assetInfo = assetMap.get(assetId) || {};
  const eventInfo = eventMap.get(eventId) || {};

  return {
    _id: d._id,
    movementId:       movId    || "",
    assetId:          assetId  || "",
    assetName:        assetInfo.name     || "",
    eventId:          eventId  || "",
    eventName:        eventInfo.name     || "",
    type:             d.type   || "damage",
    reason:           d.reason || "",
    notes:            d.notes  || "",
    reportedByName:   userMap.get(repById) || "",
    isResolved:       d.isResolved === true,
    resolvedAt:       toDate(d.resolvedAt),
    resolvedByName:   userMap.get(resById) || "",
    createdAt:        toDate(d.createdAt) || new Date(),
    updatedAt:        toDate(d.updatedAt) || new Date(),
  };
});
const tgtDamage = tgtDB.collection("asset-damage-reports");
const damageCount = await upsertMany(tgtDamage, damageDocs);
console.log(`  ✓ ${damageCount} damage reports migrated`);

// ── 8. ACTIVITY LOGS → asset-activity-logs ───────────────────────────────────
console.log("\nMigrating activity logs…");
const activityRaw = await srcActivity.find({}).toArray();
const activityDocs = activityRaw.map((a) => ({
  _id: a._id,
  userName:   a.userName   || userMap.get(a.user?.toString()) || "Unknown",
  action:     a.action     || "",
  module:     a.module     || "",
  resourceId: a.resourceId || "",
  details:    a.details    || "",
  ipAddress:  a.ipAddress  || "",
  createdAt:  toDate(a.createdAt) || new Date(),
}));
const tgtActivity = tgtDB.collection("asset-activity-logs");
const activityCount = await upsertMany(tgtActivity, activityDocs);
console.log(`  ✓ ${activityCount} activity logs migrated`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════");
console.log("  Migration complete!");
console.log(`  Categories   : ${categoryDocs.length}`);
console.log(`  Persons      : ${personDocs.length}`);
console.log(`  Assets       : ${assetDocs.length}`);
console.log(`  Events       : ${eventDocs.length}`);
console.log(`  Movements    : ${movementDocs.length}`);
console.log(`  Damage Rpts  : ${damageDocs.length}`);
console.log(`  Activity Logs: ${activityDocs.length}`);
console.log("════════════════════════════════════\n");

await srcConn.close();
await tgtConn.close();
process.exit(0);
