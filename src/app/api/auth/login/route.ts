import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "d4media-erp-secret-key";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const Staff = getModel("staff");
    const staff = await Staff.findOne({ email, isActive: true }).lean() as Record<string, unknown> | null;

    if (!staff) {
      return NextResponse.json({ error: "No active staff account found for this email" }, { status: 401 });
    }

    if (staff.role === "staff") {
      return NextResponse.json({ error: "Staff members should use the Staff Login portal" }, { status: 403 });
    }

    // Verify password
    const passwordHash = staff.password as string;
    if (!passwordHash) {
      return NextResponse.json({ error: "Account not set up for login. Contact admin." }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Generate JWT
    const token = jwt.sign(
      { uid: (staff._id as object).toString(), email: staff.email, role: staff.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return NextResponse.json({
      token,
      user: {
        uid: (staff._id as object).toString(),
        email: staff.email,
        role: staff.role,
        staffId: (staff._id as object).toString(),
        firstName: staff.firstName,
        lastName: staff.lastName,
        companyId: staff.companyId,
        departmentId: staff.departmentId,
      },
    });
  } catch (error: unknown) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
