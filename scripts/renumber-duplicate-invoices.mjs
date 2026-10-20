/**
 * One-off: the Invoices page "Create Invoice" used to number invoices by
 * counting the rows on the current (10-row) page, so every invoice came out
 * as D4-0011. Give every invoice that shares a number a fresh one from the
 * same atomic counter the app uses (src/lib/numbering.ts), oldest first.
 * The old number is kept on the invoice as `renumberedFrom`; receipts that
 * copy the invoice number are updated too.
 *
 * Dry run:  node scripts/renumber-duplicate-invoices.mjs
 * Apply:    node scripts/renumber-duplicate-invoices.mjs --apply
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

const APPLY = process.argv.includes("--apply");

// ── Port of src/lib/numbering.ts (keep in step) ────────────────────────────
const normalizePrefix = (p) => (p ?? "").trim().replace(/[\s\-/_.]+$/, "").toUpperCase();

function companyCode(company) {
  const explicit = company?.code?.trim();
  if (explicit) return explicit.toUpperCase();
  const name = company?.name?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return "NA";
}

function resolveSeriesTemplate(template, company) {
  const comp = companyCode(company);
  const prefix = normalizePrefix(company?.invoicePrefix);
  if (!prefix || template.includes("{COMP}")) return { template, comp };
  const firstToken = template.indexOf("{");
  if (firstToken < 0) return { template, comp };
  const literal = template.slice(0, firstToken);
  if (normalizePrefix(literal) === prefix) return { template, comp };
  const separator = literal.match(/[\-/_.]+$/)?.[0] ?? "-";
  return { template: `{COMP}${separator}${template.slice(firstToken)}`, comp: prefix };
}

function getFinancialYear(date, fyStartMonth) {
  const month = date.getMonth() + 1;
  const startYear = month >= fyStartMonth ? date.getFullYear() : date.getFullYear() - 1;
  return { startYear, label: `${startYear}-${String(startYear + 1).slice(-2)}` };
}

function formatDocNumber(template, { comp, fy, seq }) {
  return template
    .replace(/\{COMP\}/g, comp)
    .replace(/\{YYYY\}/g, String(fy.startYear))
    .replace(/\{YY\}/g, String(fy.startYear).slice(-2))
    .replace(/\{FY\}/g, fy.label)
    .replace(/\{SEQ:(\d+)\}/g, (_m, n) => String(seq).padStart(Number(n), "0"))
    .replace(/\{SEQ\}/g, String(seq));
}

function sequenceScope(template, comp, fy) {
  const usesComp = template.includes("{COMP}");
  const usesYear = /\{YYYY\}|\{YY\}|\{FY\}/.test(template);
  const parts = ["invoice"];
  if (usesComp) parts.push(comp);
  if (usesYear) parts.push(String(fy.startYear));
  const key = parts.join("__");
  if (usesComp && usesYear) return { key };
  if (usesComp) return { key, legacy: { prefix: `${key}__` } };
  if (usesYear) return { key, legacy: { prefix: "invoice__", suffix: `__${fy.startYear}` } };
  return { key, legacy: { prefix: "invoice__" } };
}
// ───────────────────────────────────────────────────────────────────────────

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const seqs = db.collection("number_sequences");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const settings = await db.collection("settings").findOne({});
const baseTemplate = settings?.numberFormats?.invoice ?? "{COMP}/{YYYY}/{SEQ:3}";
const fyStartMonth = Number(settings?.financialYearStart) || 4;
const companies = new Map((await db.collection("companies").find({}).toArray()).map((c) => [String(c._id), c]));

// Same seeding the /api/db nextSequence action does for a brand-new key
async function seedValue({ key, legacy }) {
  const existing = await seqs.findOne({ key });
  if (existing) return Number(existing.current) || 0;
  if (!legacy) return 0;
  const pattern = `^${esc(legacy.prefix)}.*${esc(legacy.suffix ?? "")}$`;
  const docs = await seqs.find({ key: { $regex: pattern } }).toArray();
  return docs.reduce((max, d) => Math.max(max, Number(d.current) || 0), 0);
}

async function reserve(scope) {
  const seed = await seedValue(scope);
  if (seed > 0) {
    await seqs.updateOne({ key: scope.key }, { $setOnInsert: { current: seed, createdAt: new Date() } }, { upsert: true });
  }
  const doc = await seqs.findOneAndUpdate(
    { key: scope.key },
    { $inc: { current: 1 }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } },
    { returnDocument: "after", upsert: true }
  );
  return Number((doc?.value ?? doc).current);
}

const invoices = await db.collection("invoices").find({ type: "invoice" }).sort({ createdAt: 1 }).toArray();
const usage = new Map();
for (const inv of invoices) usage.set(inv.invoiceNumber, (usage.get(inv.invoiceNumber) ?? 0) + 1);
const dupes = invoices.filter((inv) => usage.get(inv.invoiceNumber) > 1);
const taken = new Set(invoices.filter((inv) => usage.get(inv.invoiceNumber) === 1).map((inv) => inv.invoiceNumber));

console.log(`${dupes.length} invoices share a number with another invoice${APPLY ? "" : " (dry run — nothing written)"}`);

const planned = new Map(); // scope key → next seq in dry run
const mapping = [];
for (const inv of dupes) {
  const company = companies.get(String(inv.companyId));
  const date = inv.date instanceof Date ? inv.date : inv.createdAt instanceof Date ? inv.createdAt : new Date();
  const fy = getFinancialYear(date, fyStartMonth);
  const { template, comp } = resolveSeriesTemplate(baseTemplate, company);
  const scope = sequenceScope(template, comp, fy);

  let seq;
  if (APPLY) {
    seq = await reserve(scope);
  } else {
    seq = (planned.get(scope.key) ?? (await seedValue(scope))) + 1;
    planned.set(scope.key, seq);
  }
  const next = formatDocNumber(template, { comp, fy, seq });
  if (taken.has(next)) {
    console.error(`✖ ${next} is already used by another invoice — stopping`);
    process.exit(1);
  }
  taken.add(next);
  mapping.push({ id: String(inv._id), company: company?.name ?? "—", from: inv.invoiceNumber, to: next });
  console.log(`  ${inv.createdAt?.toISOString?.().slice(0, 10)}  ${(company?.name ?? "—").padEnd(18)} ${inv.invoiceNumber} → ${next}`);

  if (APPLY) {
    await db.collection("invoices").updateOne(
      { _id: inv._id },
      { $set: { invoiceNumber: next, renumberedFrom: inv.invoiceNumber, updatedAt: new Date() } }
    );
    await db.collection("receipts").updateMany({ invoiceId: String(inv._id) }, { $set: { invoiceNumber: next } });
  }
}

if (APPLY) console.log(`✅ ${mapping.length} invoices renumbered`);
console.log(JSON.stringify(mapping));
await mongoose.disconnect();
