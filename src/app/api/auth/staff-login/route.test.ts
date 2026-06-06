import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findOne = vi.fn();
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models", () => ({ getModel: () => ({ findOne }) }));

import { POST } from "@/app/api/auth/staff-login/route";
import { AUTH_COOKIE } from "@/lib/auth-cookie";

function makeRequest(body: unknown, ip = `2.3.4.${Math.floor(Math.random() * 250)}`): NextRequest {
  return new NextRequest("https://app.test/api/auth/staff-login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function leanResolving(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

beforeEach(() => findOne.mockReset());

describe("staff portal access (staff-login route)", () => {
  it("400s when employeeCode or mobile is missing", async () => {
    expect((await POST(makeRequest({ employeeCode: "EMP1" }))).status).toBe(400);
    expect((await POST(makeRequest({ mobile: "1234" }))).status).toBe(400);
  });

  it("coerces non-string inputs (NoSQL injection guard)", async () => {
    const res = await POST(makeRequest({ employeeCode: { $ne: null }, mobile: { $ne: null } }));
    expect(res.status).toBe(400);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("401s for an unknown employee code", async () => {
    findOne.mockReturnValue(leanResolving(null));
    const res = await POST(makeRequest({ employeeCode: "nope", mobile: "1234" }));
    expect(res.status).toBe(401);
  });

  it("uppercases the employee code for lookup", async () => {
    findOne.mockReturnValue(leanResolving(null));
    await POST(makeRequest({ employeeCode: "emp-77", mobile: "1234" }));
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: "EMP-77" })
    );
  });

  it("401s when the mobile last-4 does not match", async () => {
    findOne.mockReturnValue(
      leanResolving({ _id: "1", mobile: "9876543210", role: "staff", status: "active" })
    );
    const res = await POST(makeRequest({ employeeCode: "EMP1", mobile: "0000" }));
    expect(res.status).toBe(401);
  });

  it("403s for a terminated account", async () => {
    findOne.mockReturnValue(
      leanResolving({ _id: "1", mobile: "9876543210", status: "terminated", role: "staff" })
    );
    const res = await POST(makeRequest({ employeeCode: "EMP1", mobile: "3210" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/terminated/i);
  });

  it("403s for a suspended account", async () => {
    findOne.mockReturnValue(
      leanResolving({ _id: "1", mobile: "9876543210", status: "suspended", role: "staff" })
    );
    const res = await POST(makeRequest({ employeeCode: "EMP1", mobile: "3210" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/suspended/i);
  });

  it("succeeds with matching last-4 and sets an httpOnly cookie", async () => {
    findOne.mockReturnValue(
      leanResolving({
        _id: "staff-1",
        mobile: "9876543210",
        status: "active",
        role: "staff",
        email: "s@d4.in",
        firstName: "Sam",
        lastName: "Staff",
        companyId: "c1",
        departmentId: "d1",
      })
    );
    const res = await POST(makeRequest({ employeeCode: "EMP1", mobile: "3210" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${AUTH_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");

    const json = await res.json();
    expect(json.user).toMatchObject({ uid: "staff-1", role: "staff" });
  });

  it("rate-limits repeated attempts from the same IP", async () => {
    findOne.mockReturnValue(leanResolving(null));
    const ip = "8.8.8.8";
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await POST(makeRequest({ employeeCode: "EMP1", mobile: "1234" }, ip));
    }
    expect(last!.status).toBe(429);
  });
});
