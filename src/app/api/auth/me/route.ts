import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser } from "@/lib/auth";

/**
 * Current effective authorization state, resolved from the staff document so
 * grant changes apply without re-login. The JWT is identity only.
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const staff = (await getModel("staff")
    .findById(user.uid)
    .select("role grantedFeatures status")
    .lean()) as { role?: string; grantedFeatures?: unknown; status?: string } | null;
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const grantedFeatures = Array.isArray(staff.grantedFeatures)
    ? (staff.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  return NextResponse.json({ role: staff.role || user.role, grantedFeatures });
}
