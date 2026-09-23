import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { departmentHeadIds, type HeadStaff } from "@/lib/department-heads";

/**
 * Staff ids to notify when something needs an approver's attention.
 *
 * A department head cannot read the admins from the browser: `staff` reads are
 * scoped to their own department, so `where(role == admin)` came back empty and
 * their submissions notified nobody. Resolving the recipients here keeps the
 * scoping intact — this returns ids only, never staff records.
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = req.nextUrl.searchParams.get("role") === "accounts" ? "accounts" : "admin";
  const departmentId = req.nextUrl.searchParams.get("departmentId");

  await connectDB();
  const Staff = getModel("staff");

  // ?departmentId=… → the people who can decide that department's step: the
  // department heads by role, the same rule /api/db authorizes the decision on.
  if (departmentId) {
    const inDept = await Staff.find(
      { departmentId, role: "department-head" },
      { _id: 1, role: 1, departmentId: 1, isActive: 1, isDeleted: 1 }
    ).lean<(HeadStaff & { _id: unknown })[]>();
    const rows = inDept.map((s) => ({ ...s, id: String(s._id) }));
    return NextResponse.json({ ids: departmentHeadIds(rows, departmentId) });
  }

  const recipients = await Staff.find(
    { role, isActive: true, isDeleted: { $ne: true } },
    { _id: 1 }
  ).lean<{ _id: unknown }[]>();

  return NextResponse.json({ ids: recipients.map((r) => String(r._id)) });
}
