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

  const Staff = getModel("staff");
  // Removed staff never take new punches — their device code shows as unmapped
  // so the admin decides, instead of silently writing rows against a dead row.
  const staffDocs = (await Staff.find({ isDeleted: { $ne: true } }, { biometricId: 1, employeeCode: 1 }).lean()) as unknown as {
    _id: unknown;
    biometricId?: string;
    employeeCode?: string;
  }[];

  const byBiometricId: [string, string][] = [];
  const byEmployeeCode: [string, string][] = [];

  for (const s of staffDocs) {
    const id = String(s._id);
    if (s.biometricId) byBiometricId.push([s.biometricId, id]);
    if (s.employeeCode) byEmployeeCode.push([s.employeeCode, id]);
  }

  return NextResponse.json({ byBiometricId, byEmployeeCode });
}
