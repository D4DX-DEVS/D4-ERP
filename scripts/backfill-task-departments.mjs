/**
 * One-off: tasks saved without departmentId are invisible to dept heads
 * (server read scope filters tasks by departmentId). Backfill from the
 * assignee's staff doc, falling back to the assigner's department.
 * Run: node scripts/backfill-task-departments.mjs
 */
import mongoose from "mongoose";
import { config } from "dotenv";
config();

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const tasks = await db
  .collection("tasks")
  .find({ $or: [{ departmentId: { $exists: false } }, { departmentId: "" }, { departmentId: null }] })
  .toArray();

const staffDept = new Map(
  (await db.collection("staff").find({}).project({ departmentId: 1 }).toArray()).map((s) => [
    s._id.toString(),
    s.departmentId || null,
  ])
);

let fixed = 0;
let skipped = 0;
for (const t of tasks) {
  const deptId = staffDept.get(String(t.assigneeId)) ?? staffDept.get(String(t.assignedBy));
  if (!deptId) {
    skipped++;
    console.log(`  skip "${t.title}" (${t._id}) — no department for assignee/assigner`);
    continue;
  }
  await db.collection("tasks").updateOne({ _id: t._id }, { $set: { departmentId: deptId, updatedAt: new Date() } });
  fixed++;
}

console.log(`✅ ${fixed} tasks backfilled, ${skipped} skipped, of ${tasks.length} missing departmentId`);
await mongoose.disconnect();
