import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import { signToken, sessionCookieOptions, AUTH_COOKIE } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Brute-force protection (per IP).
    const limit = rateLimit(`staff-login:${clientIp(req)}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    await connectDB();
    const body = await req.json();

    // Coerce to strings to prevent NoSQL operator injection.
    const employeeCode = typeof body?.employeeCode === "string" ? body.employeeCode.trim() : "";
    const mobile = typeof body?.mobile === "string" ? body.mobile.trim() : "";

    if (!employeeCode || !mobile) {
      return NextResponse.json({ error: "Employee code and mobile are required" }, { status: 400 });
    }

    const Staff = getModel("staff");
    const staff = (await Staff.findOne({
      employeeCode: employeeCode.toUpperCase(),
      isActive: true,
    }).lean()) as Record<string, unknown> | null;

    if (!staff) {
      return NextResponse.json({ error: "Invalid employee code" }, { status: 401 });
    }

    // Verify mobile last 4 digits
    const staffMobile = (staff.mobile as string) || "";
    const mobileLast4 = staffMobile.slice(-4);
    if (!mobileLast4 || mobileLast4 !== mobile.slice(-4)) {
      return NextResponse.json({ error: "Mobile number does not match" }, { status: 401 });
    }

    if (staff.status === "terminated") {
      return NextResponse.json({ error: "Your account has been terminated" }, { status: 403 });
    }

    if (staff.status === "suspended") {
      return NextResponse.json({ error: "Your account is currently suspended" }, { status: 403 });
    }

    const uid = (staff._id as object).toString();
    const token = signToken({
      uid,
      email: (staff.email as string) || "",
      role: (staff.role as string) || "staff",
      name: `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim(),
    });

    const res = NextResponse.json({
      user: {
        uid,
        email: staff.email,
        role: staff.role,
        staffId: uid,
        firstName: staff.firstName,
        lastName: staff.lastName,
        companyId: staff.companyId,
        departmentId: staff.departmentId,
      },
    });
    res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (error: unknown) {
    console.error("Staff login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
