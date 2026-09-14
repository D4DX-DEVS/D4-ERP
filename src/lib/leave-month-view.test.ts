import { describe, it, expect } from "vitest";
import { computeLeaveLedger, emptyLedger, LEAVE_BUCKETS, ledgerBucket } from "@/lib/leave-ledger";
import { monthViewRow } from "@/lib/leave-month-view";
import { Timestamp } from "@/lib/firestore";
import type { LeaveAdjustment, StaffRequest, SundayDuty } from "@/types";

const YEAR = 2026;
const QUOTA = { casualLeave: 12, sickLeave: 12, earnedLeave: 15 };

const JAN = 0;
const FEB = 1;
const MAR = 2;
const NOV = 10;
const DEC = 11;

function ts(date: string): Timestamp {
  return Timestamp.fromDate(new Date(`${date}T00:00:00`));
}

function leave(
  leaveType: StaffRequest["leaveType"],
  start: string,
  end = start
): StaffRequest {
  return {
    staffId: "s1",
    departmentId: "d1",
    type: "leave",
    leaveType,
    startDate: ts(start),
    endDate: ts(end),
    reason: "test",
    deptHead: { status: "approved" },
    admin: { status: "approved" },
    status: "approved",
  } as StaffRequest;
}

function duty(date: string, status: SundayDuty["status"] = "converted"): SundayDuty {
  return { staffId: "s1", date: ts(date), year: YEAR, source: "attendance", status };
}

function ledgerOf(input: {
  requests?: StaffRequest[];
  adjustments?: LeaveAdjustment[];
  sundayDuties?: SundayDuty[];
  onDutyDays?: number[];
  allowNegative?: boolean;
}) {
  return computeLeaveLedger({
    requests: input.requests ?? [],
    adjustments: input.adjustments ?? [],
    sundayDuties: input.sundayDuties ?? [],
    onDutyDays: input.onDutyDays,
    quota: QUOTA,
    year: YEAR,
    allowNegative: input.allowNegative ?? false,
  });
}

describe("monthViewRow — days taken in the selected month", () => {
  it("reports the bucket's own month figure, not the year total", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02", "2026-03-04"), leave("CL", "2026-11-09")],
    });

    expect(monthViewRow(ledger, MAR).buckets.CL.taken).toBe(3);
    expect(monthViewRow(ledger, NOV).buckets.CL.taken).toBe(1);
    expect(monthViewRow(ledger, FEB).buckets.CL.taken).toBe(0);
  });

  it("splits a request that spans a month boundary across both months", () => {
    const ledger = ledgerOf({ requests: [leave("CL", "2026-01-30", "2026-02-02")] });

    expect(monthViewRow(ledger, JAN).buckets.CL.taken).toBe(2);
    expect(monthViewRow(ledger, FEB).buckets.CL.taken).toBe(2);
  });

  it("carries a half day as 0.5", () => {
    const ledger = ledgerOf({
      requests: [{ ...leave("CL", "2026-03-02"), isHalfDay: true } as StaffRequest],
    });

    expect(monthViewRow(ledger, MAR).buckets.CL.taken).toBe(0.5);
  });
});

describe("monthViewRow — balance remaining at the close of the month", () => {
  it("counts only the months up to and including the selected one", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02", "2026-03-04"), leave("CL", "2026-11-09")],
    });

    expect(monthViewRow(ledger, FEB).buckets.CL.remaining).toBe(12);
    expect(monthViewRow(ledger, MAR).buckets.CL.remaining).toBe(9);
    expect(monthViewRow(ledger, NOV).buckets.CL.remaining).toBe(8);
  });

  it("matches the yearly balance in December, for every bucket", () => {
    const ledger = ledgerOf({
      requests: [
        leave("CL", "2026-03-02", "2026-03-04"),
        leave("SL", "2026-05-11"),
        leave("EL", "2026-08-03", "2026-08-07"),
        leave("CO", "2026-10-19"),
      ],
      adjustments: [
        {
          staffId: "s1",
          year: YEAR,
          bucket: "FL",
          kind: "sunday-credit",
          days: 2,
          date: ts("2026-08-16"),
          reason: "week-off",
        },
      ],
    });
    const december = monthViewRow(ledger, DEC);

    for (const code of LEAVE_BUCKETS) {
      expect(december.buckets[code].remaining).toBe(ledgerBucket(ledger, code).balance);
    }
  });

  it("counts credits from the start of the year, whatever month they landed in", () => {
    const ledger = ledgerOf({
      adjustments: [
        {
          staffId: "s1",
          year: YEAR,
          bucket: "FL",
          kind: "sunday-credit",
          days: 2,
          date: ts("2026-08-16"),
          reason: "week-off",
        },
      ],
    });

    expect(monthViewRow(ledger, JAN).buckets.FL.remaining).toBe(2);
  });

  it("floors an overdrawn bucket at zero when negatives are not allowed", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02", "2026-03-15")],
      allowNegative: false,
    });
    const march = monthViewRow(ledger, MAR);

    expect(march.buckets.CL.taken).toBe(14);
    expect(march.buckets.CL.remaining).toBe(0);
    expect(march.buckets.CL.remaining).toBe(ledger.cl.balance);
  });

  it("lets the balance go negative when the staff member is allowed a deficit", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02", "2026-03-15")],
      allowNegative: true,
    });

    expect(monthViewRow(ledger, MAR).buckets.CL.remaining).toBe(-2);
    expect(monthViewRow(ledger, FEB).buckets.CL.remaining).toBe(12);
  });

  it("reports the full quota in every month of an untouched ledger", () => {
    const ledger = emptyLedger(QUOTA, YEAR);

    for (let month = JAN; month <= DEC; month++) {
      expect(monthViewRow(ledger, month).buckets.CL.remaining).toBe(12);
      expect(monthViewRow(ledger, month).buckets.EL.remaining).toBe(15);
      expect(monthViewRow(ledger, month).buckets.CL.taken).toBe(0);
    }
  });
});

describe("monthViewRow — the columns beside the buckets", () => {
  it("takes on duty from the month's attendance count", () => {
    const onDutyDays = new Array(12).fill(0);
    onDutyDays[MAR] = 2;
    const ledger = ledgerOf({ onDutyDays });

    expect(monthViewRow(ledger, MAR).onDuty).toBe(2);
    expect(monthViewRow(ledger, FEB).onDuty).toBe(0);
  });

  it("totals every bucket taken in the month", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02"), leave("SL", "2026-03-09", "2026-03-10")],
    });

    expect(monthViewRow(ledger, MAR).total).toBe(3);
    expect(monthViewRow(ledger, FEB).total).toBe(0);
  });

  it("counts the week-off days worked in that month", () => {
    const ledger = ledgerOf({
      sundayDuties: [duty("2026-03-08"), duty("2026-03-15", "pending"), duty("2026-08-16")],
    });

    expect(monthViewRow(ledger, MAR).weekOffWorked).toBe(2);
    expect(monthViewRow(ledger, FEB).weekOffWorked).toBe(0);
  });
});

describe("monthViewRow — out-of-range months", () => {
  it("clamps a month index below January to January", () => {
    const ledger = ledgerOf({ requests: [leave("CL", "2026-01-05")] });

    expect(monthViewRow(ledger, -1).buckets.CL.taken).toBe(1);
  });

  it("clamps a month index past December to December", () => {
    const ledger = ledgerOf({ requests: [leave("CL", "2026-12-07")] });

    expect(monthViewRow(ledger, 12).buckets.CL.taken).toBe(1);
  });
});
