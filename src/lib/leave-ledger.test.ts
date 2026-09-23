import { describe, it, expect } from "vitest";
import {
  allowsNegativeBalance,
  bucketForLeaveType,
  countsAsWeekOffDuty,
  LEAVE_BUCKETS,
  weekOffDutyKey,
  computeLeaveLedger,
  consumesLeaveBalance,
  emptyLedger,
  employmentTypeOf,
  groupByEmployment,
  ledgerBucket,
  onDutyMonthsFromAttendance,
  overtimeCompOffDays,
  overtimeDaysFromHours,
  overtimeHours,
  quotaForBucket,
  requestLeaveDays,
  resolveQuota,
  splitRequestDaysByMonth,
  type LeavePolicyConfig,
} from "@/lib/leave-ledger";
import { Timestamp } from "@/lib/firestore";
import type { Attendance, LeaveAdjustment, StaffRequest, SundayDuty } from "@/types";

const YEAR = 2026;

const POLICY: LeavePolicyConfig = {
  casualLeave: 12,
  sickLeave: 12,
  earnedLeave: 15,
  byEmploymentType: {
    permanent: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
    staff: { casualLeave: 15, sickLeave: 15, earnedLeave: 0 },
    intern: { casualLeave: 14, sickLeave: 14, earnedLeave: 0 },
  },
  negativeEmploymentTypes: ["permanent"],
};

function ts(date: string): Timestamp {
  return Timestamp.fromDate(new Date(`${date}T00:00:00`));
}

function leave(
  leaveType: StaffRequest["leaveType"],
  start: string,
  end = start,
  extra: Partial<StaffRequest> = {}
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
    ...extra,
  } as StaffRequest;
}

function adjustment(
  bucket: LeaveAdjustment["bucket"],
  days: number,
  date: string,
  extra: Partial<LeaveAdjustment> = {}
): LeaveAdjustment {
  return {
    staffId: "s1",
    year: YEAR,
    bucket,
    kind: days > 0 ? "grant" : "deduction",
    days,
    date: ts(date),
    reason: "test",
    ...extra,
  };
}

function duty(date: string, status: SundayDuty["status"], extra: Partial<SundayDuty> = {}): SundayDuty {
  return {
    staffId: "s1",
    date: ts(date),
    year: YEAR,
    source: "attendance",
    status,
    ...extra,
  };
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
    quota: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
    year: YEAR,
    allowNegative: input.allowNegative ?? false,
  });
}

describe("consumesLeaveBalance", () => {
  it("accepts both leave request types", () => {
    expect(consumesLeaveBalance("leave")).toBe(true);
    expect(consumesLeaveBalance("long-leave")).toBe(true);
  });

  it("rejects request types that never touch a leave bucket", () => {
    expect(consumesLeaveBalance("overtime")).toBe(false);
    expect(consumesLeaveBalance("wfh")).toBe(false);
    expect(consumesLeaveBalance("on-duty")).toBe(false);
    expect(consumesLeaveBalance("salary-increment")).toBe(false);
    expect(consumesLeaveBalance("other")).toBe(false);
  });

  it("rejects a missing or unknown type rather than assuming leave", () => {
    expect(consumesLeaveBalance(undefined)).toBe(false);
    expect(consumesLeaveBalance(null)).toBe(false);
    expect(consumesLeaveBalance("")).toBe(false);
    expect(consumesLeaveBalance("nonsense")).toBe(false);
  });
});

describe("bucketForLeaveType (legacy code mapping)", () => {
  it("maps stored SL to the Medical Leave bucket", () => {
    expect(bucketForLeaveType("SL")).toBe("ML");
  });

  it("maps stored CO to the Flexible Leave bucket", () => {
    expect(bucketForLeaveType("CO")).toBe("FL");
  });

  it("returns null for counters and unknown codes", () => {
    expect(bucketForLeaveType("HD")).toBeNull();
    expect(bucketForLeaveType("LOP")).toBeNull();
    expect(bucketForLeaveType(undefined)).toBeNull();
    expect(bucketForLeaveType("nonsense")).toBeNull();
  });
});

describe("requestLeaveDays", () => {
  it("counts an inclusive date range", () => {
    expect(requestLeaveDays(leave("CL", "2026-03-02", "2026-03-04"))).toBe(3);
  });

  it("counts a single day as one", () => {
    expect(requestLeaveDays(leave("CL", "2026-03-02"))).toBe(1);
  });

  it("counts a half-day as 0.5 regardless of range", () => {
    expect(requestLeaveDays(leave("CL", "2026-03-02", "2026-03-04", { isHalfDay: true }))).toBe(0.5);
  });

  it("returns 0 rather than NaN for a missing start date", () => {
    expect(requestLeaveDays({ startDate: undefined, endDate: undefined } as never)).toBe(1);
  });
});

describe("overtimeCompOffDays (one request's share of a day)", () => {
  it("gives one day for eight hours", () => {
    expect(overtimeCompOffDays({ startTime: "09:00", endTime: "17:00" })).toBe(1);
  });

  it("is the exact share — rounding happens on the year's total, not per request", () => {
    expect(overtimeCompOffDays({ startTime: "09:00", endTime: "14:00" })).toBe(0.63);
    expect(overtimeCompOffDays({ startTime: "18:00", endTime: "00:00" })).toBe(0.75);
  });

  it("divides by the configured day length", () => {
    expect(overtimeCompOffDays({ startTime: "08:00", endTime: "18:00" }, 10)).toBe(1);
  });

  it("handles an overnight shift", () => {
    expect(overtimeCompOffDays({ startTime: "22:00", endTime: "06:00" })).toBe(1);
  });

  it("returns 0 when times are missing", () => {
    expect(overtimeCompOffDays({})).toBe(0);
  });
});

describe("overtimeDaysFromHours (accumulated hours → leave days)", () => {
  it.each([
    [4, 0.5],
    [6, 0.5],
    [8, 1],
    [10, 1],
    [12, 1.5],
    [16, 2],
    [18, 2],
    [0, 0],
  ])("%sh at an 8h day credits %s day(s), in half-day steps", (hours, days) => {
    expect(overtimeDaysFromHours(hours, 8)).toBe(days);
  });

  it("uses the configured day length instead of a fixed 8", () => {
    expect(overtimeDaysFromHours(9, 9)).toBe(1);
    expect(overtimeDaysFromHours(8, 9)).toBe(0.5);
    expect(overtimeDaysFromHours(8, 10)).toBe(0.5);
    expect(overtimeDaysFromHours(20, 10)).toBe(2);
  });

  it("falls back to 8 hours when the setting is missing or nonsense", () => {
    expect(overtimeDaysFromHours(8, 0)).toBe(1);
    expect(overtimeDaysFromHours(8, Number.NaN)).toBe(1);
    expect(overtimeDaysFromHours(8, undefined)).toBe(1);
  });
});

describe("employmentTypeOf", () => {
  it("uses the explicit employment type", () => {
    expect(employmentTypeOf({ employmentType: "intern" })).toBe("intern");
  });

  it("infers contract staff from a legacy contract type", () => {
    expect(employmentTypeOf({ contractType: "6-months" })).toBe("staff");
  });

  it("defaults to permanent", () => {
    expect(employmentTypeOf(null)).toBe("permanent");
    expect(employmentTypeOf({ contractType: "permanent" })).toBe("permanent");
  });
});

describe("resolveQuota (override → category → flat policy)", () => {
  it("falls back to the flat policy when no category matches", () => {
    expect(resolveQuota({ employmentType: "permanent" }, { casualLeave: 9, sickLeave: 8, earnedLeave: 7 })).toEqual({
      casualLeave: 9,
      sickLeave: 8,
      earnedLeave: 7,
    });
  });

  it("uses the employment-type quota over the flat policy", () => {
    expect(resolveQuota({ employmentType: "staff" }, POLICY)).toEqual({
      casualLeave: 15,
      sickLeave: 15,
      earnedLeave: 0,
    });
  });

  it("lets a per-staff override win, bucket by bucket", () => {
    expect(resolveQuota({ employmentType: "staff", leaveQuota: { casualLeave: 20 } }, POLICY)).toEqual({
      casualLeave: 20,
      sickLeave: 15,
      earnedLeave: 0,
    });
  });

  it("treats an explicit zero as a real override, not a missing value", () => {
    expect(resolveQuota({ employmentType: "permanent", leaveQuota: { earnedLeave: 0 } }, POLICY).earnedLeave).toBe(0);
  });
});

describe("allowsNegativeBalance", () => {
  it("allows negatives for the listed employment types only", () => {
    expect(allowsNegativeBalance({ employmentType: "permanent" }, POLICY)).toBe(true);
    expect(allowsNegativeBalance({ employmentType: "staff" }, POLICY)).toBe(false);
  });

  it("honours the global switch", () => {
    expect(allowsNegativeBalance({ employmentType: "intern" }, { ...POLICY, allowNegative: true })).toBe(true);
  });
});

describe("quotaForBucket", () => {
  it("maps each bucket to its policy field and gives FL nothing", () => {
    const q = { casualLeave: 12, sickLeave: 10, earnedLeave: 15 };
    expect(quotaForBucket(q, "CL")).toBe(12);
    expect(quotaForBucket(q, "ML")).toBe(10);
    expect(quotaForBucket(q, "EL")).toBe(15);
    expect(quotaForBucket(q, "FL")).toBe(0);
  });
});

describe("splitRequestDaysByMonth", () => {
  it("splits a leave that crosses a month boundary", () => {
    const months = splitRequestDaysByMonth(leave("CL", "2026-01-30", "2026-02-02"), YEAR);
    expect(months[0]).toBe(2); // 30, 31 Jan
    expect(months[1]).toBe(2); // 1, 2 Feb
  });

  it("drops days that fall outside the requested year", () => {
    const months = splitRequestDaysByMonth(leave("CL", "2025-12-30", "2026-01-02"), YEAR);
    expect(months[0]).toBe(2);
    expect(months.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("puts a half-day in its own month as 0.5", () => {
    const months = splitRequestDaysByMonth(leave("CL", "2026-05-14", "2026-05-14", { isHalfDay: true }), YEAR);
    expect(months[4]).toBe(0.5);
  });

  it("survives an end date before the start date", () => {
    const months = splitRequestDaysByMonth(leave("CL", "2026-05-14", "2026-05-10"), YEAR);
    expect(months[4]).toBe(1);
  });
});

describe("computeLeaveLedger — approved requests", () => {
  it("starts at the quota with nothing used", () => {
    const l = ledgerOf({});
    expect(l.cl).toMatchObject({ quota: 12, entitled: 12, used: 0, balance: 12 });
    expect(l.el.balance).toBe(15);
    expect(l.fl).toMatchObject({ quota: 0, entitled: 0, balance: 0 });
  });

  it("consumes the right bucket for each stored code", () => {
    const l = ledgerOf({
      requests: [
        leave("CL", "2026-02-02", "2026-02-03"),
        leave("SL", "2026-03-02"),
        leave("EL", "2026-04-06", "2026-04-10"),
      ],
    });
    expect(l.cl).toMatchObject({ used: 2, balance: 10 });
    expect(l.ml).toMatchObject({ used: 1, balance: 11 });
    expect(l.el).toMatchObject({ used: 5, balance: 10 });
  });

  it("ignores requests that are not approved", () => {
    const l = ledgerOf({
      requests: [leave("CL", "2026-02-02", "2026-02-06", { status: "pending" })],
    });
    expect(l.cl.used).toBe(0);
  });

  it("ignores requests from another year", () => {
    const l = ledgerOf({ requests: [leave("CL", "2025-02-02", "2025-02-06")] });
    expect(l.cl.used).toBe(0);
  });

  it("counts half-days as 0.5", () => {
    const l = ledgerOf({ requests: [leave("CL", "2026-02-02", "2026-02-02", { isHalfDay: true })] });
    expect(l.cl.used).toBe(0.5);
    expect(l.cl.balance).toBe(11.5);
  });

  it("keeps HD and LOP as counters, off every bucket", () => {
    const l = ledgerOf({ requests: [leave("HD", "2026-02-02"), leave("LOP", "2026-03-02", "2026-03-04")] });
    expect(l.hd).toBe(1);
    expect(l.lop).toBe(3);
    expect(l.cl.used).toBe(0);
  });

  it("earns flexible leave from approved overtime and spends it on CO leave", () => {
    const l = ledgerOf({
      requests: [
        leave("CL", "2026-02-01", "2026-02-01", {
          type: "overtime",
          leaveType: undefined,
          startTime: "09:00",
          endTime: "17:00",
        }),
        leave("CO", "2026-03-02"),
      ],
    });
    expect(l.fl).toMatchObject({ entitled: 1, used: 1, balance: 0 });
  });

  it("treats long-leave the same as leave", () => {
    const l = ledgerOf({ requests: [leave("EL", "2026-06-01", "2026-06-10", { type: "long-leave" })] });
    expect(l.el.used).toBe(10);
  });
});

describe("computeLeaveLedger — adjustments", () => {
  it("credits entitlement for a positive adjustment", () => {
    const l = ledgerOf({ adjustments: [adjustment("CL", 3, "2026-01-01", { kind: "opening" })] });
    expect(l.cl).toMatchObject({ quota: 12, credited: 3, entitled: 15, balance: 15 });
  });

  it("consumes balance for a negative adjustment", () => {
    const l = ledgerOf({ adjustments: [adjustment("ML", -2, "2026-07-15")] });
    expect(l.ml).toMatchObject({ debited: 2, used: 2, balance: 10 });
    expect(l.ml.monthly[6]).toBe(2);
  });

  it("credits flexible leave from a converted week-off day", () => {
    const l = ledgerOf({
      adjustments: [adjustment("FL", 1, "2026-08-09", { kind: "sunday-credit", sundayDutyId: "sd1" })],
    });
    expect(l.fl).toMatchObject({ entitled: 1, used: 0, balance: 1 });
  });

  it("ignores adjustments from another year", () => {
    const l = ledgerOf({ adjustments: [adjustment("CL", 5, "2025-01-01", { year: 2025 })] });
    expect(l.cl.entitled).toBe(12);
  });

  it("nets a correction against its own negation", () => {
    const l = ledgerOf({
      adjustments: [adjustment("CL", 4, "2026-01-01"), adjustment("CL", -4, "2026-01-02", { kind: "correction" })],
    });
    expect(l.cl.balance).toBe(12);
  });

  it("ignores a non-numeric days value rather than producing NaN", () => {
    const l = ledgerOf({ adjustments: [adjustment("CL", Number.NaN, "2026-01-01")] });
    expect(l.cl.balance).toBe(12);
  });
});

describe("computeLeaveLedger — negative balances", () => {
  it("floors at zero for contract staff", () => {
    const l = ledgerOf({ requests: [leave("CL", "2026-02-01", "2026-02-15")], allowNegative: false });
    expect(l.cl.used).toBe(15);
    expect(l.cl.balance).toBe(0);
  });

  it("carries a deficit for permanent staff, matching the printed sheet", () => {
    const l = ledgerOf({ requests: [leave("CL", "2026-02-01", "2026-02-15")], allowNegative: true });
    expect(l.cl.balance).toBe(-3);
  });
});

describe("computeLeaveLedger — week-off duty summary", () => {
  it("separates pending from converted and skips rejected", () => {
    const l = ledgerOf({
      sundayDuties: [
        duty("2026-08-02", "pending"),
        duty("2026-08-09", "converted", { creditDays: 1 }),
        duty("2026-08-16", "converted", { creditDays: 0.5 }),
        duty("2026-08-23", "rejected"),
      ],
    });
    expect(l.sundays).toEqual({
      worked: 3,
      converted: 2,
      pending: 1,
      creditedDays: 1.5,
      monthlyWorked: [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0],
    });
  });

  it("ignores duties from another year", () => {
    const l = ledgerOf({ sundayDuties: [duty("2025-08-03", "pending", { year: 2025 })] });
    expect(l.sundays.worked).toBe(0);
  });

  it("defaults a converted duty without creditDays to one day", () => {
    const l = ledgerOf({ sundayDuties: [duty("2026-08-09", "converted")] });
    expect(l.sundays.creditedDays).toBe(1);
  });
});

describe("computeLeaveLedger — month-wise totals", () => {
  it("fills the sheet's JAN..DEC row across buckets", () => {
    const l = ledgerOf({
      requests: [leave("CL", "2026-01-05", "2026-01-06"), leave("SL", "2026-03-10")],
      adjustments: [adjustment("EL", -1, "2026-03-20")],
    });
    expect(l.monthly[0]).toBe(2);
    expect(l.monthly[2]).toBe(2); // 1 ML request + 1 EL debit
    expect(l.totalDays).toBe(4);
  });
});

describe("helpers", () => {
  it("emptyLedger reflects the quota and nothing else", () => {
    const l = emptyLedger({ casualLeave: 15, sickLeave: 15, earnedLeave: 0 }, YEAR);
    expect(l.cl.balance).toBe(15);
    expect(l.totalDays).toBe(0);
  });

  it("ledgerBucket reaches every bucket by code", () => {
    const l = emptyLedger({ casualLeave: 1, sickLeave: 2, earnedLeave: 3 }, YEAR);
    expect(ledgerBucket(l, "CL").quota).toBe(1);
    expect(ledgerBucket(l, "ML").quota).toBe(2);
    expect(ledgerBucket(l, "EL").quota).toBe(3);
    expect(ledgerBucket(l, "FL").quota).toBe(0);
  });
});

describe("countsAsWeekOffDuty (what the attendance scan raises)", () => {
  it("raises a day the person worked on a scheduled off day", () => {
    expect(countsAsWeekOffDuty({ status: "present" }, true)).toBe(true);
    expect(countsAsWeekOffDuty({ status: "half-day" }, true)).toBe(true);
    expect(countsAsWeekOffDuty({ status: "overtime" }, true)).toBe(true);
    expect(countsAsWeekOffDuty({ status: "on-duty" }, true)).toBe(true);
  });

  it("folds a legacy status before deciding, so an old late row still counts", () => {
    expect(countsAsWeekOffDuty({ status: "late" }, true)).toBe(true);
    expect(countsAsWeekOffDuty({ status: "wfh" }, true)).toBe(true);
  });

  it("ignores a normal working day, however the person was marked", () => {
    expect(countsAsWeekOffDuty({ status: "present" }, false)).toBe(false);
  });

  it("ignores an off day the person did not work", () => {
    expect(countsAsWeekOffDuty({ status: "week-off" }, true)).toBe(false);
    expect(countsAsWeekOffDuty({ status: "absent" }, true)).toBe(false);
    expect(countsAsWeekOffDuty({ status: "casual-leave" }, true)).toBe(false);
    expect(countsAsWeekOffDuty({ status: "public-holiday" }, true)).toBe(false);
  });

  it("ignores a deleted or missing record", () => {
    expect(countsAsWeekOffDuty({ status: "present", isDeleted: true }, true)).toBe(false);
    expect(countsAsWeekOffDuty(null, true)).toBe(false);
    expect(countsAsWeekOffDuty({}, true)).toBe(false);
  });
});

describe("weekOffDutyKey (scan idempotency)", () => {
  it("is one key per staff member per day", () => {
    expect(weekOffDutyKey("s1", "2026-08-09")).toBe(weekOffDutyKey("s1", "2026-08-09"));
    expect(weekOffDutyKey("s1", "2026-08-09")).not.toBe(weekOffDutyKey("s2", "2026-08-09"));
    expect(weekOffDutyKey("s1", "2026-08-09")).not.toBe(weekOffDutyKey("s1", "2026-08-16"));
  });
});

describe("overtimeHours", () => {
  it("measures a normal evening shift", () => {
    expect(overtimeHours({ startTime: "18:00", endTime: "21:30" })).toBe(3.5);
  });

  it("measures an overnight shift across midnight", () => {
    expect(overtimeHours({ startTime: "22:00", endTime: "02:00" })).toBe(4);
  });

  it("returns 0 for missing or unparseable times", () => {
    expect(overtimeHours({})).toBe(0);
    expect(overtimeHours({ startTime: "x", endTime: "18:00" })).toBe(0);
  });
});

describe("computeLeaveLedger — overtime summary", () => {
  const ot = (start: string, startTime: string, endTime: string) =>
    leave("CL", start, start, { type: "overtime", leaveType: undefined, startTime, endTime });

  it("counts approved overtime requests, hours and the days they earn", () => {
    const l = ledgerOf({
      requests: [ot("2026-02-01", "09:00", "17:00"), ot("2026-03-01", "18:00", "22:00")],
    });
    expect(l.overtime).toEqual({ count: 2, hours: 12, daysEarned: 1.5, carryHours: 0, fullDayHours: 8 });
    expect(l.fl.entitled).toBe(1.5);
  });

  it("accumulates hours across requests before converting (3 × 6h = 18h = 2 days, 2h carried)", () => {
    const l = ledgerOf({
      requests: [
        ot("2026-02-01", "18:00", "00:00"),
        ot("2026-02-08", "18:00", "00:00"),
        ot("2026-02-15", "18:00", "00:00"),
      ],
    });
    // Per-request flooring used to give 0.5 + 0.5 + 0.5 = 1.5 and lose 6 hours.
    expect(l.overtime).toEqual({ count: 3, hours: 18, daysEarned: 2, carryHours: 2, fullDayHours: 8 });
    expect(l.fl.entitled).toBe(2);
    expect(l.flSources.overtime).toBe(2);
  });

  it("converts at the configured working-day length", () => {
    const l = computeLeaveLedger({
      requests: [ot("2026-02-01", "08:00", "18:00"), ot("2026-02-02", "18:00", "02:00")],
      adjustments: [],
      sundayDuties: [],
      quota: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
      year: 2026,
      fullDayHours: 10,
    });
    expect(l.overtime).toEqual({ count: 2, hours: 18, daysEarned: 1.5, carryHours: 3, fullDayHours: 10 });
  });

  it("leaves the summary empty when there is no overtime", () => {
    expect(ledgerOf({}).overtime).toEqual({ count: 0, hours: 0, daysEarned: 0, carryHours: 0, fullDayHours: 8 });
  });

  it("ignores overtime that was never approved", () => {
    const l = ledgerOf({
      requests: [
        leave("CL", "2026-02-01", "2026-02-01", {
          type: "overtime",
          leaveType: undefined,
          startTime: "09:00",
          endTime: "17:00",
          status: "pending",
        }),
      ],
    });
    expect(l.overtime.count).toBe(0);
  });

  it("ignores overtime from another year", () => {
    expect(ledgerOf({ requests: [ot("2025-02-01", "09:00", "17:00")] }).overtime.count).toBe(0);
  });
});

describe("computeLeaveLedger — where flexible leave came from", () => {
  it("separates overtime, converted week-offs and admin grants", () => {
    const l = ledgerOf({
      requests: [
        leave("CL", "2026-02-01", "2026-02-01", {
          type: "overtime",
          leaveType: undefined,
          startTime: "09:00",
          endTime: "17:00",
        }),
      ],
      adjustments: [
        adjustment("FL", 1, "2026-08-09", { kind: "sunday-credit", sundayDutyId: "sd1" }),
        adjustment("FL", 0.5, "2026-09-01", { kind: "grant" }),
      ],
    });
    expect(l.flSources).toEqual({ overtime: 1, weekOff: 1, manual: 0.5 });
    expect(l.fl.entitled).toBe(2.5);
  });

  it("reports no sources when nothing was earned", () => {
    expect(ledgerOf({}).flSources).toEqual({ overtime: 0, weekOff: 0, manual: 0 });
  });
});

describe("groupByEmployment (the sheet's three groups)", () => {
  const row = (id: string, staff: Record<string, unknown>) => ({ id, staff });

  it("splits permanent, contract and interns the way the printed sheet does", () => {
    const sections = groupByEmployment([
      row("a", { employmentType: "permanent" }),
      row("b", { employmentType: "staff" }),
      row("c", { employmentType: "intern" }),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["PERMANENT", "CONTRACT", "INTERNS"]);
    expect(sections[0].rows.map((r) => r.id)).toEqual(["a"]);
    expect(sections[1].rows.map((r) => r.id)).toEqual(["b"]);
    expect(sections[2].rows.map((r) => r.id)).toEqual(["c"]);
  });

  it("puts a legacy row with no employment type under PERMANENT", () => {
    const sections = groupByEmployment([row("a", {})]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("PERMANENT");
  });

  it("reads a legacy fixed-term contract as CONTRACT", () => {
    const sections = groupByEmployment([row("a", { contractType: "6-months" })]);
    expect(sections[0].title).toBe("CONTRACT");
  });

  it("drops a group that has no rows", () => {
    expect(groupByEmployment([row("a", { employmentType: "intern" })]).map((s) => s.title)).toEqual([
      "INTERNS",
    ]);
  });

  it("returns nothing for an empty page", () => {
    expect(groupByEmployment([])).toEqual([]);
  });

  it("keeps the incoming order inside each group", () => {
    const sections = groupByEmployment([
      row("b", { employmentType: "permanent" }),
      row("a", { employmentType: "permanent" }),
    ]);
    expect(sections[0].rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

// ==================== On duty ====================

function attendance(date: string, status: Attendance["status"], extra: Partial<Attendance> = {}): Attendance {
  return { staffId: "s1", date: ts(date), status, isLate: false, isEarlyDeparture: false, ...extra } as Attendance;
}

describe("onDutyMonthsFromAttendance (the sheet's OD marks)", () => {
  it("counts one day per on-duty record, bucketed by month", () => {
    const months = onDutyMonthsFromAttendance(
      [attendance("2026-01-05", "on-duty"), attendance("2026-01-09", "on-duty"), attendance("2026-03-02", "on-duty")],
      YEAR
    );
    expect(months[0]).toBe(2);
    expect(months[2]).toBe(1);
    expect(months.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores every status that is not on duty", () => {
    const months = onDutyMonthsFromAttendance(
      [attendance("2026-01-05", "present"), attendance("2026-01-06", "absent"), attendance("2026-01-07", "week-off")],
      YEAR
    );
    expect(months.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("ignores soft-deleted records", () => {
    const months = onDutyMonthsFromAttendance([attendance("2026-01-05", "on-duty", { isDeleted: true })], YEAR);
    expect(months[0]).toBe(0);
  });

  it("drops records from another year", () => {
    const months = onDutyMonthsFromAttendance([attendance("2025-01-05", "on-duty")], YEAR);
    expect(months.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("counts one day per calendar day even if the day was imported twice", () => {
    const months = onDutyMonthsFromAttendance(
      [attendance("2026-02-10", "on-duty"), attendance("2026-02-10", "on-duty")],
      YEAR
    );
    expect(months[1]).toBe(1);
  });

  it("returns twelve zeroes for no records", () => {
    expect(onDutyMonthsFromAttendance([], YEAR)).toEqual(new Array(12).fill(0));
  });
});

describe("computeLeaveLedger — on-duty summary", () => {
  it("carries the month-wise on-duty days and their total", () => {
    const onDutyDays = new Array(12).fill(0);
    onDutyDays[0] = 3;
    onDutyDays[6] = 2;
    const ledger = ledgerOf({ onDutyDays });
    expect(ledger.onDuty.monthly[0]).toBe(3);
    expect(ledger.onDuty.monthly[6]).toBe(2);
    expect(ledger.onDuty.total).toBe(5);
  });

  it("defaults to an empty on-duty summary when attendance was not loaded", () => {
    const ledger = ledgerOf({});
    expect(ledger.onDuty).toEqual({ total: 0, monthly: new Array(12).fill(0) });
  });

  it("never lets on-duty days leak into the leave totals", () => {
    const onDutyDays = new Array(12).fill(0);
    onDutyDays[0] = 4;
    const ledger = ledgerOf({ onDutyDays });
    expect(ledger.totalDays).toBe(0);
    expect(ledger.monthly[0]).toBe(0);
  });
});

describe("month-wise attribution of debits", () => {
  it("files a debit against the month of its effective date", () => {
    const ledger = ledgerOf({ adjustments: [adjustment("CL", -2, "2026-04-18")] });
    expect(ledger.cl.monthly[3]).toBe(2);
  });

  it("falls back to the month it was recorded when the debit has no effective date", () => {
    const undated = {
      ...adjustment("CL", -2, "2026-04-18"),
      date: undefined as unknown as Timestamp,
      createdAt: ts("2026-07-02"),
    };
    const ledger = ledgerOf({ adjustments: [undated] });
    expect(ledger.cl.monthly[6]).toBe(2);
  });

  it("files a debit with neither date into January rather than dropping it", () => {
    const undated = {
      ...adjustment("CL", -2, "2026-04-18"),
      date: undefined as unknown as Timestamp,
    };
    const ledger = ledgerOf({ adjustments: [undated] });
    expect(ledger.cl.monthly[0]).toBe(2);
  });

  it("ignores an effective date from another year instead of filing it in that month", () => {
    // Dated in 2025 but booked against 2026 — December 2025 must not become
    // December 2026. The recorded month wins.
    const misdated = {
      ...adjustment("CL", -2, "2025-12-20"),
      createdAt: ts("2026-02-09"),
    };
    const ledger = ledgerOf({ adjustments: [misdated] });
    expect(ledger.cl.monthly[11]).toBe(0);
    expect(ledger.cl.monthly[1]).toBe(2);
  });

  it("keeps the month-wise split adding up to the days used, for every bucket", () => {
    const ledger = ledgerOf({
      requests: [leave("CL", "2026-03-02", "2026-03-04"), leave("SL", "2026-05-11")],
      adjustments: [
        adjustment("EL", -3, "2026-06-01"),
        { ...adjustment("FL", -1, "2026-04-18"), date: undefined as unknown as Timestamp },
      ],
    });

    for (const code of LEAVE_BUCKETS) {
      const bucket = ledgerBucket(ledger, code);
      const summed = bucket.monthly.reduce((a, b) => a + b, 0);
      expect(summed).toBe(bucket.used);
    }
  });
});

describe("week-off duty, month by month", () => {
  it("counts the days worked in each month", () => {
    const ledger = ledgerOf({
      sundayDuties: [duty("2026-03-08", "converted"), duty("2026-03-15", "pending"), duty("2026-08-16", "converted")],
    });
    expect(ledger.sundays.monthlyWorked[2]).toBe(2);
    expect(ledger.sundays.monthlyWorked[7]).toBe(1);
    expect(ledger.sundays.monthlyWorked[1]).toBe(0);
  });

  it("leaves a rejected duty out of the month-wise count", () => {
    const ledger = ledgerOf({ sundayDuties: [duty("2026-03-08", "rejected")] });
    expect(ledger.sundays.monthlyWorked[2]).toBe(0);
  });

  it("keeps the month-wise count adding up to the days worked", () => {
    const ledger = ledgerOf({
      sundayDuties: [duty("2026-01-04", "converted"), duty("2026-03-08", "pending"), duty("2026-11-01", "converted")],
    });
    const summed = ledger.sundays.monthlyWorked.reduce((a, b) => a + b, 0);
    expect(summed).toBe(ledger.sundays.worked);
  });
});

describe("computeLeaveLedger — FL and OT wallets", () => {
  const ot8 = (date: string) =>
    leave(undefined, date, date, { type: "overtime", startTime: "09:00", endTime: "17:00" });
  const sunday = (date: string) => adjustment("FL", 1, date, { kind: "sunday-credit" });

  it("keeps week-off credit and overtime credit in separate wallets", () => {
    const l = ledgerOf({ requests: [ot8("2026-02-01"), ot8("2026-02-02")], adjustments: [sunday("2026-03-01")] });
    expect(l.wallets.fl).toEqual({ earned: 1, used: 0, balance: 1 });
    expect(l.wallets.ot).toEqual({ earned: 2, used: 0, balance: 2 });
    // The printed sheet's FL column is still the total of both.
    expect(l.fl.balance).toBe(3);
  });

  it("spends the wallet the request names", () => {
    const l = ledgerOf({
      requests: [
        ot8("2026-02-01"),
        ot8("2026-02-02"),
        leave("CO", "2026-04-06", "2026-04-06", { leaveWallet: "OT" }),
      ],
      adjustments: [sunday("2026-03-01")],
    });
    expect(l.wallets.ot).toEqual({ earned: 2, used: 1, balance: 1 });
    expect(l.wallets.fl).toEqual({ earned: 1, used: 0, balance: 1 });
  });

  it("spends FL first, then OT, for a day with no wallet (register mark or older request)", () => {
    const l = ledgerOf({
      requests: [ot8("2026-02-01"), ot8("2026-02-02"), leave("CO", "2026-04-06", "2026-04-07")],
      adjustments: [sunday("2026-03-01"), adjustment("FL", -1, "2026-05-04", { sourceAttendanceId: "a1" })],
    });
    // 3 unassigned days: 1 from FL (all it has), 2 from OT.
    expect(l.wallets.fl).toEqual({ earned: 1, used: 1, balance: 0 });
    expect(l.wallets.ot).toEqual({ earned: 2, used: 2, balance: 0 });
  });

  it("lets an admin credit or debit a named wallet", () => {
    const l = ledgerOf({
      adjustments: [adjustment("FL", 1.5, "2026-03-01", { wallet: "OT" }), adjustment("FL", -0.5, "2026-03-02", { wallet: "OT" })],
    });
    expect(l.wallets.ot).toEqual({ earned: 1.5, used: 0.5, balance: 1 });
    expect(l.wallets.fl).toEqual({ earned: 0, used: 0, balance: 0 });
  });

  it("puts an overdraw beyond both wallets on FL, the default wallet", () => {
    const l = ledgerOf({ requests: [leave("CO", "2026-04-06", "2026-04-07")], allowNegative: true });
    expect(l.wallets.fl).toEqual({ earned: 0, used: 2, balance: -2 });
    expect(l.wallets.ot.balance).toBe(0);
  });

  it("floors wallet balances at zero unless negatives are allowed", () => {
    const l = ledgerOf({ requests: [leave("CO", "2026-04-06", "2026-04-06", { leaveWallet: "OT" })] });
    expect(l.wallets.ot).toEqual({ earned: 0, used: 1, balance: 0 });
  });
});
