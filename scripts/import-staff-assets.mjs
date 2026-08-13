/**
 * One-off: import the staff asset sheet (59 rows) into `assets`, assigned to
 * the matching staff doc. Idempotent — keyed on productCode `SHEET-<row>`.
 * Run: node scripts/import-staff-assets.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

// row, name, brand, serial, qty, condition, holder-as-written-in-sheet
// ponytail: row 40 has no holder and duplicates row 41's laptop — skipped.
// Rows 1, 2, 4, 5, 9, 30, 31 dropped per request: holders Aslam Ali, Rashid
// Kalikavu and Hisham are not on the staff roster.
const ROWS = [
  [3, "External HDD 2 TB", "Seagate", "NC18DFRX", 1, "Working", "Ali Hassan"],
  [6, "Laptop", "Asus", "00342-42659-76017-AAOEM", 1, "Working with Charger", "Ali Hassan"],
  [7, "Redmi Pad + keyboard", "Pad", "Pro 5G", 1, "Working", "Vaseem"],
  [8, "Mac Book & charger", "Apple", "Air M1", 1, "Working", "shafeeh"],
  [10, "iPhone", "iPhone", "17 Pro", 1, "Working", "Shameel"],
  [11, "SSD", "Storage", "D4Media SSD, 08", 1, "Working", "Faheem"],
  [12, "Mac mini m2pro", "Apple", "FQGV91PW0X", 1, "Working", "Hilal"],
  [13, "Display", "BenQ", "BenQ PD2725U", 1, "Working", "Hilal"],
  [14, "Mac Keyboard + Mac Mouse", "Apple", "", 2, "Working", "Hilal"],
  [15, "SSD 2TB", "Sandisk", "", 2, "Working", "Hilal"],
  [16, "Mac Mini", "Apple", "LG7QGHHVKH", 1, "Working", "Jasim"],
  [17, "Monitor", "BenQ", "BenQ PD2725U", 1, "Working", "Jasim"],
  [18, "Apple Numeric Keyboard, Apple Magic Mouse", "Apple", "", 2, "Working", "Jasim"],
  [19, "Hard Disks 1 TB", "Seagate", "", 2, "Working", "Jasim"],
  [20, "Mac mini", "Apple M4 Pro", "R02LH02J53", 1, "Working", "Aseem"],
  [21, "Display", "Apple Studio Display", "F7LGQY3Y9X", 1, "Working", "Aseem"],
  [22, "SSD 2 TB", "Sandisk", "", 1, "Working", "Aseem"],
  [23, "Mouse", "Magic Mouse", "", 1, "Working", "Aseem"],
  [24, "Keyboard", "Apple", "", 1, "Working", "Aseem"],
  [25, "Storage Cabin", "", "Color: Yellow", 1, "Good", "Aseem"],
  [26, "Card Reader", "Lexar", "", 1, "Working", "Aseem"],
  [27, "C HUB", "Portronics", "", 1, "Working", "Aseem"],
  [28, "C To HDD", "C To HDD", "", 1, "", "Aseem"],
  [29, "Lightning Cable", "Apple", "", 1, "Working", "Aseem"],
  [32, "Macbook + Charger", "Air M2 16GB", "MVYJT9M46F", 1, "Working", "Badeeu Zaman"],
  [33, "SSD 1TB With Cable", "Sandisk", "SDSSDE30-1TOO", 1, "", "Badeeu Zaman"],
  [34, "Hard Disk + Cable", "Toshiba 1TB", "Toshiba 1TB", 1, "Working", "Badeeu Zaman"],
  [35, "Monitor + Power Cable & Box", "BenQ", "BenQ GW2790", 1, "Working", "Badeeu Zaman"],
  [36, "Power Cable & Box", "", "", 1, "", "Badeeu Zaman"],
  [37, "Apple Magic Keyboard", "Model A1644 - (D4 Kids) White Color", "", 1, "Working", "Badeeu Zaman"],
  [38, "Mouse", "Portronics TOAD7", "Model ID POR2780", 1, "", "Badeeu Zaman"],
  [39, "Storage Box", "Orange Color", "", 1, "Good", "Badeeu Zaman"],
  [41, "Laptop + C-Lightning Cable + Laptop Stand", "Apple Mac Book M1 Pro", "WCYTXKTH94", 1, "Working", "Muhammed Rashid AP"],
  [42, "Magic Mouse", "Apple Magic Mouse, A1657", "CC232440ASU17YMAQ", 1, "Working", "Muhammed Rashid AP"],
  [43, "Redmi Pad Pro 5G + Charger", "24074RPD21", "IS 13252(PART-1)/IEC 60950-1", 1, "Working", "Muhammed Rashid AP"],
  [44, "iPhone 14 Pro + C-Lightning Cable + Mobile Stand", "Apple", "IS 13252(PART-1)/IEC 60950-1", 1, "Working", "Muhammed Rashid AP"],
  [45, "Headphones", "Adcom Over ear", "", 1, "Working", "Muhammed Rashid AP"],
  [46, "Laptop Bag", "Decathlon", "", 1, "Working", "Muhammed Rashid AP"],
  [47, "C-Hub", "Buster", "", 1, "Working", "Muhammed Rashid AP"],
  [48, "SSD 2TB", "Sandisk", "", 1, "Working", "Muhammed Rashid AP"],
  [49, "Macbook Air", "Apple", "C02KJ0D9Q6L4", 1, "Working", "Niyas Velom"],
  [50, "Mac Mini", "M2 Pro", "T67XRD64LC", 1, "Working", "Hafis Nenmara"],
  [51, "Keyboard", "Apple", "R-41025372", 1, "Working", "Hafis"],
  [52, "Mouse", "Apple", "579c-a1657", 1, "Working", "Hafis"],
  [53, "Laptop", "Acer", "00327-35157-26222-AAOEM", 1, "Working", "Hafis"],
  [54, "Headset", "Adcom 7.1 AD-1110", "", 1, "Working", "Hafis"],
  [55, "SSD", "Sandisk SDSSDE61-1T00, SDSSDE61-2T00", "", 2, "Working", "Hafis"],
  [56, "Laptop", "Acer", "", 1, "Not Working", "Shahid"],
  [57, "Smart Phone", "Realme Narzo", "RMX3761", 1, "Working", "Hafis Nenmara"],
  [58, "Mouse", "Portronics", "824", 1, "Working", "shahid"],
  [59, "wifi USB", "", "", 1, "Working", "shahid"],
];

// sheet name -> staff full name in the roster. Names with no roster match stay
// unassigned and are reported at the end.
const STAFF_ALIAS = {
  "ali hassan": "Ali Hassan T P",
  vaseem: "Vaseem Ali",
  shafeeh: "Shafeeh K",
  shameel: "Muhammed Shameel C",
  faheem: "Faheem P T",
  hilal: "Hilal A P",
  jasim: "Ahmed Jasim",
  aseem: "Aseem T",
  "badeeu zaman": "Badeeu Zaman",
  "muhammed rashid ap": "Muhammad Rashid A P",
  "niyas velom": "Niyas Velom",
  "hafis nenmara": "Mohammed Hafis N H",
  hafis: "Mohammed Hafis N H",
  shahid: "Shahid Ameen",
};

const categoryOf = (name) => {
  const n = name.toLowerCase();
  // these three would otherwise be caught by the device patterns below:
  // "Headphones" contains "phone", "Laptop Bag" contains "laptop", "C To HDD" is a cable.
  if (/headphone|headset|bag|c to hdd/.test(n)) return "Accessory";
  if (/macbook|mac book|mac mini|laptop/.test(n)) return "Laptop";
  if (/ssd|hdd|hard disk|cd drive/.test(n)) return "Storage";
  if (/display|monitor/.test(n)) return "Display";
  if (/phone|redmi pad/.test(n)) return "Phone";
  return "Accessory";
};

// "Not Working"/"Under Service" -> maintenance, everything else assigned.
const statusOf = (condition) => (/not working|under service/i.test(condition) ? "maintenance" : "assigned");

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const now = new Date();

const staffByName = new Map(
  (await db.collection("staff").find({}).project({ firstName: 1, lastName: 1 }).toArray()).map((s) => [
    `${s.firstName} ${s.lastName ?? ""}`.trim().toLowerCase(),
    s._id.toString(),
  ])
);

const resolveStaff = (holder) => {
  const key = holder.trim().toLowerCase();
  const target = (STAFF_ALIAS[key] ?? holder).toLowerCase();
  return staffByName.get(target) ?? null;
};

// make sure every category used exists in the picker
for (const cat of new Set(ROWS.map(([, name]) => categoryOf(name)))) {
  await db
    .collection("asset-categories")
    .updateOne(
      { name: cat },
      { $set: { isActive: true, updatedAt: now }, $setOnInsert: { name: cat, description: "", createdAt: now } },
      { upsert: true }
    );
}

let inserted = 0;
let updated = 0;
const unmatched = new Set();

for (const [row, name, brand, serial, qty, condition, holder] of ROWS) {
  const assigneeId = resolveStaff(holder);
  if (!assigneeId) unmatched.add(holder);

  const notes = [
    condition ? `Condition: ${condition}` : null,
    qty > 1 ? `Quantity: ${qty}` : null,
    assigneeId ? null : `Holder per sheet: ${holder} (no staff record)`,
    `Imported from asset sheet row ${row}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const doc = {
    name,
    category: categoryOf(name),
    brand,
    model: "",
    serialNumber: serial,
    purchaseDate: now,
    purchasePrice: 0,
    currentValue: 0,
    companyId: "",
    status: assigneeId ? statusOf(condition) : "available",
    currentAssigneeId: assigneeId ?? "",
    notes,
    isActive: true,
    allowOutside: false,
    warrantyDetails: "",
    noWarranty: true,
    billUrl: "",
    updatedAt: now,
  };

  const productCode = `SHEET-${row}`;
  const res = await db
    .collection("assets")
    .updateOne({ productCode }, { $set: doc, $setOnInsert: { productCode, createdAt: now } }, { upsert: true });

  if (res.upsertedCount) inserted++;
  else updated++;
}

console.log(`✅ ${inserted} assets created, ${updated} updated, of ${ROWS.length} sheet rows`);
if (unmatched.size) console.log(`⚠️  no staff record for: ${[...unmatched].join(", ")} — left unassigned`);
await mongoose.disconnect();
