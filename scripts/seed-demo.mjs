/**
 * Demo Seed Script (MongoDB)
 * Creates demo admin and staff credentials for testing.
 *
 * SETUP:
 *   1. Add MONGODB_URI to your .env file
 *   2. Run: node scripts/seed-demo.mjs
 *
 * DEMO CREDENTIALS:
 *   Admin  → Email: admin@d4media.in  | Password: Admin@123
 *   Staff  → Employee Code: D4-STAFF  | Mobile (last 4 digits): 0001
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config(); // Load .env

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(`
❌  MONGODB_URI not found in .env

Add your MongoDB connection string to .env:
  MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/d4media-erp
`);
  process.exit(1);
}

// ── Connect ──────────────────────────────────────────────────────────────────
await mongoose.connect(MONGODB_URI);
console.log("✅ Connected to MongoDB\n");

const db = mongoose.connection.db;

// ── Helpers ──────────────────────────────────────────────────────────────────
async function upsert(collectionName, filter, data) {
  const col = db.collection(collectionName);
  const result = await col.updateOne(filter, { $set: data }, { upsert: true });
  const action = result.upsertedId ? "Created" : "Updated";
  console.log(`  ✅ ${action} ${collectionName} (${JSON.stringify(filter)})`);
  // Return the document id
  if (result.upsertedId) return result.upsertedId.toString();
  const doc = await col.findOne(filter);
  return doc._id.toString();
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱  Starting demo seed...\n");

  // 1. Company
  const companyId = await upsert("companies", { name: "D4 Media Pvt Ltd" }, {
    name: "D4 Media Pvt Ltd",
    address: "123 Demo Street, Kochi, Kerala",
    panNumber: "AABCD1234E",
    gstNumber: "29AABCD1234E1Z5",
    bankDetails: {
      bankName: "Demo Bank",
      accountNo: "000000000000",
      ifscCode: "DEMO0000001",
      branchName: "Demo Branch",
    },
    invoicePrefix: "D4",
    phone: "9000000000",
    email: "info@d4media.in",
    website: "https://d4media.in",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. Department
  const deptId = await upsert("departments", { name: "Management" }, {
    name: "Management",
    description: "Admin and management team",
    companyId,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 3. Admin user
  console.log("\n  Creating Admin user...");
  const adminPassword = await bcrypt.hash("Admin@123", 12);
  await upsert("staff", { email: "admin@d4media.in" }, {
    employeeCode: "D4-ADMIN",
    firstName: "Admin",
    lastName: "User",
    email: "admin@d4media.in",
    password: adminPassword,
    mobile: "9000000000",
    address: { street: "123 Demo Street", city: "Kochi", state: "Kerala", pincode: "682001" },
    dateOfBirth: new Date("1990-01-01"),
    gender: "Male",
    dateOfJoining: new Date("2024-01-01"),
    departmentId: deptId,
    companyId,
    designation: "System Administrator",
    baseSalary: 50000,
    currentSalary: 50000,
    status: "active",
    role: "admin",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 4. Staff user
  console.log("\n  Creating Staff user...");
  await upsert("staff", { email: "staff@d4media.in" }, {
    employeeCode: "D4-STAFF",
    firstName: "Staff",
    lastName: "Member",
    email: "staff@d4media.in",
    mobile: "9000010001",   // last 4 digits = 0001
    address: { street: "456 Demo Street", city: "Kochi", state: "Kerala", pincode: "682001" },
    dateOfBirth: new Date("1995-06-15"),
    gender: "Female",
    dateOfJoining: new Date("2024-06-01"),
    departmentId: deptId,
    companyId,
    designation: "Staff",
    baseSalary: 25000,
    currentSalary: 25000,
    status: "active",
    role: "staff",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`
✅  Demo seed complete!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ADMIN LOGIN  →  /login
  Email    : admin@d4media.in
  Password : Admin@123

  STAFF LOGIN  →  /staff-login
  Employee Code  : D4-STAFF
  Mobile (last 4): 0001
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

seed()
  .catch((err) => {
    console.error("\n❌  Seed failed:", err.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
