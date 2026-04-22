import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { employeeCode, mobile } = await req.json();

    if (!employeeCode || !mobile) {
      return NextResponse.json({ error: "Employee code and mobile are required" }, { status: 400 });
    }

    const Staff = getModel("staff");
    const staff = await Staff.findOne({
      employeeCode: employeeCode.toUpperCase(),
      isActive: true,
    }).lean() as Record<string, unknown> | null;

    if (!staff) {
      return NextResponse.json({ error: "Invalid employee code" }, { status: 401 });
    }

    // Verify mobile last 4 digits
    const staffMobile = staff.mobile as string;
    const mobileLast4 = staffMobile.slice(-4);
    if (mobileLast4 !== mobile.slice(-4)) {
      return NextResponse.json({ error: "Mobile number does not match" }, { status: 401 });
    }

    if (staff.status === "terminated") {
      return NextResponse.json({ error: "Your account has been terminated" }, { status: 403 });
    }

    if (staff.status === "suspended") {
      return NextResponse.json({ error: "Your account is currently suspended" }, { status: 403 });
    }

    return NextResponse.json({
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
    console.error("Staff login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
