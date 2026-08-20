import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { getAuthUser, signToken, sessionCookieOptions, tokenTtlSeconds, AUTH_COOKIE } from "@/lib/auth";

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
  const res = NextResponse.json({ role: staff.role || user.role, grantedFeatures });

  // Slide the session forward on every workspace load. Without this the cookie
  // counts down from login and expires mid-use — an installed PWA that the OS
  // kills and relaunches then comes back logged out. Renewed with the window it
  // was issued with, so a browser login stays 7 days and a PWA login stays 90.
  const ttl = tokenTtlSeconds(req.cookies.get(AUTH_COOKIE)?.value);
  if (ttl) {
    res.cookies.set(AUTH_COOKIE, signToken(user, ttl), sessionCookieOptions(ttl));
  }
  return res;
}
