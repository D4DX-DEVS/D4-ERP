import { describe, it, expect } from "vitest";
import { resolveRequestStatus, isLegacyRequest } from "@/lib/requests";
import type { ApprovalStep } from "@/types";

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
