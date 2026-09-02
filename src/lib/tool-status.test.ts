import { describe, it, expect } from "vitest";
import {
  EXPIRING_SOON_DAYS,
  STALE_PASSWORD_DAYS,
  annualCost,
  daysUntilRenewal,
  seatUsage,
  toolSecurityFlags,
  toolStatus,
} from "@/lib/tool-status";
import type { CompanyTool } from "@/types";

const NOW = new Date("2026-09-02T10:30:00Z");

/** Mirrors the `{ seconds, nanoseconds }` shape /api/db returns for dates. */
function ts(iso: string) {
  return { seconds: Math.floor(new Date(iso).getTime() / 1000), nanoseconds: 0 } as CompanyTool["renewalDate"];
}

function tool(overrides: Partial<CompanyTool> = {}): CompanyTool {
  return { name: "Adobe", category: "Design", ...overrides };
}

describe("daysUntilRenewal", () => {
  it("counts whole days from today, ignoring the time of day", () => {
    expect(daysUntilRenewal(tool({ renewalDate: ts("2026-09-02T23:59:00Z") }), NOW)).toBe(0);
    expect(daysUntilRenewal(tool({ renewalDate: ts("2026-09-03T00:01:00Z") }), NOW)).toBe(1);
    expect(daysUntilRenewal(tool({ renewalDate: ts("2026-10-02T00:00:00Z") }), NOW)).toBe(30);
  });

  it("is negative once the renewal date has passed", () => {
    expect(daysUntilRenewal(tool({ renewalDate: ts("2026-09-01T00:00:00Z") }), NOW)).toBe(-1);
    expect(daysUntilRenewal(tool({ renewalDate: ts("2026-08-03T00:00:00Z") }), NOW)).toBe(-30);
  });

  it("returns null when no renewal date is recorded", () => {
    expect(daysUntilRenewal(tool(), NOW)).toBeNull();
    expect(daysUntilRenewal(tool({ renewalDate: undefined }), NOW)).toBeNull();
  });

  it("accepts a Date or ISO string as well as the API timestamp shape", () => {
    expect(daysUntilRenewal(tool({ renewalDate: new Date("2026-09-05T00:00:00Z") as never }), NOW)).toBe(3);
    expect(daysUntilRenewal(tool({ renewalDate: "2026-09-05" as never }), NOW)).toBe(3);
  });
});

describe("toolStatus", () => {
  it("marks a subscription expiring inside the warning window", () => {
    expect(toolStatus(tool({ renewalDate: ts("2026-09-10T00:00:00Z") }), NOW)).toBe("expiring");
    expect(toolStatus(tool({ renewalDate: ts("2026-09-02T00:00:00Z") }), NOW)).toBe("expiring");
  });

  it("marks it active while the renewal is beyond the warning window", () => {
    expect(toolStatus(tool({ renewalDate: ts("2026-12-01T00:00:00Z") }), NOW)).toBe("active");
  });

  it("uses a 30 day warning window", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
    expect(toolStatus(tool({ renewalDate: ts("2026-10-02T00:00:00Z") }), NOW)).toBe("expiring");
    expect(toolStatus(tool({ renewalDate: ts("2026-10-03T00:00:00Z") }), NOW)).toBe("active");
  });

  it("marks it expired the day after the renewal date", () => {
    expect(toolStatus(tool({ renewalDate: ts("2026-09-01T00:00:00Z") }), NOW)).toBe("expired");
  });

  it("treats a cancelled tool as cancelled regardless of dates", () => {
    expect(toolStatus(tool({ cancelled: true, renewalDate: ts("2026-09-03T00:00:00Z") }), NOW)).toBe("cancelled");
    expect(toolStatus(tool({ cancelled: true, renewalDate: ts("2020-01-01T00:00:00Z") }), NOW)).toBe("cancelled");
  });

  it("treats a tool with no renewal date as active (perpetual or one-time)", () => {
    expect(toolStatus(tool({ billingCycle: "one-time" }), NOW)).toBe("active");
  });
});

describe("annualCost", () => {
  it("normalises each billing cycle to a yearly figure", () => {
    expect(annualCost(tool({ cost: 1000, billingCycle: "monthly" }))).toBe(12000);
    expect(annualCost(tool({ cost: 1000, billingCycle: "quarterly" }))).toBe(4000);
    expect(annualCost(tool({ cost: 1000, billingCycle: "yearly" }))).toBe(1000);
  });

  it("excludes one-time purchases from recurring spend", () => {
    expect(annualCost(tool({ cost: 50000, billingCycle: "one-time" }))).toBe(0);
  });

  it("excludes cancelled subscriptions", () => {
    expect(annualCost(tool({ cost: 1000, billingCycle: "monthly", cancelled: true }))).toBe(0);
  });

  it("defaults to yearly when the cycle is missing and handles a missing cost", () => {
    expect(annualCost(tool({ cost: 2400 }))).toBe(2400);
    expect(annualCost(tool({ billingCycle: "monthly" }))).toBe(0);
  });
});

describe("seatUsage", () => {
  it("reports used, free and utilisation percentage", () => {
    expect(seatUsage(tool({ seatsTotal: 10, seatsUsed: 4 }))).toEqual({ total: 10, used: 4, free: 6, pct: 40 });
  });

  it("never reports negative free seats when the count is over-allocated", () => {
    expect(seatUsage(tool({ seatsTotal: 5, seatsUsed: 8 }))).toEqual({ total: 5, used: 8, free: 0, pct: 100 });
  });

  it("returns null when seats are not tracked", () => {
    expect(seatUsage(tool())).toBeNull();
    expect(seatUsage(tool({ seatsTotal: 0 }))).toBeNull();
  });
});

describe("toolSecurityFlags", () => {
  const keys = (t: CompanyTool) => toolSecurityFlags(t, NOW).map((f) => f.key);

  it("flags a credential stored without two-factor authentication", () => {
    expect(keys(tool({ hasCredentials: true, twoFactorEnabled: false }))).toContain("no-2fa");
    expect(keys(tool({ hasCredentials: true, twoFactorEnabled: true }))).not.toContain("no-2fa");
  });

  it("does not ask for 2FA on a tool that stores no credentials", () => {
    expect(keys(tool({ twoFactorEnabled: false }))).not.toContain("no-2fa");
  });

  it("flags a password that has not been rotated in a year", () => {
    expect(STALE_PASSWORD_DAYS).toBe(365);
    const stale = tool({ hasCredentials: true, lastPasswordChangedAt: ts("2025-01-01T00:00:00Z") });
    const fresh = tool({ hasCredentials: true, lastPasswordChangedAt: ts("2026-08-01T00:00:00Z") });
    expect(keys(stale)).toContain("stale-password");
    expect(keys(fresh)).not.toContain("stale-password");
  });

  it("flags a tool with no owner", () => {
    expect(keys(tool())).toContain("no-owner");
    expect(keys(tool({ ownerStaffId: "s1" }))).not.toContain("no-owner");
  });

  it("flags an expired subscription", () => {
    expect(keys(tool({ renewalDate: ts("2026-08-01T00:00:00Z"), ownerStaffId: "s1" }))).toContain("expired");
  });

  it("flags a recurring subscription with no renewal date", () => {
    expect(keys(tool({ billingCycle: "monthly", ownerStaffId: "s1" }))).toContain("no-renewal-date");
    expect(keys(tool({ billingCycle: "one-time", ownerStaffId: "s1" }))).not.toContain("no-renewal-date");
  });

  it("returns nothing for a healthy tool", () => {
    const healthy = tool({
      hasCredentials: true,
      twoFactorEnabled: true,
      ownerStaffId: "s1",
      billingCycle: "yearly",
      renewalDate: ts("2027-01-01T00:00:00Z"),
      lastPasswordChangedAt: ts("2026-08-01T00:00:00Z"),
    });
    expect(toolSecurityFlags(healthy, NOW)).toEqual([]);
  });

  it("ignores a cancelled tool entirely", () => {
    expect(toolSecurityFlags(tool({ cancelled: true }), NOW)).toEqual([]);
  });
});
