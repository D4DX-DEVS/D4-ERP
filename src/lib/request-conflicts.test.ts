import { describe, it, expect } from "vitest";
import { findRequestConflict, pendingWalletDays, type ConflictRequest } from "@/lib/request-conflicts";

// Dates as the app stores them today (UTC midnight from a date-only string) and
// as older rows stored them (IST midnight = 18:30Z the day before).
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const ist = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 5.5 * 3600 * 1000);

function req(overrides: Partial<ConflictRequest> = {}): ConflictRequest {
  return {
    id: "r1",
    type: "leave",
    status: "pending",
    startDate: utc("2026-10-05"),
    endDate: utc("2026-10-06"),
    ...overrides,
  };
}

describe("findRequestConflict", () => {
  it("flags a leave overlapping a pending or approved leave", () => {
    const hit = findRequestConflict(req({ id: undefined }), [req({ startDate: utc("2026-10-06"), endDate: utc("2026-10-08") })]);
    expect(hit?.id).toBe("r1");
    expect(findRequestConflict(req({ id: undefined }), [req({ status: "approved" })])?.id).toBe("r1");
  });

  it("ignores rejected and cancelled requests", () => {
    expect(findRequestConflict(req({ id: undefined }), [req({ status: "rejected" }), req({ status: "cancelled" })])).toBeNull();
  });

  it("does not flag adjacent days", () => {
    expect(
      findRequestConflict(req({ id: undefined }), [req({ startDate: utc("2026-10-07"), endDate: utc("2026-10-09") })])
    ).toBeNull();
  });

  it("treats leave, WFH and on-duty as the same day (a day can only be one of them)", () => {
    expect(findRequestConflict(req({ id: undefined, type: "wfh" }), [req({ type: "on-duty" })])).not.toBeNull();
  });

  it("matches the day across the two stored midnights", () => {
    // Stored at IST midnight (18:30Z on the 4th) — still 5 October in the office.
    const older = req({ startDate: ist("2026-10-05"), endDate: ist("2026-10-05") });
    expect(findRequestConflict(req({ id: undefined, startDate: utc("2026-10-05"), endDate: utc("2026-10-05") }), [older])).not.toBeNull();
    expect(findRequestConflict(req({ id: undefined, startDate: utc("2026-10-04"), endDate: utc("2026-10-04") }), [older])).toBeNull();
  });

  it("lets the two halves of one day stand side by side", () => {
    const morning = req({ startDate: utc("2026-10-05"), endDate: utc("2026-10-05"), isHalfDay: true, session: "first-half" });
    const afternoon = { ...morning, id: undefined, session: "second-half" as const };
    expect(findRequestConflict(afternoon, [morning])).toBeNull();
    expect(findRequestConflict({ ...afternoon, session: "first-half" }, [morning])).not.toBeNull();
  });

  it("flags overtime overlapping another overtime window the same day", () => {
    const evening = req({ type: "overtime", startDate: utc("2026-10-05"), endDate: utc("2026-10-05"), startTime: "18:00", endTime: "22:00" });
    const overlap = { ...evening, id: undefined, startTime: "21:00", endTime: "23:00" };
    const later = { ...evening, id: undefined, startTime: "22:00", endTime: "23:30" };
    expect(findRequestConflict(overlap, [evening])).not.toBeNull();
    expect(findRequestConflict(later, [evening])).toBeNull();
  });

  it("handles overnight overtime windows", () => {
    const night = req({ type: "overtime", startDate: utc("2026-10-05"), endDate: utc("2026-10-05"), startTime: "22:00", endTime: "02:00" });
    expect(findRequestConflict({ ...night, id: undefined, startTime: "23:00", endTime: "23:30" }, [night])).not.toBeNull();
  });

  it("never compares overtime with leave, nor other request types at all", () => {
    const ot = req({ type: "overtime", startDate: utc("2026-10-05"), endDate: utc("2026-10-05"), startTime: "18:00", endTime: "20:00" });
    expect(findRequestConflict(ot, [req()])).toBeNull();
    expect(findRequestConflict(req({ id: undefined, type: "salary-increment" }), [req()])).toBeNull();
  });
});

describe("pendingWalletDays", () => {
  const co = (wallet: "FL" | "OT" | undefined, start: string, end = start, extra: Partial<ConflictRequest> = {}) =>
    req({ leaveType: "CO", leaveWallet: wallet, startDate: utc(start), endDate: utc(end), ...extra });

  it("sums pending flexible leave charged to the wallet", () => {
    const pending = [co("OT", "2026-10-05", "2026-10-06"), co("FL", "2026-10-08"), co("OT", "2026-10-09", "2026-10-09", { isHalfDay: true })];
    expect(pendingWalletDays(pending, "OT")).toBe(2.5);
    expect(pendingWalletDays(pending, "FL")).toBe(1);
  });

  it("charges a pending request with no wallet to FL (it spends FL first)", () => {
    expect(pendingWalletDays([co(undefined, "2026-10-05")], "FL")).toBe(1);
    expect(pendingWalletDays([co(undefined, "2026-10-05")], "OT")).toBe(0);
  });

  it("counts only pending flexible leave", () => {
    const rows = [co("OT", "2026-10-05", "2026-10-05", { status: "approved" }), req({ leaveType: "CL" })];
    expect(pendingWalletDays(rows, "OT")).toBe(0);
  });
});
