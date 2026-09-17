// What a single month-wise cell is actually made of.
//
// The cell is a number of days TAKEN, and three unrelated writes can put days
// there: an approved leave request spanning the month, a manual debit dated in
// it, and a debit the attendance reconciler posted. An admin looking at a wrong
// figure has to be told which one it was, because the fix differs — one is a
// row to delete, one is a request to cancel, one is an attendance day that the
// next sync would simply re-post.
//
// The invariant every case here asserts: the days the breakdown accounts for
// equal the ledger's own figure for that cell. If they ever disagree, the
// dialog is telling the admin a story about a number it cannot actually explain.

import { describe, it, expect } from "vitest";
import { Timestamp } from "@/lib/firestore";
import { computeLeaveLedger, ledgerBucket } from "@/lib/leave-ledger";
import { leaveMonthSources } from "@/lib/leave-month-sources";
import type { LeaveAdjustment, LeaveQuota, StaffRequest } from "@/types";

const YEAR = 2026;
const MAY = 4;
const QUOTA: LeaveQuota = { casualLeave: 12, sickLeave: 12, earnedLeave: 15 };

/** A stored timestamp exactly as /api/db hands one back: seconds, no methods. */
function ts(y: number, m: number, d: number): Timestamp {
  const date = new Date(y, m, d, 0, 0, 0, 0);
  const stored = Timestamp.fromDate(date);
  return { seconds: stored.seconds, nanoseconds: 0 } as unknown as Timestamp;
}

function adjustment(over: Partial<LeaveAdjustment>): LeaveAdjustment {
  return {
    staffId: "s1",
    year: YEAR,
    bucket: "FL",
    kind: "deduction",
    days: -1,
    date: ts(YEAR, MAY, 1),
    reason: "marked absent",
    ...over,
  } as unknown as LeaveAdjustment;
}

function request(over: Partial<StaffRequest>): StaffRequest {
  return {
    id: "r1",
    staffId: "s1",
    departmentId: "d1",
    type: "leave",
    leaveType: "CO",
    startDate: ts(YEAR, MAY, 3),
    endDate: ts(YEAR, MAY, 5),
    reason: "family",
    status: "approved",
    ...over,
  } as unknown as StaffRequest;
}

function ledgerFor(requests: StaffRequest[], adjustments: LeaveAdjustment[]) {
  return computeLeaveLedger({
    requests,
    adjustments,
    sundayDuties: [],
    quota: QUOTA,
    year: YEAR,
    allowNegative: false,
  });
}

/** The breakdown must always add up to the cell the grid rendered. */
function expectAccountsForCell(
  requests: StaffRequest[],
  adjustments: LeaveAdjustment[],
  bucket: "CL" | "EL" | "ML" | "FL",
  month: number
) {
  const ledger = ledgerFor(requests, adjustments);
  const cell = ledgerBucket(ledger, bucket).monthly[month];
  const result = leaveMonthSources({ requests, adjustments, bucket, month, year: YEAR });
  expect(result.accountedDays).toBe(cell);
  return { cell, result };
}

describe("leaveMonthSources", () => {
  it("explains a manual deduction, and says it can be deleted here", () => {
    const rows = [adjustment({ id: "a1" })];
    const { cell, result } = expectAccountsForCell([], rows, "FL", MAY);

    expect(cell).toBe(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      id: "a1",
      kind: "adjustment",
      days: 1,
      removable: true,
    });
  });

  it("explains an approved request by the days it spends in THAT month", () => {
    // 29 April – 2 May: three of its days belong to April, two to May.
    const rows = [request({ id: "r9", startDate: ts(YEAR, 3, 29), endDate: ts(YEAR, MAY, 2) })];
    const { cell, result } = expectAccountsForCell(rows, [], "FL", MAY);

    expect(cell).toBe(2);
    expect(result.sources[0]).toMatchObject({ id: "r9", kind: "request", days: 2 });
    // A request is not this dialog's row to delete — the request has to be cancelled.
    expect(result.sources[0].removable).toBe(false);
    expect(result.sources[0].requestId).toBe("r9");
  });

  it("flags an attendance-sourced debit as futile to delete, and points at the day", () => {
    const rows = [adjustment({ id: "a2", kind: "attendance", sourceAttendanceId: "att7" })];
    const { result } = expectAccountsForCell([], rows, "FL", MAY);

    expect(result.sources[0]).toMatchObject({
      kind: "attendance",
      removable: false,
      attendanceId: "att7",
    });
  });

  it("adds up when all three land on the same cell", () => {
    const requests = [request({ id: "r1" })]; // 3 FL days in May
    const adjustments = [
      adjustment({ id: "a1", days: -1 }),
      adjustment({ id: "a2", days: -0.5, kind: "attendance", sourceAttendanceId: "att1" }),
    ];
    const { cell, result } = expectAccountsForCell(requests, adjustments, "FL", MAY);

    expect(cell).toBe(4.5);
    expect(result.sources).toHaveLength(3);
    expect(result.removableDays).toBe(1);
  });

  it("ignores credits — a week-off conversion raises entitlement, it takes no day", () => {
    const rows = [
      adjustment({ id: "c1", days: 1, kind: "sunday-credit", reason: "week-off 10 May" }),
    ];
    const { cell, result } = expectAccountsForCell([], rows, "FL", MAY);

    expect(cell).toBe(0);
    expect(result.sources).toHaveLength(0);
  });

  it("ignores other months, other buckets, other years and unapproved requests", () => {
    const rows = [
      adjustment({ id: "x1", date: ts(YEAR, 5, 1) }),
      adjustment({ id: "x2", bucket: "CL" }),
      adjustment({ id: "x3", year: YEAR - 1, date: ts(YEAR - 1, MAY, 1) }),
    ];
    const requests = [
      request({ id: "x4", status: "rejected" }),
      request({ id: "x5", leaveType: "CL" }),
      request({ id: "x6", type: "overtime", leaveType: undefined }),
    ];
    const result = leaveMonthSources({ requests, adjustments: rows, bucket: "FL", month: MAY, year: YEAR });

    expect(result.sources).toHaveLength(0);
    expect(result.accountedDays).toBe(0);
  });

  it("orders sources by date so the breakdown reads like the month", () => {
    const rows = [
      adjustment({ id: "late", date: ts(YEAR, MAY, 20) }),
      adjustment({ id: "early", date: ts(YEAR, MAY, 2) }),
    ];
    const result = leaveMonthSources({ requests: [], adjustments: rows, bucket: "FL", month: MAY, year: YEAR });

    expect(result.sources.map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("files a dateless debit under January, exactly as the ledger does", () => {
    const rows = [adjustment({ id: "nodate", date: undefined })];
    const { cell, result } = expectAccountsForCell([], rows, "FL", 0);

    expect(cell).toBe(1);
    expect(result.sources.map((s) => s.id)).toEqual(["nodate"]);
  });
});
