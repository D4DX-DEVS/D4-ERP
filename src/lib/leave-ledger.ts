// ==================== Leave ledger (pure) ====================
// Single source of truth for every leave number shown anywhere in the app.
//
// Balance is a ledger, not a formula over requests alone:
//
//   entitled = quota + credit adjustments (opening balance, grants, FL earned)
//   used     = approved leave requests + debit adjustments
//   balance  = entitled - used            (clamped at 0 unless negatives allowed)
//
// Three inputs feed it: approved staff requests, manual `leave_adjustments`
// rows, and `sunday_duties` (week-off days actually worked). Keeping this file
// dependency-free means the admin matrix, the staff profile tab and the staff
// portal all agree by construction — an admin edit cannot show one number to
// the admin and another to the employee.

import { normalizeAttendanceStatus } from "@/lib/attendance-status";
import type {
  AttendanceStatus,
  EmploymentType,
  LeaveAdjustment,
  LeaveBucket,
  LeaveQuota,
  LeaveType,
  Staff,
  StaffRequest,
  SundayDuty,
} from "@/types";

/** Buckets that carry a balance. HD and LOP are counters, not buckets. */
export const LEAVE_BUCKETS: LeaveBucket[] = ["CL", "ML", "EL", "FL"];

export const LEAVE_BUCKET_LABELS: Record<LeaveBucket, string> = {
  CL: "Casual Leave",
  ML: "Medical Leave",
  EL: "Earned Leave",
  FL: "Flexible Leave",
};

/**
 * Stored leave-type codes are legacy: "SL" holds Medical Leave and "CO" holds
 * Flexible Leave. Anything else (HD, LOP, blank) is not a balance bucket.
 */
export function bucketForLeaveType(leaveType?: LeaveType | string | null): LeaveBucket | null {
  switch (leaveType) {
    case "CL":
      return "CL";
    case "SL":
      return "ML";
    case "EL":
      return "EL";
    case "CO":
      return "FL";
    default:
      return null;
  }
}

/** Whole days covered by a leave request (0.5 for a half-day). */
export function requestLeaveDays(
  r: Pick<StaffRequest, "isHalfDay" | "startDate" | "endDate">
): number {
  if (r.isHalfDay) return 0.5;
  const start = r.startDate?.seconds ?? 0;
  const end = r.endDate?.seconds ?? 0;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86400) + 1);
}

/** Hours covered by one overtime request, handling an overnight shift. */
export function overtimeHours(req: Pick<StaffRequest, "startTime" | "endTime">): number {
  if (!req.startTime || !req.endTime) return 0;
  const [sh, sm] = req.startTime.split(":").map(Number);
  const [eh, em] = req.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight OT
  return Math.round((mins / 60) * 100) / 100;
}

/** Comp-off days earned by one approved overtime request. 8h OT = 1 day, floored to 0.5 steps. */
export function overtimeCompOffDays(req: Pick<StaffRequest, "startTime" | "endTime">): number {
  if (!req.startTime || !req.endTime) return 0;
  const [sh, sm] = req.startTime.split(":").map(Number);
  const [eh, em] = req.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight OT
  return Math.floor((mins / 60 / 8) * 2) / 2;
}

// ==================== Week-off duty ====================

/**
 * Attendance statuses that mean the person actually worked that day. Leave,
 * absence and the week-off marker itself are not duty.
 */
export const WORKED_ATTENDANCE_STATUSES = new Set([
  "present",
  "half-day",
  "overtime",
  "on-duty",
]);

/**
 * Whether one attendance record should be raised as week-off duty: the day has
 * to be a scheduled off day (Sunday, another weekly off, or a holiday) AND the
 * record has to say they worked. Legacy statuses are folded first, so an old
 * "late" row still counts as worked.
 */
export function countsAsWeekOffDuty(
  record: { status?: AttendanceStatus; isDeleted?: boolean } | null | undefined,
  isNonWorkingDay: boolean
): boolean {
  if (!record || record.isDeleted || !isNonWorkingDay || !record.status) return false;
  return WORKED_ATTENDANCE_STATUSES.has(normalizeAttendanceStatus(record.status));
}

/** Dedup key for a week-off duty row: one per staff member per calendar day. */
export function weekOffDutyKey(staffId: string, dayKey: string): string {
  return `${staffId}|${dayKey}`;
}

// ==================== Quota resolution ====================

/**
 * Leave policy as stored in app settings. The flat CL/ML/EL numbers are the
 * legacy shape and stay authoritative as the final fallback; `byEmploymentType`
 * lets permanent staff, contract staff and interns carry different quotas the
 * way the printed sheet does.
 */
export interface LeavePolicyConfig extends LeaveQuota {
  byEmploymentType?: Partial<Record<EmploymentType, Partial<LeaveQuota>>>;
  /** When true a bucket may end up negative (permanent staff carry a deficit). */
  allowNegative?: boolean;
  /** Employment types allowed to go negative when `allowNegative` is off. */
  negativeEmploymentTypes?: EmploymentType[];
}

export type QuotaStaff = Pick<Staff, "employmentType" | "contractType" | "leaveQuota">;

/** Employment category, inferring the legacy contract-type shape when unset. */
export function employmentTypeOf(staff?: QuotaStaff | null): EmploymentType {
  if (staff?.employmentType) return staff.employmentType;
  if (staff?.contractType && staff.contractType !== "permanent") return "staff";
  return "permanent";
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Per-staff override → employment-type quota → flat policy. Each of the three
 * buckets resolves independently, so an override of CL alone leaves ML and EL
 * on the category default.
 */
export function resolveQuota(
  staff: QuotaStaff | null | undefined,
  policy: LeavePolicyConfig
): LeaveQuota {
  const category = policy.byEmploymentType?.[employmentTypeOf(staff)] ?? {};
  const override = staff?.leaveQuota ?? {};
  return {
    casualLeave:
      positiveOrNull(override.casualLeave) ??
      positiveOrNull(category.casualLeave) ??
      policy.casualLeave ??
      0,
    sickLeave:
      positiveOrNull(override.sickLeave) ??
      positiveOrNull(category.sickLeave) ??
      policy.sickLeave ??
      0,
    earnedLeave:
      positiveOrNull(override.earnedLeave) ??
      positiveOrNull(category.earnedLeave) ??
      policy.earnedLeave ??
      0,
  };
}

/** The two groups the printed sheet splits staff into. */
export type EmploymentGroup = "PERMANENT" | "CONTRACT";

export interface EmploymentGroupSection<T> {
  title: EmploymentGroup;
  rows: T[];
}

/**
 * Splits rows into the sheet's PERMANENT and CONTRACT groups. The group is
 * derived from the staff record, never a stored flag, so a legacy row with no
 * employment type still lands where employmentTypeOf() says it belongs. Empty
 * groups are dropped so a page of only interns shows one heading, not two.
 */
export function groupByEmployment<T extends { staff: QuotaStaff }>(
  rows: T[]
): EmploymentGroupSection<T>[] {
  const permanent = rows.filter((r) => employmentTypeOf(r.staff) === "permanent");
  const contract = rows.filter((r) => employmentTypeOf(r.staff) !== "permanent");
  const out: EmploymentGroupSection<T>[] = [];
  if (permanent.length) out.push({ title: "PERMANENT", rows: permanent });
  if (contract.length) out.push({ title: "CONTRACT", rows: contract });
  return out;
}

/** Whether this staff member's balances may go below zero. */
export function allowsNegativeBalance(
  staff: QuotaStaff | null | undefined,
  policy: LeavePolicyConfig
): boolean {
  if (policy.allowNegative) return true;
  const types = policy.negativeEmploymentTypes;
  return Array.isArray(types) && types.includes(employmentTypeOf(staff));
}

/** Quota per bucket. FL has no quota — it is earned, never granted upfront. */
export function quotaForBucket(quota: LeaveQuota, bucket: LeaveBucket): number {
  switch (bucket) {
    case "CL":
      return quota.casualLeave ?? 0;
    case "ML":
      return quota.sickLeave ?? 0;
    case "EL":
      return quota.earnedLeave ?? 0;
    case "FL":
      return 0;
  }
}

// ==================== Ledger ====================

export interface BucketLedger {
  /** Quota plus every credit — the days this person is entitled to this year. */
  entitled: number;
  /** Approved leave of this type plus every manual debit. */
  used: number;
  /** entitled - used. Floored at 0 unless negatives are allowed. */
  balance: number;
  /** Quota component of `entitled`, shown as the sheet's CURRENT column. */
  quota: number;
  /** Credit adjustments only — FL earned, granted days, opening balance. */
  credited: number;
  /** Debit adjustments only — days taken outside the request flow. */
  debited: number;
  /** Days consumed by approved leave requests. */
  fromRequests: number;
  /** Jan..Dec days consumed, for the month-wise sheet columns. */
  monthly: number[];
}

export interface OvertimeSummary {
  /** Approved overtime requests in this year. */
  count: number;
  /** Total overtime hours across them. */
  hours: number;
  /** Flexible-leave days those hours earned (8h = 1 day). */
  daysEarned: number;
}

/** Where the flexible-leave entitlement came from, so the credit is explainable. */
export interface FlexibleLeaveSources {
  overtime: number;
  weekOff: number;
  manual: number;
}

export interface SundaySummary {
  /** Week-off days worked that are not rejected. */
  worked: number;
  /** Already converted into flexible leave. */
  converted: number;
  /** Detected, awaiting an admin decision. */
  pending: number;
  /** Flexible-leave days credited by those conversions. */
  creditedDays: number;
}

export interface LeaveLedger {
  year: number;
  cl: BucketLedger;
  ml: BucketLedger;
  el: BucketLedger;
  fl: BucketLedger;
  /** Half-day requests logged with the HD code (a counter, not a bucket). */
  hd: number;
  /** Loss-of-pay days (a counter, not a bucket). */
  lop: number;
  sundays: SundaySummary;
  /** Approved overtime for the year, shown alongside the balances. */
  overtime: OvertimeSummary;
  /** Breakdown of the flexible-leave entitlement by where it was earned. */
  flSources: FlexibleLeaveSources;
  /** Jan..Dec total leave days across every bucket, matching the sheet's row. */
  monthly: number[];
  /** Sum of `monthly` — the sheet's TOTAL column. */
  totalDays: number;
  allowNegative: boolean;
}

function emptyBucket(quota = 0): BucketLedger {
  return {
    entitled: quota,
    used: 0,
    balance: quota,
    quota,
    credited: 0,
    debited: 0,
    fromRequests: 0,
    monthly: new Array(12).fill(0),
  };
}

function zeroSundays(): SundaySummary {
  return { worked: 0, converted: 0, pending: 0, creditedDays: 0 };
}

function zeroOvertime(): OvertimeSummary {
  return { count: 0, hours: 0, daysEarned: 0 };
}

/** Rounds to 0.5-day precision so float sums never surface as 2.9999999. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function yearOf(seconds?: number): number | null {
  if (!Number.isFinite(seconds) || !seconds) return null;
  return new Date(seconds * 1000).getFullYear();
}

function monthOf(seconds?: number): number | null {
  if (!Number.isFinite(seconds) || !seconds) return null;
  return new Date(seconds * 1000).getMonth();
}

/**
 * Splits one request's days across the calendar months it spans, so a leave
 * running 29 Jan – 2 Feb lands 3 days in January and 2 in February. Days
 * outside `year` are dropped. Returns a Jan..Dec array.
 */
export function splitRequestDaysByMonth(
  r: Pick<StaffRequest, "isHalfDay" | "startDate" | "endDate">,
  year: number
): number[] {
  const months = new Array(12).fill(0);
  const startSec = r.startDate?.seconds ?? 0;
  if (!Number.isFinite(startSec) || !startSec) return months;

  if (r.isHalfDay) {
    const m = monthOf(startSec);
    if (m !== null && yearOf(startSec) === year) months[m] = 0.5;
    return months;
  }

  const start = new Date(startSec * 1000);
  start.setHours(0, 0, 0, 0);
  const endSec = r.endDate?.seconds ?? startSec;
  const end = new Date((Number.isFinite(endSec) && endSec ? endSec : startSec) * 1000);
  end.setHours(0, 0, 0, 0);
  if (end.getTime() < start.getTime()) end.setTime(start.getTime());

  // Bounded walk: a request longer than ~2 years is data corruption, not leave.
  const MAX_DAYS = 800;
  let guard = 0;
  for (
    const d = new Date(start);
    d.getTime() <= end.getTime() && guard < MAX_DAYS;
    d.setDate(d.getDate() + 1), guard++
  ) {
    if (d.getFullYear() === year) months[d.getMonth()] += 1;
  }
  return months;
}

export interface LedgerInput {
  /** Approved requests for this staff member. Non-approved rows are ignored. */
  requests: StaffRequest[];
  adjustments: LeaveAdjustment[];
  sundayDuties: SundayDuty[];
  quota: LeaveQuota;
  year: number;
  allowNegative?: boolean;
}

/**
 * Rolls every input into one year's ledger. Pure: same inputs, same numbers,
 * whoever is asking.
 */
export function computeLeaveLedger({
  requests,
  adjustments,
  sundayDuties,
  quota,
  year,
  allowNegative = false,
}: LedgerInput): LeaveLedger {
  const buckets: Record<LeaveBucket, BucketLedger> = {
    CL: emptyBucket(quota.casualLeave ?? 0),
    ML: emptyBucket(quota.sickLeave ?? 0),
    EL: emptyBucket(quota.earnedLeave ?? 0),
    FL: emptyBucket(0),
  };
  let hd = 0;
  let lop = 0;
  const overtime = zeroOvertime();
  const flSources: FlexibleLeaveSources = { overtime: 0, weekOff: 0, manual: 0 };

  // ── Approved requests ────────────────────────────────────────────────
  for (const r of requests ?? []) {
    if (r.status !== "approved") continue;

    if (r.type === "overtime") {
      // Overtime earns flexible leave in the year the overtime happened.
      if (yearOf(r.startDate?.seconds) !== year) continue;
      const earned = overtimeCompOffDays(r);
      buckets.FL.credited += earned;
      flSources.overtime += earned;
      overtime.count += 1;
      overtime.hours += overtimeHours(r);
      overtime.daysEarned += earned;
      continue;
    }

    if (r.type !== "leave" && r.type !== "long-leave") continue;

    const months = splitRequestDaysByMonth(r, year);
    const daysInYear = months.reduce((a, b) => a + b, 0);
    if (daysInYear <= 0) continue;

    if (r.leaveType === "HD") {
      hd += daysInYear;
      continue;
    }
    if (r.leaveType === "LOP") {
      lop += daysInYear;
      continue;
    }

    const bucket = bucketForLeaveType(r.leaveType);
    if (!bucket) continue;
    buckets[bucket].fromRequests += daysInYear;
    for (let m = 0; m < 12; m++) buckets[bucket].monthly[m] += months[m];
  }

  // ── Manual adjustments ───────────────────────────────────────────────
  // `days` is signed: positive adds entitlement, negative consumes it. Storing
  // one signed number (rather than a kind-dependent sign) keeps a correction of
  // a correction trivial — negate and re-post.
  for (const a of adjustments ?? []) {
    if (a.year !== year) continue;
    const bucket = a.bucket;
    if (!bucket || !(bucket in buckets)) continue;
    const days = typeof a.days === "number" && Number.isFinite(a.days) ? a.days : 0;
    if (days === 0) continue;
    if (days > 0) {
      buckets[bucket].credited += days;
      if (bucket === "FL") {
        // A week-off conversion is tagged; anything else an admin credits is manual.
        if (a.kind === "sunday-credit") flSources.weekOff += days;
        else flSources.manual += days;
      }
    } else {
      const used = -days;
      buckets[bucket].debited += used;
      const m = monthOf(a.date?.seconds);
      if (m !== null) buckets[bucket].monthly[m] += used;
    }
  }

  // ── Roll up ──────────────────────────────────────────────────────────
  for (const key of LEAVE_BUCKETS) {
    const b = buckets[key];
    b.credited = round(b.credited);
    b.debited = round(b.debited);
    b.fromRequests = round(b.fromRequests);
    b.entitled = round(b.quota + b.credited);
    b.used = round(b.fromRequests + b.debited);
    const raw = round(b.entitled - b.used);
    b.balance = allowNegative ? raw : Math.max(0, raw);
    b.monthly = b.monthly.map(round);
  }

  // ── Week-off duty ────────────────────────────────────────────────────
  const sundays = zeroSundays();
  for (const d of sundayDuties ?? []) {
    if (d.year !== year) continue;
    if (d.status === "rejected") continue;
    sundays.worked += 1;
    if (d.status === "converted") {
      sundays.converted += 1;
      sundays.creditedDays += typeof d.creditDays === "number" ? d.creditDays : 1;
    } else {
      sundays.pending += 1;
    }
  }
  sundays.creditedDays = round(sundays.creditedDays);
  overtime.hours = round(overtime.hours);
  overtime.daysEarned = round(overtime.daysEarned);
  flSources.overtime = round(flSources.overtime);
  flSources.weekOff = round(flSources.weekOff);
  flSources.manual = round(flSources.manual);

  const monthly = new Array(12).fill(0);
  for (const key of LEAVE_BUCKETS) {
    for (let m = 0; m < 12; m++) monthly[m] = round(monthly[m] + buckets[key].monthly[m]);
  }

  return {
    year,
    cl: buckets.CL,
    ml: buckets.ML,
    el: buckets.EL,
    fl: buckets.FL,
    hd: round(hd),
    lop: round(lop),
    sundays,
    overtime,
    flSources,
    monthly,
    totalDays: round(monthly.reduce((a, b) => a + b, 0)),
    allowNegative,
  };
}

/** An empty ledger for a staff member with no records yet (table placeholders). */
export function emptyLedger(quota: LeaveQuota, year: number, allowNegative = false): LeaveLedger {
  return computeLeaveLedger({
    requests: [],
    adjustments: [],
    sundayDuties: [],
    quota,
    year,
    allowNegative,
  });
}

/** Bucket accessor by code, for table rendering that iterates LEAVE_BUCKETS. */
export function ledgerBucket(ledger: LeaveLedger, bucket: LeaveBucket): BucketLedger {
  switch (bucket) {
    case "CL":
      return ledger.cl;
    case "ML":
      return ledger.ml;
    case "EL":
      return ledger.el;
    case "FL":
      return ledger.fl;
  }
}

export const MONTH_LABELS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
