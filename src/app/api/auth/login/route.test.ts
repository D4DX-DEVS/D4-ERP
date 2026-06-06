import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const findOne = vi.fn();
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models", () => ({ getModel: () => ({ findOne }) }));

const compare = vi.fn();
vi.mock("bcryptjs", () => ({ default: { compare: (...a: unknown[]) => compare(...a) } }));

import { POST } from "@/app/api/auth/login/route";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

function makeRequest(body: unknown, ip = `1.2.3.${Math.floor(Math.random() * 250)}`): NextRequest {
  return new NextRequest("https://app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

// Returns a lean() chain like Mongoose.
function leanResolving(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

beforeEach(() => {
  findOne.mockReset();
  compare.mockReset();
});

describe("admin login route", () => {
  it("400s when email or password is missing", async () => {
    const res = await POST(makeRequest({ email: "" }));
    expect(res.status).toBe(400);
  });

  it("coerces non-string credentials (NoSQL injection guard)", async () => {
    findOne.mockReturnValue(leanResolving(null));
    const res = await POST(makeRequest({ email: { $ne: null }, password: { $ne: null } }));
    // Object email is coerced to "" → 400 before any DB lookup.
    expect(res.status).toBe(400);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("401s for an unknown account without leaking which field was wrong", async () => {
    findOne.mockReturnValue(leanResolving(null));
    const res = await POST(makeRequest({ email: "nobody@d4.in", password: "secret" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid email or password/i);
  });

  it("403s when a plain staff role uses the admin portal", async () => {
    findOne.mockReturnValue(leanResolving({ _id: "1", role: "staff", password: "h" }));
    const res = await POST(makeRequest({ email: "s@d4.in", password: "x" }));
    expect(res.status).toBe(403);
  });

  it("401s on a wrong password", async () => {
    findOne.mockReturnValue(
      leanResolving({ _id: "1", role: "admin", email: "a@d4.in", password: "$hash" })
    );
    compare.mockResolvedValue(false);
    const res = await POST(makeRequest({ email: "a@d4.in", password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("succeeds and sets an httpOnly session cookie", async () => {
    findOne.mockReturnValue(
      leanResolving({
        _id: "abc",
        role: "admin",
        email: "a@d4.in",
        password: "$hash",
        firstName: "Ada",
        lastName: "Admin",
        companyId: "c1",
        departmentId: "d1",
      })
    );
    compare.mockResolvedValue(true);
    const res = await POST(makeRequest({ email: "A@d4.in", password: "right" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${AUTH_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");

    const json = await res.json();
    expect(json.user).toMatchObject({ uid: "abc", role: "admin" });
    // Token must NOT be returned in the body (cookie-only).
    expect(json.token).toBeUndefined();
    // Password must never leak.
    expect(JSON.stringify(json)).not.toContain("$hash");
  });

  it("normalizes email to lowercase before lookup", async () => {
    findOne.mockReturnValue(leanResolving(null));
    await POST(makeRequest({ email: "MixedCase@D4.IN", password: "x" }));
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ email: "mixedcase@d4.in" })
    );
  });

  it("rate-limits repeated attempts from the same IP", async () => {
    findOne.mockReturnValue(leanResolving(null));
    const ip = "9.9.9.9";
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await POST(makeRequest({ email: "a@d4.in", password: "x" }, ip));
    }
    expect(last!.status).toBe(429);
  });
});
