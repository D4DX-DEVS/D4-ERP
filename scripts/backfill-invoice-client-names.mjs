/**
 * One-off: invoices/quotations saved without clientName are invisible to the
 * name-based search on the Invoices/Quotations list pages (search only
 * regex-matches stored fields, it can't join against the clients collection).
 * Backfill clientName from the linked client doc.
 * Run: node scripts/backfill-invoice-client-names.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const docs = await db
  .collection("invoices")
  .find({ $or: [{ clientName: { $exists: false } }, { clientName: "" }, { clientName: null }] })
  .toArray();

const clientNames = new Map(
  (await db.collection("clients").find({}).project({ companyName: 1 }).toArray()).map((c) => [
    c._id.toString(),
    c.companyName || null,
  ])
);

let fixed = 0;
let skipped = 0;
for (const d of docs) {
  const name = clientNames.get(String(d.clientId));
  if (!name) {
    skipped++;
    console.log(`  skip ${d.invoiceNumber || d._id} — no client found for clientId ${d.clientId}`);
    continue;
  }
  await db.collection("invoices").updateOne({ _id: d._id }, { $set: { clientName: name } });
  fixed++;
}

console.log(`✅ ${fixed} invoices/quotations backfilled, ${skipped} skipped, of ${docs.length} missing clientName`);
await mongoose.disconnect();
