/**
 * Copy Settings → General onto the company record that invoices and quotations
 * actually print.
 *
 * The document header reads the linked `companies` document first and only
 * falls back to app settings, so a company row still carrying seeded demo data
 * ("D4 Media Pvt Ltd, 123 Demo Street, Kochi") keeps printing that no matter
 * what Settings says. This copies name / address / phone / email / website /
 * gst / pan across, leaving bank details and anything else untouched.
 *
 * Dry run by default — nothing is written until you pass --apply.
 *
 *   node scripts/sync-company-from-settings.mjs                 # show the diff
 *   node scripts/sync-company-from-settings.mjs --apply         # write it
 *   node scripts/sync-company-from-settings.mjs --company <id>  # one company
 *   node scripts/sync-company-from-settings.mjs --all           # every company
 *   node scripts/sync-company-from-settings.mjs --skip name     # keep "Pvt Ltd" on the letterhead
 */
import mongoose from "mongoose";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const ONLY_ID = args[args.indexOf("--company") + 1];
const HAS_ONLY = args.includes("--company") && ONLY_ID && !ONLY_ID.startsWith("--");
// Settings holds the trading name ("D4 Media"); the letterhead usually wants the
// registered one ("D4 Media Pvt Ltd"), so a field can be left out of the sync.
const SKIP = (() => {
  const i = args.indexOf("--skip");
  const raw = i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "";
  return new Set(raw.split(",").map((f) => f.trim()).filter(Boolean));
})();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set (.env.local).");
  process.exit(1);
}

/** Settings → General is flat-ish; the printable bits live under companyProfile. */
function desiredFrom(settings) {
  const profile = settings?.companyProfile ?? {};
  return {
    name: settings?.companyName,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    website: profile.website,
    gstNumber: settings?.gstNumber,
    panNumber: settings?.panNumber,
  };
}

function diffOf(company, desired) {
  const changes = {};
  for (const [key, value] of Object.entries(desired)) {
    if (SKIP.has(key)) continue;
    // Never blank a filled company field with an empty setting — a half-filled
    // Settings page would otherwise wipe details off every printed document.
    if (value === undefined || value === null || value === "") continue;
    if ((company[key] ?? "") !== value) changes[key] = value;
  }
  return changes;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const settings = await db.collection("settings").findOne({});
  if (!settings) {
    console.error("No settings document found — fill Settings → General first.");
    process.exit(1);
  }
  const desired = desiredFrom(settings);
  console.log("Settings → General:");
  for (const [k, v] of Object.entries(desired)) console.log(`  ${k}: ${v ?? "(empty)"}`);

  const query = HAS_ONLY ? { _id: new mongoose.Types.ObjectId(ONLY_ID) } : {};
  const companies = await db.collection("companies").find(query).toArray();
  if (companies.length === 0) {
    console.error("No company records matched.");
    process.exit(1);
  }
  if (companies.length > 1 && !ALL && !HAS_ONLY) {
    console.log(`\n${companies.length} companies exist. Listing them; re-run with --company <id> or --all.`);
    for (const c of companies) console.log(`  ${c._id}  ${c.name}`);
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const company of companies) {
    const changes = diffOf(company, desired);
    console.log(`\nCompany ${company._id} (${company.name}):`);
    if (Object.keys(changes).length === 0) {
      console.log("  already matches Settings — nothing to do.");
      continue;
    }
    for (const [k, v] of Object.entries(changes)) {
      console.log(`  ${k}: ${JSON.stringify(company[k] ?? "")} -> ${JSON.stringify(v)}`);
    }
    if (APPLY) {
      await db
        .collection("companies")
        .updateOne({ _id: company._id }, { $set: { ...changes, updatedAt: new Date() } });
      written += 1;
    }
  }

  console.log(
    APPLY
      ? `\nUpdated ${written} company record(s).`
      : "\nDry run — nothing written. Re-run with --apply to save."
  );
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
