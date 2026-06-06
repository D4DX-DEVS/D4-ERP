import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

// Lightweight edge gate: redirects unauthenticated users away from protected
// areas for a clean UX. Cryptographic enforcement happens in /api/db, which
// verifies the JWT on every data request — this only checks cookie presence.
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const loginPath = pathname.startsWith("/staff-portal") ? "/staff-login" : "/login";

  const url = req.nextUrl.clone();
  url.pathname = loginPath;
  url.search = "";
  url.searchParams.set("from", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/staff-portal/:path*"],
};
