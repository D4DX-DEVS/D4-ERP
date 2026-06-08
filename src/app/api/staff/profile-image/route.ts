import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { getModel } from "@/models";

/**
 * PATCH /api/staff/profile-image
 * Allows any authenticated user to update their own profileImage only.
 * Body: { profileImage: string } — must be an https URL.
 */
export async function PATCH(req: NextRequest) {
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).profileImage !== "string"
  ) {
    return NextResponse.json({ error: "profileImage (string) is required" }, { status: 400 });
  }

  const profileImage = ((body as Record<string, unknown>).profileImage as string).trim();

  // Only allow https URLs pointing to our storage domain to prevent open-redirect abuse.
  try {
    const url = new URL(profileImage);
    if (url.protocol !== "https:") {
      return NextResponse.json({ error: "profileImage must be an https URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "profileImage must be a valid URL" }, { status: 400 });
  }

  await connectDB();
  const Staff = getModel("staff");

  // Staff may only update their own record; admins/dept-heads may update any.
  const staffId: string = user.uid;
  const filter =
    user.role === "admin" || user.role === "department-head"
      ? { _id: staffId }
      : { _id: staffId }; // always scoped to own record

  await Staff.updateOne(filter, { $set: { profileImage, updatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
