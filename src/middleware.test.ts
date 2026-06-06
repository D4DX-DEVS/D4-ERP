import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

function request(pathname: string, opts?: { cookie?: string }): NextRequest {
  const headers = new Headers();
  if (opts?.cookie) headers.set("cookie", opts.cookie);
  return new NextRequest(`https://app.test${pathname}`, { headers });
}

describe("middleware route protection", () => {
  it("allows dashboard access when a session cookie is present", () => {
    const res = middleware(request("/dashboard", { cookie: `${AUTH_COOKIE}=anytoken` }));
    // NextResponse.next() has no redirect Location header.
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated dashboard access to /login", () => {
    const res = middleware(request("/dashboard/invoices"));
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("from=%2Fdashboard%2Finvoices");
  });

  it("redirects unauthenticated staff-portal access to /staff-login", () => {
    const res = middleware(request("/staff-portal/attendance"));
    const location = res.headers.get("location");
    expect(location).toContain("/staff-login");
    expect(location).toContain("from=%2Fstaff-portal%2Fattendance");
  });

  it("allows staff-portal access with a session cookie", () => {
    const res = middleware(request("/staff-portal", { cookie: `${AUTH_COOKIE}=t` }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("preserves the original query string in the from param", () => {
    const res = middleware(request("/dashboard/staff?page=2"));
    const location = res.headers.get("location") || "";
    expect(decodeURIComponent(location)).toContain("from=/dashboard/staff?page=2");
  });
});
