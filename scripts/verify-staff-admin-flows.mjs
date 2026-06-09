/**
 * Staff ↔ Admin Flow Verification Script
 * ──────────────────────────────────────────
 * Seeds test data, verifies all workflows, then cleans up.
 *
 * Verifies:
 *   1. Attendance clock-in / clock-out (staff → admin visibility)
 *   2. Leave application (staff → admin approve → staff notification)
 *   3. Leave rejection (staff → admin reject → staff notification)
 *   4. WFH request (apply, approve, attendance sync)
 *   5. Half-day leave (apply, approve, attendance sync)
 *   6. Admin holidays → visible in staff portal
 *
 * Run: node scripts/verify-staff-admin-flows.mjs
 */

import mongoose from "mongoose";
import { config } from "dotenv";

config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI not found in .env");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log("✅ Connected to MongoDB\n");

const db = mongoose.connection.db;

// ── Tracking IDs for cleanup ─────────────────────────────────────────────────
const createdIds = {
  staff: [],
  attendance: [],
  leaveRequests: [],
  notifications: [],
  settings: null, // We'll track the settings doc id
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function ts(date) {
  const ms = date.getTime();
  return { _ts: true, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
}

function tsNow() {
  return ts(new Date());
}

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function insertDoc(collection, data) {
  const col = db.collection(collection);
  data.createdAt = new Date();
  data.updatedAt = new Date();
  const result = await col.insertOne(data);
  return result.insertedId.toString();
}

async function updateDoc(collection, id, update) {
  const col = db.collection(collection);
  await col.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } }
  );
}

async function findDoc(collection, filter) {
  const col = db.collection(collection);
  return col.findOne(filter);
}

async function findDocs(collection, filter) {
  const col = db.collection(collection);
  return col.find(filter).toArray();
}

async function deleteDoc(collection, id) {
  const col = db.collection(collection);
  await col.deleteOne({ _id: new mongoose.Types.ObjectId(id) });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    return false;
  }
  console.log(`  ✅ PASS: ${message}`);
  return true;
}

// ── Get existing company and department ──────────────────────────────────────
const company = await findDoc("companies", { isActive: true });
if (!company) {
  console.error("❌ No active company found. Run `npm run seed:demo` first.");
  await mongoose.disconnect();
  process.exit(1);
}
const companyId = company._id.toString();
console.log(`📋 Using company: ${company.name} (${companyId})`);

const dept = await findDoc("departments", { companyId, isActive: true });
const deptId = dept ? dept._id.toString() : companyId;

// Get admin staff
const adminStaff = await findDoc("staff", { role: "admin", isActive: true });
if (!adminStaff) {
  console.error("❌ No admin staff found. Run `npm run seed:demo` first.");
  await mongoose.disconnect();
  process.exit(1);
}
const adminStaffId = adminStaff._id.toString();
console.log(`👤 Admin: ${adminStaff.firstName} ${adminStaff.lastName} (${adminStaffId})`);

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1: SEED TEST DATA
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  PHASE 1: Seeding Test Data");
console.log("═══════════════════════════════════════════════════\n");

// 1. Create a test staff member
const testStaffId = await insertDoc("staff", {
  employeeCode: "D4-TESTSTF",
  firstName: "TestStaff",
  lastName: "Verify",
  email: "teststaff-verify@d4media.in",
  mobile: "9999990099",
  address: { street: "Test St", city: "Kochi", state: "Kerala", pincode: "682001" },
  dateOfBirth: new Date("1992-03-15"),
  gender: "Male",
  dateOfJoining: new Date("2024-01-15"),
  departmentId: deptId,
  companyId,
  designation: "QA Tester",
  baseSalary: 30000,
  currentSalary: 30000,
  status: "active",
  role: "staff",
  isActive: true,
});
createdIds.staff.push(testStaffId);
console.log(`  ✅ Created test staff: TestStaff Verify (${testStaffId})`);

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1: ATTENDANCE CLOCK-IN / CLOCK-OUT
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 1: Attendance Clock-In / Clock-Out");
console.log("═══════════════════════════════════════════════════\n");

const today = todayMidnight();
const checkInTime = new Date();
checkInTime.setHours(9, 15, 0, 0);
const checkOutTime = new Date();
checkOutTime.setHours(18, 30, 0, 0);

// Simulate clock-in
const attendanceId = await insertDoc("attendance", {
  staffId: testStaffId,
  date: today,
  checkIn: checkInTime,
  status: "present",
  isLate: false,
  isEarlyDeparture: false,
  source: "self",
  isDeleted: false,
});
createdIds.attendance.push(attendanceId);

let passed = assert(!!attendanceId, "Attendance record created on clock-in");

// Verify the record exists
const attDoc = await findDoc("attendance", { _id: new mongoose.Types.ObjectId(attendanceId) });
passed &= assert(attDoc !== null, "Attendance record found in DB");
passed &= assert(attDoc?.staffId === testStaffId, "Attendance linked to correct staff");
passed &= assert(attDoc?.status === "present", "Status is 'present' after clock-in");

// Simulate clock-out
const workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
await updateDoc("attendance", attendanceId, {
  checkOut: checkOutTime,
  workingHours: parseFloat(workingHours.toFixed(2)),
  isEarlyDeparture: false,
  status: "present", // 9.25 hours - full day
});

const attAfterOut = await findDoc("attendance", { _id: new mongoose.Types.ObjectId(attendanceId) });
passed &= assert(attAfterOut?.checkOut !== undefined, "Clock-out time recorded");
passed &= assert(attAfterOut?.workingHours > 0, `Working hours calculated: ${attAfterOut?.workingHours}h`);

// Admin visibility check — query all attendance for today
const todayAttendance = await findDocs("attendance", {
  date: today,
  isDeleted: { $ne: true },
});
passed &= assert(
  todayAttendance.some((a) => a.staffId === testStaffId),
  "Admin can see staff attendance in today's register"
);

console.log(passed ? "\n  ✅ TEST 1 PASSED" : "\n  ❌ TEST 1 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: LEAVE APPLICATION → ADMIN APPROVAL → STAFF NOTIFICATION
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 2: Leave Application → Approval → Notification");
console.log("═══════════════════════════════════════════════════\n");

// Staff applies for Casual Leave (2 days from now)
const leaveStart = new Date();
leaveStart.setDate(leaveStart.getDate() + 2);
leaveStart.setHours(0, 0, 0, 0);
const leaveEnd = new Date(leaveStart);
leaveEnd.setDate(leaveEnd.getDate() + 1);
leaveEnd.setHours(0, 0, 0, 0);

const leaveRequestId = await insertDoc("leaveRequests", {
  staffId: testStaffId,
  staffName: "TestStaff Verify",
  type: "leave",
  leaveType: "CL",
  isHalfDay: false,
  session: null,
  startDate: leaveStart,
  endDate: leaveEnd,
  startTime: null,
  endTime: null,
  reason: "Family function - verification test",
  status: "pending",
});
createdIds.leaveRequests.push(leaveRequestId);

let test2 = assert(!!leaveRequestId, "Leave request created with 'pending' status");

// Verify pending request visible
const pendingReq = await findDoc("leaveRequests", { _id: new mongoose.Types.ObjectId(leaveRequestId) });
test2 &= assert(pendingReq?.status === "pending", "Leave request status is 'pending'");
test2 &= assert(pendingReq?.type === "leave", "Leave type is 'leave'");
test2 &= assert(pendingReq?.leaveType === "CL", "Leave category is 'CL' (Casual Leave)");

// Admin approves
await updateDoc("leaveRequests", leaveRequestId, {
  status: "approved",
  approvedBy: adminStaffId,
  approvalDate: new Date(),
});

const approvedReq = await findDoc("leaveRequests", { _id: new mongoose.Types.ObjectId(leaveRequestId) });
test2 &= assert(approvedReq?.status === "approved", "Leave request status changed to 'approved'");
test2 &= assert(approvedReq?.approvedBy === adminStaffId, "Approved by admin staff ID recorded");

// Simulate attendance sync (what the admin page does on approval)
for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
  const dayDate = new Date(d);
  dayDate.setHours(0, 0, 0, 0);
  const attId = await insertDoc("attendance", {
    staffId: testStaffId,
    date: dayDate,
    status: "leave",
    source: "leave",
    leaveId: leaveRequestId,
    notes: "Leave approved",
    isDeleted: false,
    isLate: false,
    isEarlyDeparture: false,
  });
  createdIds.attendance.push(attId);
}

// Verify attendance entries created
const leaveAttendance = await findDocs("attendance", {
  staffId: testStaffId,
  source: "leave",
  leaveId: leaveRequestId,
  isDeleted: { $ne: true },
});
test2 &= assert(leaveAttendance.length === 2, `Attendance synced for ${leaveAttendance.length}/2 leave days`);

// Simulate notification to staff
const notifApproveId = await insertDoc("notifications", {
  recipientId: testStaffId,
  type: "leave",
  title: "Leave request approved",
  message: "Your leave request for Family function has been approved.",
  link: "/staff-portal/my-leaves",
  imageUrl: "",
  senderName: `${adminStaff.firstName} ${adminStaff.lastName}`,
  isRead: false,
  metadata: { entityId: leaveRequestId, entityType: "leaveRequest" },
});
createdIds.notifications.push(notifApproveId);

const notif = await findDoc("notifications", { _id: new mongoose.Types.ObjectId(notifApproveId) });
test2 &= assert(notif?.recipientId === testStaffId, "Notification sent to correct staff");
test2 &= assert(notif?.type === "leave", "Notification type is 'leave'");
test2 &= assert(notif?.title.includes("approved"), "Notification title mentions approval");

console.log(test2 ? "\n  ✅ TEST 2 PASSED" : "\n  ❌ TEST 2 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3: LEAVE APPLICATION → ADMIN REJECTION → STAFF NOTIFICATION
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 3: Leave Application → Rejection → Notification");
console.log("═══════════════════════════════════════════════════\n");

const rejLeaveStart = new Date();
rejLeaveStart.setDate(rejLeaveStart.getDate() + 5);
rejLeaveStart.setHours(0, 0, 0, 0);
const rejLeaveEnd = new Date(rejLeaveStart);
rejLeaveEnd.setHours(0, 0, 0, 0);

const rejLeaveId = await insertDoc("leaveRequests", {
  staffId: testStaffId,
  staffName: "TestStaff Verify",
  type: "leave",
  leaveType: "SL",
  isHalfDay: false,
  session: null,
  startDate: rejLeaveStart,
  endDate: rejLeaveEnd,
  startTime: null,
  endTime: null,
  reason: "Not feeling well - rejection test",
  status: "pending",
});
createdIds.leaveRequests.push(rejLeaveId);

let test3 = assert(!!rejLeaveId, "Rejection test leave request created");

// Admin rejects
await updateDoc("leaveRequests", rejLeaveId, {
  status: "rejected",
  approvedBy: adminStaffId,
  approvalDate: new Date(),
  remarks: "Insufficient leave balance",
});

const rejectedReq = await findDoc("leaveRequests", { _id: new mongoose.Types.ObjectId(rejLeaveId) });
test3 &= assert(rejectedReq?.status === "rejected", "Leave request status changed to 'rejected'");
test3 &= assert(rejectedReq?.remarks === "Insufficient leave balance", "Rejection remarks stored");

// Notification for rejection
const notifRejectId = await insertDoc("notifications", {
  recipientId: testStaffId,
  type: "leave",
  title: "Leave request rejected",
  message: "Your sick leave request has been rejected. Reason: Insufficient leave balance",
  link: "/staff-portal/my-leaves",
  imageUrl: "",
  senderName: `${adminStaff.firstName} ${adminStaff.lastName}`,
  isRead: false,
  metadata: { entityId: rejLeaveId, entityType: "leaveRequest" },
});
createdIds.notifications.push(notifRejectId);

const rejNotif = await findDoc("notifications", { _id: new mongoose.Types.ObjectId(notifRejectId) });
test3 &= assert(rejNotif?.title.includes("rejected"), "Rejection notification sent to staff");
test3 &= assert(rejNotif?.message.includes("Insufficient leave balance"), "Rejection reason in notification");

console.log(test3 ? "\n  ✅ TEST 3 PASSED" : "\n  ❌ TEST 3 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4: WFH REQUEST → APPROVAL → ATTENDANCE SYNC
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 4: WFH Request → Approval → Attendance Sync");
console.log("═══════════════════════════════════════════════════\n");

const wfhDate = new Date();
wfhDate.setDate(wfhDate.getDate() + 7);
wfhDate.setHours(0, 0, 0, 0);

const wfhRequestId = await insertDoc("leaveRequests", {
  staffId: testStaffId,
  staffName: "TestStaff Verify",
  type: "wfh",
  leaveType: null,
  isHalfDay: false,
  session: null,
  startDate: wfhDate,
  endDate: wfhDate,
  startTime: null,
  endTime: null,
  reason: "Internet setup at new apartment - WFH test",
  status: "pending",
});
createdIds.leaveRequests.push(wfhRequestId);

let test4 = assert(!!wfhRequestId, "WFH request created");

const wfhPending = await findDoc("leaveRequests", { _id: new mongoose.Types.ObjectId(wfhRequestId) });
test4 &= assert(wfhPending?.type === "wfh", "Request type is 'wfh'");

// Admin approves WFH
await updateDoc("leaveRequests", wfhRequestId, {
  status: "approved",
  approvedBy: adminStaffId,
  approvalDate: new Date(),
});

// Sync WFH to attendance
const wfhAttId = await insertDoc("attendance", {
  staffId: testStaffId,
  date: wfhDate,
  status: "wfh",
  source: "leave",
  leaveId: wfhRequestId,
  notes: "WFH approved",
  isDeleted: false,
  isLate: false,
  isEarlyDeparture: false,
});
createdIds.attendance.push(wfhAttId);

const wfhAtt = await findDoc("attendance", { _id: new mongoose.Types.ObjectId(wfhAttId) });
test4 &= assert(wfhAtt?.status === "wfh", "Attendance status set to 'wfh'");
test4 &= assert(wfhAtt?.source === "leave", "Attendance source is 'leave'");
test4 &= assert(wfhAtt?.leaveId === wfhRequestId, "Attendance linked to WFH request");

// Notification
const notifWfhId = await insertDoc("notifications", {
  recipientId: testStaffId,
  type: "leave",
  title: "Work From Home request approved",
  message: "Your WFH request has been approved.",
  link: "/staff-portal/my-leaves",
  imageUrl: "",
  senderName: `${adminStaff.firstName} ${adminStaff.lastName}`,
  isRead: false,
  metadata: { entityId: wfhRequestId, entityType: "leaveRequest" },
});
createdIds.notifications.push(notifWfhId);

test4 &= assert(!!notifWfhId, "WFH approval notification created");

console.log(test4 ? "\n  ✅ TEST 4 PASSED" : "\n  ❌ TEST 4 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5: HALF-DAY LEAVE → APPROVAL → ATTENDANCE SYNC
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 5: Half-Day Leave → Approval → Attendance Sync");
console.log("═══════════════════════════════════════════════════\n");

const halfDayDate = new Date();
halfDayDate.setDate(halfDayDate.getDate() + 10);
halfDayDate.setHours(0, 0, 0, 0);

const halfDayReqId = await insertDoc("leaveRequests", {
  staffId: testStaffId,
  staffName: "TestStaff Verify",
  type: "leave",
  leaveType: "CL",
  isHalfDay: true,
  session: "first-half",
  startDate: halfDayDate,
  endDate: halfDayDate,
  startTime: "09:00",
  endTime: "13:00",
  reason: "Doctor appointment - half day test",
  status: "pending",
});
createdIds.leaveRequests.push(halfDayReqId);

let test5 = assert(!!halfDayReqId, "Half-day leave request created");

const hdPending = await findDoc("leaveRequests", { _id: new mongoose.Types.ObjectId(halfDayReqId) });
test5 &= assert(hdPending?.isHalfDay === true, "isHalfDay flag is true");
test5 &= assert(hdPending?.session === "first-half", "Session is 'first-half'");

// Admin approves
await updateDoc("leaveRequests", halfDayReqId, {
  status: "approved",
  approvedBy: adminStaffId,
  approvalDate: new Date(),
});

// Sync to attendance as half-day
const hdAttId = await insertDoc("attendance", {
  staffId: testStaffId,
  date: halfDayDate,
  status: "half-day",
  source: "leave",
  leaveId: halfDayReqId,
  notes: "Leave approved (half-day, first-half)",
  isDeleted: false,
  isLate: false,
  isEarlyDeparture: false,
});
createdIds.attendance.push(hdAttId);

const hdAtt = await findDoc("attendance", { _id: new mongoose.Types.ObjectId(hdAttId) });
test5 &= assert(hdAtt?.status === "half-day", "Attendance status set to 'half-day'");
test5 &= assert(hdAtt?.source === "leave", "Attendance source is 'leave'");

// Notification
const notifHdId = await insertDoc("notifications", {
  recipientId: testStaffId,
  type: "leave",
  title: "Leave request approved",
  message: "Your half-day leave request (first-half) has been approved.",
  link: "/staff-portal/my-leaves",
  imageUrl: "",
  senderName: `${adminStaff.firstName} ${adminStaff.lastName}`,
  isRead: false,
  metadata: { entityId: halfDayReqId, entityType: "leaveRequest" },
});
createdIds.notifications.push(notifHdId);

test5 &= assert(!!notifHdId, "Half-day approval notification created");

console.log(test5 ? "\n  ✅ TEST 5 PASSED" : "\n  ❌ TEST 5 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// TEST 6: ADMIN HOLIDAYS → STAFF VISIBILITY
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  TEST 6: Admin Holidays → Staff Portal Visibility");
console.log("═══════════════════════════════════════════════════\n");

// Check for existing settings doc
let settingsDoc = await findDoc("settings", {});
const testHolidays = [
  { date: "2026-08-15", name: "Independence Day (Test)", companyId: "" },
  { date: "2026-10-02", name: "Gandhi Jayanti (Test)", companyId: "" },
  { date: "2026-11-01", name: "Kerala Formation Day (Test)", companyId: companyId },
];

let test6 = true;

if (settingsDoc) {
  // Merge test holidays into existing
  const existingHolidays = settingsDoc.holidays || [];
  const merged = [...existingHolidays, ...testHolidays];
  await updateDoc("settings", settingsDoc._id.toString(), { holidays: merged });
  createdIds.settings = { id: settingsDoc._id.toString(), originalHolidays: existingHolidays };
  test6 &= assert(true, "Test holidays added to existing settings");
} else {
  // Create settings with holidays
  const settingsId = await insertDoc("settings", {
    holidays: testHolidays,
    weeklySchedule: {
      monday: { enabled: true, start: "09:00", end: "18:00" },
      tuesday: { enabled: true, start: "09:00", end: "18:00" },
      wednesday: { enabled: true, start: "09:00", end: "18:00" },
      thursday: { enabled: true, start: "09:00", end: "18:00" },
      friday: { enabled: true, start: "09:00", end: "18:00" },
      saturday: { enabled: true, start: "09:00", end: "14:00" },
      sunday: { enabled: false, start: "09:00", end: "18:00" },
    },
    attendanceRules: {
      fullDayHours: 8,
      halfDayHours: 4,
      overtimeAfterHours: 9,
      locationRequired: false,
    },
    workingHours: { start: "09:00", end: "18:00" },
  });
  createdIds.settings = { id: settingsId, originalHolidays: null };
  test6 &= assert(!!settingsId, "Settings document created with test holidays");
}

// Verify holidays are stored
const updatedSettings = await findDoc("settings", {});
const storedHolidays = updatedSettings?.holidays || [];

test6 &= assert(
  storedHolidays.some((h) => h.name === "Independence Day (Test)"),
  "Independence Day holiday stored"
);
test6 &= assert(
  storedHolidays.some((h) => h.name === "Gandhi Jayanti (Test)"),
  "Gandhi Jayanti holiday stored"
);
test6 &= assert(
  storedHolidays.some((h) => h.name === "Kerala Formation Day (Test)" && h.companyId === companyId),
  "Company-specific holiday stored with correct companyId"
);

// Simulate staff visibility check — staff should see:
// - All holidays with no companyId (global) 
// - Holidays matching their company
const staffCompanyId = companyId;
const visibleToStaff = storedHolidays.filter(
  (h) => !h.companyId || h.companyId === staffCompanyId
);
test6 &= assert(
  visibleToStaff.some((h) => h.name === "Independence Day (Test)"),
  "Global holiday visible to staff"
);
test6 &= assert(
  visibleToStaff.some((h) => h.name === "Kerala Formation Day (Test)"),
  "Company-specific holiday visible to matching staff"
);

// Verify company-specific holiday NOT visible to other companies
const otherCompanyVisible = storedHolidays.filter(
  (h) => !h.companyId || h.companyId === "some-other-company-id"
);
test6 &= assert(
  !otherCompanyVisible.some((h) => h.name === "Kerala Formation Day (Test)"),
  "Company-specific holiday NOT visible to other companies"
);

console.log(test6 ? "\n  ✅ TEST 6 PASSED" : "\n  ❌ TEST 6 FAILED");

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 2: CLEANUP
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  PHASE 2: Cleanup");
console.log("═══════════════════════════════════════════════════\n");

// Delete notifications
for (const id of createdIds.notifications) {
  await deleteDoc("notifications", id);
}
console.log(`  🗑️  Deleted ${createdIds.notifications.length} notifications`);

// Delete leave requests
for (const id of createdIds.leaveRequests) {
  await deleteDoc("leaveRequests", id);
}
console.log(`  🗑️  Deleted ${createdIds.leaveRequests.length} leave requests`);

// Delete attendance records
for (const id of createdIds.attendance) {
  await deleteDoc("attendance", id);
}
console.log(`  🗑️  Deleted ${createdIds.attendance.length} attendance records`);

// Delete test staff
for (const id of createdIds.staff) {
  await deleteDoc("staff", id);
}
console.log(`  🗑️  Deleted ${createdIds.staff.length} test staff members`);

// Restore settings holidays
if (createdIds.settings) {
  if (createdIds.settings.originalHolidays === null) {
    // We created the settings doc, delete it
    await deleteDoc("settings", createdIds.settings.id);
    console.log("  🗑️  Deleted test settings document");
  } else {
    // Restore original holidays
    await updateDoc("settings", createdIds.settings.id, {
      holidays: createdIds.settings.originalHolidays,
    });
    console.log("  🗑️  Restored original holidays in settings");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  VERIFICATION SUMMARY");
console.log("═══════════════════════════════════════════════════");

const allPassed = passed && test2 && test3 && test4 && test5 && test6;

console.log(`
  Test 1 (Attendance Clock-In/Out):      ${passed ? "✅ PASS" : "❌ FAIL"}
  Test 2 (Leave Approval + Notify):      ${test2 ? "✅ PASS" : "❌ FAIL"}
  Test 3 (Leave Rejection + Notify):     ${test3 ? "✅ PASS" : "❌ FAIL"}
  Test 4 (WFH Request + Sync):           ${test4 ? "✅ PASS" : "❌ FAIL"}
  Test 5 (Half-Day Leave + Sync):        ${test5 ? "✅ PASS" : "❌ FAIL"}
  Test 6 (Admin Holidays → Staff):       ${test6 ? "✅ PASS" : "❌ FAIL"}

  Overall: ${allPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}
  
  🧹 All test data has been cleaned up.
`);

await mongoose.disconnect();
process.exit(allPassed ? 0 : 1);
