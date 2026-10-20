import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { effectiveSubject } from "@/lib/effective-grants";
import { hasFeature } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDB();
  // Fresh grants, not the login-time JWT snapshot — see effective-grants.ts
  if (!hasFeature(await effectiveSubject(user), "attendance-import")) {
    return NextResponse.json({ error: "You do not have permission to import attendance." }, { status: 403 });
  }

  const { batchId } = (await req.json()) as { batchId?: string };
  if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });

  const Batch = getModel("attendance_imports");
  const Attendance = getModel("attendance");

  const batch = (await Batch.findById(batchId).lean()) as { status?: string } | null;
  if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  if (batch.status === "rolled-back") {
    return NextResponse.json({ error: "This import has already been rolled back" }, { status: 400 });
  }

  // An approved request may since have claimed one of this batch's rows in
  // place — stamped by leave-writeback.ts, or source "leave" from the older
  // sync on the leaves page. That row is the request now, not the import's
  // reading, so rolling back must not take it along. What it remembers of the
  // import goes, though: withdrawing the request later must not restore data
  // from a batch that was rolled back.
  const claimed = { importBatchId: batchId, isDeleted: { $ne: true }, $or: [{ leaveRequestId: { $ne: null } }, { source: "leave" }] };
  await Attendance.updateMany(claimed, {
    $unset: { importBatchId: "", statusBeforeLeave: "", sourceBeforeLeave: "" },
    $set: { updatedAt: new Date() },
  });

  const result = await Attendance.updateMany(
    { importBatchId: batchId, isDeleted: { $ne: true }, leaveRequestId: null, source: { $ne: "leave" } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.name || user.email || "Unknown",
        updatedAt: new Date(),
      },
    }
  );

  await Batch.findByIdAndUpdate(batchId, {
    $set: { status: "rolled-back", rolledBackAt: new Date(), rolledBackBy: user.name || user.email || "Unknown", updatedAt: new Date() },
  });

  return NextResponse.json({ deletedCount: result.modifiedCount ?? 0 });
}
