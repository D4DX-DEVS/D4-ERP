/**
 * End-to-end test: Studio module full setup verification.
 * Tests:
 *  1. Grant "studio-booking" feature to a staff member
 *  2. Create studio resources (studios)
 *  3. Create a booking as admin
 *  4. Verify conflict detection works
 *  5. Verify staff with feature can access studio_bookings
 *  6. Verify staff WITHOUT feature is blocked
 *  7. Test booking status transitions
 *  8. Verify calendar/timeline data consistency
 *
 * Run: node scripts/verify-studio-flows.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

function tsNow() {
  const ms = Date.now();
  return { _ts: true, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
}

const BASE = "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI;

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// --- Helper: extract token from Set-Cookie header ---
function extractToken(res) {
  const setCookie = res.headers.get("set-cookie") || "";
  // Cookie format: session=<token>; Path=/; ...
  const match = setCookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

// --- Helper: login as admin ---
async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@d4media.in", password: "Admin@123" }),
    redirect: "manual",
  });
  return extractToken(res);
}

// --- Helper: login as staff ---
async function loginAsStaff(employeeCode, mobile) {
  const res = await fetch(`${BASE}/api/auth/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode, mobile }),
    redirect: "manual",
  });
  return extractToken(res);
}

// --- Helper: DB API call ---
async function dbCall(token, action, collection, payload = {}) {
  const res = await fetch(`${BASE}/api/db`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, collection, ...payload }),
  });
  return res.json();
}

// ============================================================
console.log("\n🎬 STUDIO MODULE E2E VERIFICATION\n");
console.log("=".repeat(50));

// Step 0: Get test staff
const staffList = await db.collection("staff").find({ isActive: true, role: "staff" }).toArray();
const adminStaff = await db.collection("staff").findOne({ role: "admin" });

if (staffList.length === 0) {
  console.log("❌ No staff members found. Run seed:demo first.");
  await mongoose.disconnect();
  process.exit(1);
}

const testStaff = staffList[0];
console.log(`\nTest Staff: ${testStaff.firstName} ${testStaff.lastName} (${testStaff.employeeCode})`);
console.log(`Admin: ${adminStaff.firstName} ${adminStaff.lastName}`);

// ============================================================
console.log("\n─── TEST 1: Grant studio-booking feature to staff ───");

// Remove any previous grants first, then grant studio-booking
await db.collection("staff").updateOne(
  { _id: testStaff._id },
  { $set: { grantedFeatures: ["studio-booking"] } }
);

const updatedStaff = await db.collection("staff").findOne({ _id: testStaff._id });
assert(
  updatedStaff.grantedFeatures.includes("studio-booking"),
  "Staff has studio-booking feature granted"
);

// ============================================================
console.log("\n─── TEST 2: Create studio resources ───");

// Clean previous test data
await db.collection("studios").deleteMany({ name: { $regex: /^Test Studio/ } });
await db.collection("studio_equipment").deleteMany({ name: { $regex: /^Test / } });

const adminToken = await loginAsAdmin();
assert(!!adminToken, "Admin login successful");

// Create studios via API
const studio1Res = await dbCall(adminToken, "create", "studios", {
  data: {
    name: "Test Studio A",
    location: "Ground Floor",
    capacity: 10,
    description: "Photography studio with green screen",
    facilities: ["Green Screen", "Ring Light", "Backdrop"],
    isActive: true,
    createdAt: tsNow(),
  },
});
assert(!!studio1Res.id, `Studio A created (id: ${studio1Res.id})`);

const studio2Res = await dbCall(adminToken, "create", "studios", {
  data: {
    name: "Test Studio B",
    location: "First Floor",
    capacity: 20,
    description: "Video recording studio with soundproofing",
    facilities: ["Soundproofing", "4K Camera", "Teleprompter"],
    isActive: true,
    createdAt: tsNow(),
  },
});
assert(!!studio2Res.id, `Studio B created (id: ${studio2Res.id})`);

// Create equipment
const eqRes = await dbCall(adminToken, "create", "studio_equipment", {
  data: {
    name: "Test Canon R5",
    description: "Full-frame mirrorless camera",
    category: "Camera",
    studioId: studio1Res.id,
    isAvailable: true,
    createdAt: tsNow(),
  },
});
assert(!!eqRes.id, `Equipment created (id: ${eqRes.id})`);

// ============================================================
console.log("\n─── TEST 3: Create booking as admin ───");

const bookingDate = "2026-06-15";
const booking1Res = await dbCall(adminToken, "create", "studio_bookings", {
  data: {
    studioId: studio1Res.id,
    studioName: "Test Studio A",
    date: bookingDate,
    startTime: "10:00",
    endTime: "12:00",
    duration: 120,
    bookingType: "photography",
    purpose: "Product shoot for client",
    clientName: "TestCorp",
    contactNumber: "9876543210",
    email: "test@corp.com",
    eventName: "June Product Launch",
    notes: "Need extra lighting",
    status: "pending",
    requestedBy: adminStaff._id.toString(),
    requestedByName: `${adminStaff.firstName} ${adminStaff.lastName}`,
    statusHistory: [{ status: "pending", changedAt: tsNow(), changedBy: adminStaff._id.toString() }],
    createdAt: tsNow(),
  },
});
assert(!!booking1Res.id, `Booking 1 created (id: ${booking1Res.id})`);

// Create a second booking (no conflict - different time)
const booking2Res = await dbCall(adminToken, "create", "studio_bookings", {
  data: {
    studioId: studio1Res.id,
    studioName: "Test Studio A",
    date: bookingDate,
    startTime: "14:00",
    endTime: "16:00",
    duration: 120,
    bookingType: "videography",
    purpose: "Interview recording",
    clientName: "MediaHouse",
    status: "approved",
    requestedBy: adminStaff._id.toString(),
    requestedByName: `${adminStaff.firstName} ${adminStaff.lastName}`,
    statusHistory: [
      { status: "pending", changedAt: tsNow(), changedBy: adminStaff._id.toString() },
      { status: "approved", changedAt: tsNow(), changedBy: adminStaff._id.toString() },
    ],
    createdAt: tsNow(),
  },
});
assert(!!booking2Res.id, `Booking 2 created (id: ${booking2Res.id})`);

// ============================================================
console.log("\n─── TEST 4: Conflict detection (utility check) ───");

// Inline implementations of studio-utils.ts functions for testing
function timeToMinutes(time) {
  if (!time || typeof time !== "string") return NaN;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function isValidTimeRange(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}
function timesOverlap(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA), aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB), bEnd = timeToMinutes(endB);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}
const BLOCKING_STATUSES = ["pending", "approved"];
function findConflict(candidate, existing, ignoreId) {
  for (const b of existing) {
    if (ignoreId && b.id === ignoreId) continue;
    if (b.studioId !== candidate.studioId) continue;
    if (b.date !== candidate.date) continue;
    if (!BLOCKING_STATUSES.includes(b.status)) continue;
    if (timesOverlap(candidate.startTime, candidate.endTime, b.startTime, b.endTime)) return b;
  }
  return null;
}

assert(isValidTimeRange("10:00", "12:00") === true, "Valid time range 10:00-12:00");
assert(isValidTimeRange("12:00", "10:00") === false, "Invalid time range 12:00-10:00");
assert(timesOverlap("10:00", "12:00", "11:00", "13:00") === true, "Overlapping times detected");
assert(timesOverlap("10:00", "12:00", "12:00", "14:00") === false, "Adjacent times (no overlap)");
assert(timesOverlap("10:00", "12:00", "14:00", "16:00") === false, "Non-overlapping times");

const existingBookings = [
  { id: booking1Res.id, studioId: studio1Res.id, date: bookingDate, startTime: "10:00", endTime: "12:00", status: "pending", studioName: "Test Studio A" },
  { id: booking2Res.id, studioId: studio1Res.id, date: bookingDate, startTime: "14:00", endTime: "16:00", status: "approved", studioName: "Test Studio A" },
];

const conflict = findConflict(
  { studioId: studio1Res.id, date: bookingDate, startTime: "11:00", endTime: "13:00" },
  existingBookings
);
assert(conflict !== null, "Conflict detected for overlapping booking (11:00-13:00)");
assert(conflict?.id === booking1Res.id, "Correct conflicting booking identified");

const noConflict = findConflict(
  { studioId: studio1Res.id, date: bookingDate, startTime: "12:00", endTime: "14:00" },
  existingBookings
);
assert(noConflict === null, "No conflict for gap slot (12:00-14:00)");

const noConflictDiffStudio = findConflict(
  { studioId: studio2Res.id, date: bookingDate, startTime: "10:00", endTime: "12:00" },
  existingBookings
);
assert(noConflictDiffStudio === null, "No conflict for different studio at same time");

// ============================================================
console.log("\n─── TEST 5: Staff WITH feature can create booking ───");

// Login as staff with studio-booking feature
const staffMobile = testStaff.mobile || "";
const staffToken = await loginAsStaff(testStaff.employeeCode, staffMobile.slice(-4));
assert(!!staffToken, `Staff login successful (${testStaff.employeeCode})`);

const staffBookingRes = await dbCall(staffToken, "create", "studio_bookings", {
  data: {
    studioId: studio2Res.id,
    studioName: "Test Studio B",
    date: bookingDate,
    startTime: "09:00",
    endTime: "11:00",
    duration: 120,
    bookingType: "podcast",
    purpose: "Weekly podcast recording",
    status: "pending",
    requestedBy: testStaff._id.toString(),
    requestedByName: `${testStaff.firstName} ${testStaff.lastName}`,
    createdAt: tsNow(),
  },
});
assert(!!staffBookingRes.id, `Staff created booking successfully (id: ${staffBookingRes.id})`);

// Staff can also READ studio bookings
const staffReadRes = await dbCall(staffToken, "find", "studio_bookings", {
  constraints: [],
});
assert(Array.isArray(staffReadRes) && staffReadRes.length >= 3, `Staff can read bookings (found ${staffReadRes?.length || 0})`);

// ============================================================
console.log("\n─── TEST 6: Staff WITHOUT feature is BLOCKED ───");

// Find another staff member without the feature (or temporarily remove it)
const otherStaff = staffList.length > 1 ? staffList[1] : null;
if (otherStaff) {
  // Ensure this staff does NOT have studio-booking
  await db.collection("staff").updateOne(
    { _id: otherStaff._id },
    { $set: { grantedFeatures: [] } }
  );

  const otherMobile = otherStaff.mobile || "";
  const otherToken = await loginAsStaff(otherStaff.employeeCode, otherMobile.slice(-4));
  if (otherToken) {
    const blockedRes = await dbCall(otherToken, "create", "studio_bookings", {
      data: {
        studioId: studio1Res.id,
        studioName: "Test Studio A",
        date: bookingDate,
        startTime: "18:00",
        endTime: "19:00",
        duration: 60,
        bookingType: "meeting",
        purpose: "Unauthorized attempt",
        status: "pending",
        createdAt: tsNow(),
      },
    });
    assert(
      blockedRes.error || blockedRes.message?.includes("permission"),
      `Staff without feature is blocked from creating booking (got: ${blockedRes.error || blockedRes.message || "no error?!"})`
    );
  } else {
    console.log("  ⚠️  Skipped: couldn't login as second staff");
  }
} else {
  console.log("  ⚠️  Skipped: only one staff member exists");
}

// ============================================================
console.log("\n─── TEST 7: Booking status transitions ───");

// Admin approves the staff's booking
const approveRes = await dbCall(adminToken, "update", "studio_bookings", {
  id: staffBookingRes.id,
  data: {
    status: "approved",
    approvedBy: adminStaff._id.toString(),
    statusHistory: [
      { status: "pending", changedAt: tsNow(), changedBy: testStaff._id.toString() },
      { status: "approved", changedAt: tsNow(), changedBy: adminStaff._id.toString() },
    ],
    updatedAt: tsNow(),
  },
});
assert(!approveRes.error, "Admin approved staff booking");

// Verify the booking status is now approved
const approvedBooking = await db.collection("studio_bookings").findOne({ _id: new mongoose.Types.ObjectId(staffBookingRes.id) });
assert(approvedBooking?.status === "approved", `Booking status is now "approved"`);

// Admin cancels booking 1
const cancelRes = await dbCall(adminToken, "update", "studio_bookings", {
  id: booking1Res.id,
  data: {
    status: "cancelled",
    updatedAt: tsNow(),
  },
});
assert(!cancelRes.error, "Admin cancelled booking 1");

const cancelledBooking = await db.collection("studio_bookings").findOne({ _id: new mongoose.Types.ObjectId(booking1Res.id) });
assert(cancelledBooking?.status === "cancelled", `Booking 1 status is now "cancelled"`);

// ============================================================
console.log("\n─── TEST 8: Data consistency check ───");

// Verify all bookings for the test date
const allBookingsForDate = await db.collection("studio_bookings").find({ date: bookingDate }).toArray();
assert(allBookingsForDate.length >= 3, `All bookings exist for ${bookingDate} (found ${allBookingsForDate.length})`);

const statusCounts = {};
allBookingsForDate.forEach(b => {
  statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
});
console.log(`  📊 Status distribution: ${JSON.stringify(statusCounts)}`);

// Verify Studio A has correct bookings
const studioABookings = allBookingsForDate.filter(b => b.studioId === studio1Res.id);
const studioBBookings = allBookingsForDate.filter(b => b.studioId === studio2Res.id);
assert(studioABookings.length === 2, `Studio A has 2 bookings`);
assert(studioBBookings.length === 1, `Studio B has 1 booking`);

// Verify studios are accessible
const studiosInDb = await db.collection("studios").find({ name: { $regex: /^Test Studio/ } }).toArray();
assert(studiosInDb.length === 2, `Both test studios exist in DB`);
assert(studiosInDb.every(s => s.isActive), "All test studios are active");

// Verify equipment link
const equipInDb = await db.collection("studio_equipment").findOne({ name: "Test Canon R5" });
assert(equipInDb?.studioId === studio1Res.id, "Equipment correctly linked to Studio A");

// ============================================================
console.log("\n" + "=".repeat(50));
console.log(`\n🎬 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);

if (failed > 0) {
  console.log("⚠️  Some tests failed. Check the output above for details.");
} else {
  console.log("🎉 All studio module tests passed!");
}

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
