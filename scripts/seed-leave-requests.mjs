/**
 * Seed sample leave requests for filter testing.
 * Run: node scripts/seed-leave-requests.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const staff = await db.collection("staff").find({ isActive: true }).toArray();
if (staff.length < 2) {
  console.log("Need at least 2 staff. Run seed:demo first.");
  await mongoose.disconnect();
  process.exit(0);
}

const requests = [
  { staffId: staff[0]._id.toString(), staffName: `${staff[0].firstName} ${staff[0].lastName}`, type: "leave", leaveType: "CL", isHalfDay: false, startDate: new Date("2026-06-15"), endDate: new Date("2026-06-16"), reason: "Family vacation", status: "pending" },
  { staffId: staff[1]._id.toString(), staffName: `${staff[1].firstName} ${staff[1].lastName}`, type: "wfh", leaveType: null, isHalfDay: false, startDate: new Date("2026-06-17"), endDate: new Date("2026-06-17"), reason: "Plumber visit at home", status: "pending" },
  { staffId: staff[0]._id.toString(), staffName: `${staff[0].firstName} ${staff[0].lastName}`, type: "leave", leaveType: "SL", isHalfDay: true, session: "first-half", startDate: new Date("2026-06-20"), endDate: new Date("2026-06-20"), startTime: "09:00", endTime: "13:00", reason: "Doctor appointment", status: "pending" },
  { staffId: staff[1]._id.toString(), staffName: `${staff[1].firstName} ${staff[1].lastName}`, type: "leave", leaveType: "EL", isHalfDay: false, startDate: new Date("2026-06-25"), endDate: new Date("2026-06-27"), reason: "Travel to hometown", status: "approved", approvedBy: staff[0]._id.toString(), approvalDate: new Date() },
  { staffId: staff[0]._id.toString(), staffName: `${staff[0].firstName} ${staff[0].lastName}`, type: "on-duty", leaveType: null, isHalfDay: false, startDate: new Date("2026-06-22"), endDate: new Date("2026-06-22"), reason: "Client meeting at Trivandrum", status: "pending" },
  { staffId: staff[1]._id.toString(), staffName: `${staff[1].firstName} ${staff[1].lastName}`, type: "leave", leaveType: "CL", isHalfDay: false, startDate: new Date("2026-06-10"), endDate: new Date("2026-06-10"), reason: "Personal errand", status: "rejected", approvedBy: staff[0]._id.toString(), approvalDate: new Date() },
];

for (const req of requests) {
  await db.collection("leaveRequests").insertOne({
    ...req,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

console.log(`✅ Seeded ${requests.length} leave requests`);
console.log("Staff involved:", staff.slice(0, 2).map(s => `${s.firstName} ${s.lastName}`).join(", "));
await mongoose.disconnect();
