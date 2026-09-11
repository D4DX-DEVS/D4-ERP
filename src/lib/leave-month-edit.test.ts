// Verification for the month-wise edit: clicking a cell in the month grid must
// post an adjustment that comes back out in that same column.
//
// Three pieces have to agree — the grid hands back a zero-based column index,
// createLeaveAdjustment parses "YYYY-MM-DD" as a LOCAL date, and the ledger
// reads the month back off the stored timestamp. An off-by-one or a UTC slip
// anywhere in that chain silently files the correction against the wrong month,
// which no type check would catch. So the whole round trip is exercised here,
// through the real date parsing the mutation uses rather than a stand-in.

import { describe, it, expect } from "vitest";
import {
  MONTH_LABELS,
  computeLeaveLedger,
  ledgerBucket,
  monthStartDateKey,
} from "@/lib/leave-ledger";
import { Timestamp } from "@/lib/firestore";
import type { LeaveAdjustment, LeaveBucket, LeaveQuota } from "@/types";

const YEAR = 2026;
const QUOTA: LeaveQuota = { casualLeave: 15, sickLeave: 15, earnedLeave: 0 };
const BUCKETS: LeaveBucket[] = ["CL", "EL", "ML", "FL"];

/** Local midnight, exactly as leave-adjustments.ts does it before storing. */
function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The path a month-cell edit actually takes: the key the dialog builds, parsed
 * the way createLeaveAdjustment parses it, stored the way it stores it, then
 * read back through /api/db's Date -> { seconds } conversion.
 */
function adjustmentFromCell(bucket: LeaveBucket, month: number, days: number): LeaveAdjustment {
  const key = monthStartDateKey(YEAR, month);
  const parsed = new Date(`${key}T00:00:00`);
  const stored = Timestamp.fromDate(atMidnight(parsed));
  return {
    staffId: "s1",
    year: YEAR,
    bucket,
    kind: days < 0 ? "deduction" : "grant",
    days,
    date: { seconds: stored.seconds, nanoseconds: 0 },
    reason: "cell edit",
  } as unknown as LeaveAdjustment;
}

function ledgerWith(adjustments: LeaveAdjustment[]) {
  return computeLeaveLedger({
    requests: [],
    adjustments,
    sundayDuties: [],
    quota: QUOTA,
    year: YEAR,
    allowNegative: false,
  });
}

describe("monthStartDateKey", () => {
  it("turns a zero-based column index into the first of that month", () => {
    expect(monthStartDateKey(2026, 0)).toBe("2026-01-01");
    expect(monthStartDateKey(2026, 8)).toBe("2026-09-01");
    expect(monthStartDateKey(2026, 11)).toBe("2026-12-01");
  });

  it("pads single-digit months, so the key is always parseable", () => {
    for (let m = 0; m < 12; m++) {
      expect(monthStartDateKey(2026, m)).toMatch(/^2026-\d{2}-01$/);
    }
  });
});

describe("a month-cell edit lands in the column it was clicked on", () => {
  it("files a deduction against the month the grid handed back, for all twelve", () => {
    for (let month = 0; month < 12; month++) {
      const ledger = ledgerWith([adjustmentFromCell("CL", month, -2)]);
      const monthly = ledgerBucket(ledger, "CL").monthly;
      expect(monthly[month], `${MONTH_LABELS[month]} should hold the edit`).toBe(2);
      expect(
        monthly.filter((_, i) => i !== month).every((v) => v === 0),
        `${MONTH_LABELS[month]} edit leaked into another month`
      ).toBe(true);
    }
  });

  it("survives the date parsing without slipping to the previous month", () => {
    // "2026-09-01T00:00:00" parses as local time; a UTC parse would land on
    // 31 August for anyone east of Greenwich, which is most of the team.
    const parsed = new Date(`${monthStartDateKey(YEAR, 8)}T00:00:00`);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(1);
  });

  it("adds to the month rather than replacing it", () => {
    const ledger = ledgerWith([
      adjustmentFromCell("CL", 8, -1),
      adjustmentFromCell("CL", 8, -2),
    ]);
    expect(ledgerBucket(ledger, "CL").monthly[8]).toBe(3);
    expect(ledgerBucket(ledger, "CL").used).toBe(3);
  });

  it("moves the balance by exactly what was posted", () => {
    const before = ledgerWith([]);
    const after = ledgerWith([adjustmentFromCell("CL", 5, -2)]);
    expect(before.cl.balance - after.cl.balance).toBe(2);
  });

  it("touches only the bucket that was clicked", () => {
    const ledger = ledgerWith([adjustmentFromCell("ML", 3, -2)]);
    expect(ledgerBucket(ledger, "ML").monthly[3]).toBe(2);
    for (const other of BUCKETS.filter((b) => b !== "ML")) {
      expect(ledgerBucket(ledger, other).used, `${other} should be untouched`).toBe(0);
    }
  });

  it("credits a month back when the correction is positive", () => {
    const ledger = ledgerWith([adjustmentFromCell("CL", 8, -3), adjustmentFromCell("CL", 8, 1)]);
    // A credit raises the entitlement rather than erasing days from the month:
    // the days were still taken, the allowance just grew to cover them.
    expect(ledgerBucket(ledger, "CL").monthly[8]).toBe(3);
    expect(ledgerBucket(ledger, "CL").entitled).toBe(16);
    expect(ledgerBucket(ledger, "CL").balance).toBe(13);
  });

  it("ignores an edit filed against a different year", () => {
    const stray = { ...adjustmentFromCell("CL", 8, -2), year: YEAR - 1 };
    expect(ledgerWith([stray]).cl.used).toBe(0);
  });

  it("never attributes on-duty days to a bucket, since they are not editable here", () => {
    const ledger = ledgerWith([adjustmentFromCell("CL", 8, -1)]);
    expect(ledger.onDuty.total).toBe(0);
    expect(ledger.onDuty.monthly.every((v) => v === 0)).toBe(true);
  });
});
