import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import bcrypt from "bcryptjs";
import { signToken, sessionCookieOptions, AUTH_COOKIE, PWA_TOKEN_TTL_SECONDS } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // Brute-force protection (per IP).
    const limit = rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    await connectDB();
    const body = await req.json();

    // Coerce to strings to prevent NoSQL operator injection (e.g. { $ne: null }).
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const Staff = getModel("staff");
    const staff = (await Staff.findOne({ email, isActive: true }).lean()) as Record<
      string,
      unknown
    > | null;

    if (!staff) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (staff.role === "staff") {
      return NextResponse.json(
        { error: "Staff members should use the Staff Login portal" },
        { status: 403 }
      );
    }

    const passwordHash = staff.password as string | undefined;
    if (!passwordHash) {
      return NextResponse.json(
        { error: "Account not set up for login. Contact admin." },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const uid = (staff._id as object).toString();
    const grantedFeatures = Array.isArray(staff.grantedFeatures)
      ? (staff.grantedFeatures as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    // Installed PWA gets a long-lived session (one-time login, like a native app).
    const isPwa = body?.pwa === true;
    const ttl = isPwa ? PWA_TOKEN_TTL_SECONDS : undefined;
    const token = signToken(
      {
        uid,
        email: staff.email as string,
        role: staff.role as string,
        name: `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim(),
        features: grantedFeatures,
      },
      ttl
    );

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
        grantedFeatures,
      },
    });
    res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions(ttl));
    return res;
  } catch (error: unknown) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
