import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const connectDB = vi.fn().mockResolvedValue(undefined);
const findById = vi.fn();
vi.mock("@/lib/mongodb", () => ({ connectDB: (...a: unknown[]) => connectDB(...a) }));
vi.mock("@/models", () => ({ getModel: () => ({ findById }) }));

import { GET } from "@/app/api/auth/me/route";
import { AUTH_COOKIE } from "@/lib/auth-cookie";
import { signToken, pwaTtlSeconds, browserTtlSeconds } from "@/lib/auth";

const USER = { uid: "507f1f77bcf86cd799439011", email: "a@d4.in", role: "admin", name: "Ada Admin" };

function makeRequest(token?: string, headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest("https://app.test/api/auth/me", { headers });
  if (token) req.cookies.set(AUTH_COOKIE, token);
  return req;
}

/** Mirrors the .select().lean() chain the route calls. */
function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function selectLeanRejecting(error: unknown) {
  return { select: () => ({ lean: () => Promise.reject(error) }) };
}

beforeEach(() => {
  connectDB.mockReset().mockResolvedValue(undefined);
  findById.mockReset();
});

describe("session sync route", () => {
  it("401s without a session", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("401s for a soft-deleted employee", async () => {
    findById.mockReturnValue(selectLean({ role: "admin", isDeleted: true }));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(401);
  });

  it("401s for a terminated employee", async () => {
    // staff-login already refuses these; a live session must not outlast it.
    findById.mockReturnValue(selectLean({ role: "staff", status: "terminated" }));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(401);
  });

  it("401s for a suspended employee", async () => {
    findById.mockReturnValue(selectLean({ role: "staff", status: "suspended" }));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(401);
  });

  it("keeps employees whose status is merely non-active signed in", async () => {
    // on-leave / notice-period staff still use the app; only the statuses the
    // login routes refuse should end a live session.
    for (const status of ["active", "on-leave", "notice-period"]) {
      findById.mockReturnValue(selectLean({ role: "staff", status, grantedFeatures: [] }));
      const res = await GET(makeRequest(signToken(USER)));
      expect(res.status, status).toBe(200);
    }
  });

  it("returns the full user so a client with no stored copy can restore itself", async () => {
    findById.mockReturnValue(
      selectLean({
        role: "admin",
        grantedFeatures: ["events"],
        email: "ada@d4.in",
        firstName: "Ada",
        lastName: "Admin",
        companyId: "c1",
        departmentId: "d1",
      })
    );
    const res = await GET(makeRequest(signToken(USER)));
    const json = await res.json();
    expect(json.user).toMatchObject({
      uid: USER.uid,
      staffId: USER.uid,
      email: "ada@d4.in",
      role: "admin",
      firstName: "Ada",
      lastName: "Admin",
      companyId: "c1",
      departmentId: "d1",
      grantedFeatures: ["events"],
    });
  });

  it("returns current role and grants, and slides the session forward", async () => {
    findById.mockReturnValue(selectLean({ role: "department-head", grantedFeatures: ["events"] }));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ role: "department-head", grantedFeatures: ["events"] });
    expect(res.headers.get("set-cookie") || "").toContain(`${AUTH_COOKIE}=`);
  });

  it("upgrades a browser-issued session to the PWA window when the app is installed", async () => {
    findById.mockReturnValue(selectLean({ role: "admin", grantedFeatures: [] }));
    const res = await GET(makeRequest(signToken(USER, browserTtlSeconds()), { "x-pwa": "1" }));
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`Max-Age=${pwaTtlSeconds()}`);
  });

  it("slides the full window forward instead of counting down from login", async () => {
    // The renewed cookie must carry the WHOLE window again, not the time left on
    // the old one — that is what makes a daily user never get logged out.
    findById.mockReturnValue(selectLean({ role: "admin", grantedFeatures: [] }));
    const issued = 60 * 60 * 24 * 30;
    const res = await GET(makeRequest(signToken(USER, issued)));
    expect(res.headers.get("set-cookie") || "").toContain(`Max-Age=${issued}`);
  });

  it("does not renew a session that is already dead", async () => {
    findById.mockReturnValue(selectLean({ role: "admin", grantedFeatures: [] }));
    const res = await GET(makeRequest(signToken(USER, -10)));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie") || "").not.toContain(`${AUTH_COOKIE}=ey`);
  });

  // A database blip must never look like an authentication failure — the client
  // logs out on 401, so a 401 here would sign everyone out whenever Mongo hiccups.
  it("503s — not 401 — when the database connection fails", async () => {
    connectDB.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(503);
  });

  it("503s — not 500 — when the staff lookup throws", async () => {
    findById.mockReturnValue(selectLeanRejecting(new Error("CastError")));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.status).toBe(503);
  });

  it("never lets a stale response be reused for a signed-out user", async () => {
    findById.mockReturnValue(selectLean({ role: "admin", grantedFeatures: [] }));
    const res = await GET(makeRequest(signToken(USER)));
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
