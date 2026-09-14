import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import {
  getAuthUser,
  signToken,
  sessionCookieOptions,
  tokenTtlSeconds,
  renewalTtlSeconds,
  AUTH_COOKIE,
  isSessionDeniedStatus,
} from "@/lib/auth";

interface StaffAuthState {
  role?: string;
  grantedFeatures?: unknown;
  status?: string;
  isDeleted?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyId?: unknown;
  departmentId?: unknown;
}

/**
 * Current effective authorization state, resolved from the staff document so
 * grant changes apply without re-login. The JWT is identity only.
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let staff: StaffAuthState | null;
  try {
    await connectDB();
    staff = (await getModel("staff")
      .findById(user.uid)
      .select("role grantedFeatures status isDeleted email firstName lastName companyId departmentId")
      .lean()) as StaffAuthState | null;
  } catch (error: unknown) {
    // A database blip must never read as an authentication failure: the client
    // logs out on 401, so returning one here would sign every user out whenever
    // Mongo hiccups or a cold start times out. 503 says "retry", not "you're out".
    console.error("Session sync error:", error);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  // Deleting staff is a soft delete (history is kept), so "row still exists" is
  // no longer proof of employment — a removed employee's live session ends here
  // instead of riding out the remaining cookie window. Same for someone who was
  // terminated or suspended after they logged in.
  if (!staff || staff.isDeleted || isSessionDeniedStatus(staff.status)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const grantedFeatures = Array.isArray(staff.grantedFeatures)
    ? (staff.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  // The full user goes out too, so a client that lost its localStorage copy can
  // rebuild the session from the cookie instead of making the employee log in
  // again — iOS evicts site storage long before it drops the cookie.
  const res = NextResponse.json({
    role: staff.role || user.role,
    grantedFeatures,
    user: {
      uid: user.uid,
      email: staff.email ?? user.email,
      role: staff.role || user.role,
      staffId: user.uid,
      firstName: staff.firstName ?? "",
      lastName: staff.lastName ?? "",
      companyId: staff.companyId ? String(staff.companyId) : "",
      departmentId: staff.departmentId ? String(staff.departmentId) : "",
      grantedFeatures,
    },
  });
  // This response carries a renewed session cookie and the caller's live
  // permissions; a cached copy would hand both to whoever loads the app next.
  res.headers.set("Cache-Control", "no-store, private");

  // Slide the session forward on every workspace load. Without this the cookie
  // counts down from login and expires mid-use — an installed PWA that the OS
  // kills and relaunches then comes back logged out. Renewed with the window it
  // was issued with; the x-pwa header upgrades a browser-issued session when the
  // app was installed after login.
  const issuedTtl = tokenTtlSeconds(req.cookies.get(AUTH_COOKIE)?.value);
  const ttl = renewalTtlSeconds(issuedTtl, req.headers.get("x-pwa") === "1");
  if (ttl) {
    // Renew with CURRENT role + grants, not the stale claims baked in at login —
    // otherwise a grant made after login never reaches token-checked endpoints.
    const fresh = { ...user, role: staff.role || user.role, features: grantedFeatures };
    res.cookies.set(AUTH_COOKIE, signToken(fresh, ttl), sessionCookieOptions(ttl));
  }
  return res;
}
