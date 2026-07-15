import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasFeature({ role: user.role, grantedFeatures: user.features }, "attendance-import")) {
    return NextResponse.json({ error: "You do not have permission to import attendance." }, { status: 403 });
  }

  await connectDB();
  const Staff = getModel("staff");
  const staffDocs = (await Staff.find({}, { biometricId: 1, employeeCode: 1 }).lean()) as unknown as {
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
