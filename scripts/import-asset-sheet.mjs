/**
 * Import the company asset sheet (the "normal" asset register, ~276 rows) into
 * `assets`. Idempotent — keyed on productCode `SHEET-A-<No.>`, so re-running
 * updates instead of duplicating. Personal/staff assets come from
 * scripts/import-staff-assets.mjs and use the `SHEET-<row>` key: no overlap.
 *
 * Run: node scripts/import-asset-sheet.mjs
 *      node scripts/import-asset-sheet.mjs ./local-copy.csv   (offline)
 */
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });
config();

const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1rO8DgwQAXPrL0S_H-yQn7bZrKcqhD37BrUYz5FUaXP0/export?format=csv&gid=1187677289";

// Custodian text -> staff full name in the roster. The sheet writes holders
// freehand ("Hafis ( islamonlive)", "Outreach / Vaseem Ali"), so we match on
// these fragments anywhere in the cell.
const CUSTODIAN_ALIAS = {
  rashid: "Muhammad Rashid A P",
  "shahid ameen": "Shahid Ameen",
  shahid: "Shahid Ameen",
  "badeeu zaman": "Badeeu Zaman",
  "vaseem ali": "Vaseem Ali",
  vaseem: "Vaseem Ali",
  "shafeeh papu": "Shafeeh K",
  "shafeeh pappu": "Shafeeh K",
  "safeeh papu": "Shafeeh K",
  shafeeh: "Shafeeh K",
  jasim: "Ahmed Jasim",
  aseem: "Aseem T",
  "hafis nenmara": "Mohammed Hafis N H",
  "haafis nenmara": "Mohammed Hafis N H",
  "hafiz nenmara": "Mohammed Hafis N H",
  hafis: "Mohammed Hafis N H",
  "niyas velam": "Niyas Velom",
  "niyas velom": "Niyas Velom",
  "ali hassan": "Ali Hassan T P",
  faheem: "Faheem P T",
  hilal: "Hilal A P",
  shameel: "Muhammed Shameel C",
};

const categoryOf = (name) => {
  // Retail titles lead with the product and trail into spec soup ("...|Quad
  // Speaker|8GB"); matching the whole string files a tablet under Audio.
  const n = name.slice(0, 60).toLowerCase();
  // Peripherals first: "keyboard" contains "board", "laptop bag" contains "laptop".
  if (/keyboard|mouse|bag|case|cover|cable|charger|adapter|cleaning|cloth/.test(n)) return "Accessory";
  if (/macbook|mac book|mac mini|laptop|imac|i mac|cpu|desktop/.test(n)) return "Laptop";
  if (/tablet|redmi pad|ipad/.test(n)) return "Tablet";
  if (/headphone|headset|earphone|buds|mic |mic,|microphone|lapel|speaker|audio|sound card/.test(n)) return "Audio";
  if (/camera|lens|dslr|mirrorless|tripod|gimbal|flash|filter|stabli|stebli/.test(n)) return "Camera";
  if (/ssd|hdd|hard disk|hardisk|memmory card|memory card|pendrive|card reader|sd card|cloud servor/.test(n)) return "Storage";
  if (/monitor|display|screen|projector/.test(n)) return "Display";
  if (/phone|iphone|galaxy|walkie|netsetter/.test(n)) return "Phone";
  if (/router|wifi|lan |usb hub|hub|switcher|convertor|converter|bridge|dongle|capture card|ups/.test(n)) return "Network";
  if (/light|led|halogon|stand|chair|stool|bed|kettle|cup|flask|plant|shelf|sign board|cleaner|vacuum/.test(n)) return "Studio & Office";
  return "Accessory";
};

// "Damaged"/"Complained" anywhere in custodian or remarks parks the asset in
// maintenance instead of pretending it is in service.
const isDamaged = (custodian, remarks) => /damag|complain|not working|defect/i.test(`${custodian} ${remarks}`);

const parseCost = (raw) => {
  // Cells look like "61,490", "13499+13499", "12,195.00", "7, 000".
  const parts = String(raw).split("+");
  const total = parts.reduce((sum, p) => sum + (Number(p.replace(/[^0-9.]/g, "")) || 0), 0);
  return Math.round(total);
};

const csvText = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : await fetch(SHEET_CSV).then((r) => {
      if (!r.ok) throw new Error(`Sheet fetch failed: ${r.status} — pass a local CSV path instead`);
      return r.text();
    });

// xlsx (already a dependency) handles quoted cells with embedded newlines.
const workbook = XLSX.read(csvText, { type: "string", raw: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
// Row 1 is a blank spacer; the real header is row 2.
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const now = new Date();

const staffByName = new Map(
  (await db.collection("staff").find({}).project({ firstName: 1, lastName: 1 }).toArray()).map((s) => [
    `${s.firstName} ${s.lastName ?? ""}`.trim().toLowerCase(),
    s._id.toString(),
  ])
);

const resolveStaff = (custodian) => {
  const text = custodian.toLowerCase();
  // Longest alias first so "shahid ameen" wins over "shahid".
  for (const key of Object.keys(CUSTODIAN_ALIAS).sort((a, b) => b.length - a.length)) {
    if (text.includes(key)) {
      const id = staffByName.get(CUSTODIAN_ALIAS[key].toLowerCase());
      if (id) return id;
    }
  }
  return staffByName.get(text.trim()) ?? null;
};

for (const cat of new Set(rows.map((r) => categoryOf(String(r["Brief Description of Asset"] || ""))))) {
  await db.collection("asset-categories").updateOne(
    { name: cat },
    { $set: { isActive: true, updatedAt: now }, $setOnInsert: { name: cat, description: "", createdAt: now } },
    { upsert: true }
  );
}

let inserted = 0;
let updated = 0;
let skipped = 0;
const unmatched = new Map();

for (const [index, row] of rows.entries()) {
  const name = String(row["Brief Description of Asset"] || "").replace(/\s+/g, " ").trim();
  if (!name) {
    skipped++;
    continue;
  }

  const no = String(row["No."] || "").trim();
  // Two tail rows carry no usable No. — key them by sheet position instead.
  const productCode = `SHEET-A-${/^\d+$/.test(no) ? no : `X${index + 1}`}`;

  const custodian = String(row["Custodian"] || "").trim();
  const remarks = String(row["Remarkes"] || "").trim();
  const qty = Number(String(row["Pcs"] || "").replace(/[^0-9]/g, "")) || 1;
  const assigneeId = resolveStaff(custodian);
  if (custodian && !assigneeId) unmatched.set(custodian, (unmatched.get(custodian) || 0) + 1);

  const damaged = isDamaged(custodian, remarks);
  const notes = [
    custodian ? `Custodian per sheet: ${custodian}` : null,
    qty > 1 ? `Quantity: ${qty}` : null,
    row["Purchase Date"] ? `Purchase date per sheet: ${row["Purchase Date"]}` : null,
    row["Purchase From"] ? `Purchased from: ${row["Purchase From"]}` : null,
    remarks ? `Remarks: ${remarks}` : null,
    `Imported from asset register row ${no || index + 1}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const doc = {
    // Descriptions run to full Amazon titles; keep the register readable.
    name: name.length > 120 ? `${name.slice(0, 117)}...` : name,
    category: categoryOf(name),
    brand: String(row["Brand"] || "").trim(),
    model: String(row["Model"] || "").trim(),
    serialNumber: String(row["Product ID"] || "").trim(),
    // ponytail: sheet dates come in a dozen freehand formats — the raw string is
    // kept in notes rather than guessed at. Set real dates in the UI.
    purchaseDate: now,
    purchasePrice: parseCost(row["Cost"]),
    currentValue: parseCost(row["Cost"]),
    companyId: "",
    status: damaged ? "maintenance" : assigneeId ? "assigned" : "available",
    currentAssigneeId: assigneeId ?? "",
    notes,
    isActive: true,
    allowOutside: false,
    warrantyDetails: String(row["Warrenty"] || "").trim(),
    noWarranty: !String(row["Warrenty"] || "").trim(),
    billUrl: "",
    updatedAt: now,
  };

  const res = await db
    .collection("assets")
    .updateOne({ productCode }, { $set: doc, $setOnInsert: { productCode, createdAt: now } }, { upsert: true });

  if (res.upsertedCount) inserted++;
  else updated++;
}

console.log(`✅ ${inserted} assets created, ${updated} updated, ${skipped} blank rows skipped (${rows.length} sheet rows)`);
if (unmatched.size) {
  console.log(`⚠️  custodians with no staff match (left unassigned, kept in notes):`);
  for (const [who, count] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`   ${count}× ${who}`);
}
await mongoose.disconnect();
