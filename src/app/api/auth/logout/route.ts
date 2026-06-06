import { NextResponse } from "next/server";
import { AUTH_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  // Expire the session cookie immediately.
  res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
  return res;
}
