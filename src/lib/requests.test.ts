import { describe, it, expect } from "vitest";
import { resolveRequestStatus, isLegacyRequest, overtimeCompOffDays, computeLeaveBalances } from "@/lib/requests";
import type { ApprovalStep, StaffRequest } from "@/types";

const pending: ApprovalStep = { status: "pending" };
const approved: ApprovalStep = { status: "approved", by: "s1", byName: "Head" };
const rejected: ApprovalStep = { status: "rejected", by: "s2", byName: "Admin" };

describe("resolveRequestStatus (2-step state machine)", () => {
  it("is pending when both steps are pending", () => {
    expect(resolveRequestStatus({ deptHead: pending, admin: pending })).toBe("pending");
  });

  it("stays pending after dept-head approval alone", () => {
    expect(resolveRequestStatus({ deptHead: approved, admin: pending })).toBe("pending");
  });

  it("approves when admin approves after dept head", () => {
    expect(resolveRequestStatus({ deptHead: approved, admin: approved })).toBe("approved");
  });

  it("approves on admin override (dept head still pending)", () => {
    expect(resolveRequestStatus({ deptHead: pending, admin: approved })).toBe("approved");
  });

  it("rejects when dept head rejects", () => {
    expect(resolveRequestStatus({ deptHead: rejected, admin: pending })).toBe("rejected");
  });

  it("rejects when admin rejects", () => {
    expect(resolveRequestStatus({ deptHead: approved, admin: rejected })).toBe("rejected");
  });

  it("rejection wins over approval on the other step", () => {
    expect(resolveRequestStatus({ deptHead: rejected, admin: approved })).toBe("rejected");
  });

  it("preserves cancelled — never reopens a cancelled request", () => {
    expect(
      resolveRequestStatus({ deptHead: pending, admin: pending, status: "cancelled" })
    ).toBe("cancelled");
  });
});

describe("isLegacyRequest (pre two-step documents)", () => {
  it("treats docs without step fields as legacy", () => {
    expect(isLegacyRequest({ status: "approved" })).toBe(true);
  });

  it("treats docs with step fields as new-style", () => {
    expect(isLegacyRequest({ deptHead: pending, admin: pending })).toBe(false);
    expect(isLegacyRequest({ deptHead: approved } as never)).toBe(false);
  });
});

describe("overtimeCompOffDays", () => {
  it("8h OT = 1 day", () => {
    expect(overtimeCompOffDays({ startTime: "10:00", endTime: "18:00" })).toBe(1);
  });
  it("4h OT = 0.5 day, floors to 0.5 steps", () => {
    expect(overtimeCompOffDays({ startTime: "18:00", endTime: "22:00" })).toBe(0.5);
    expect(overtimeCompOffDays({ startTime: "18:00", endTime: "21:00" })).toBe(0);
  });
  it("handles overnight OT", () => {
    expect(overtimeCompOffDays({ startTime: "22:00", endTime: "06:00" })).toBe(1);
  });
  it("returns 0 for missing/bad times", () => {
    expect(overtimeCompOffDays({ startTime: "", endTime: "18:00" })).toBe(0);
    expect(overtimeCompOffDays({ startTime: "x", endTime: "18:00" })).toBe(0);
  });
});

describe("computeLeaveBalances", () => {
  const ts = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) }) as StaffRequest["startDate"];
  const policy = { casualLeave: 12, sickLeave: 12, earnedLeave: 15 };
  const req = (over: Partial<StaffRequest>): StaffRequest =>
    ({ type: "leave", startDate: ts("2026-03-02"), endDate: ts("2026-03-02"), ...over }) as StaffRequest;

  it("rolls up used days per type and FL from overtime", () => {
    const bal = computeLeaveBalances(
      [
        req({ leaveType: "CL", endDate: ts("2026-03-03") }), // 2 days
        req({ leaveType: "SL", isHalfDay: true }), // 0.5 → ML bucket
        req({ type: "overtime", startTime: "10:00", endTime: "18:00" }), // 1 FL earned
        req({ leaveType: "CO", isHalfDay: true }), // 0.5 FL used
        req({ leaveType: "LOP" }),
      ],
      policy,
      2026
    );
    expect(bal.cl).toEqual({ used: 2, total: 12 });
    expect(bal.ml).toEqual({ used: 0.5, total: 12 });
    expect(bal.fl).toEqual({ earned: 1, used: 0.5, available: 0.5 });
    expect(bal.lop).toBe(1);
  });

  it("ignores requests from other years", () => {
    const bal = computeLeaveBalances([req({ leaveType: "CL", startDate: ts("2025-06-01"), endDate: ts("2025-06-01") })], policy, 2026);
    expect(bal.cl.used).toBe(0);
  });
});
