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
  Attendance,
  AttendanceStatus,
  EmploymentType,
  FlexWallet,
  LeaveAdjustment,
  LeaveBucket,
  LeaveQuota,
  LeaveType,
  Staff,
  StaffRequest,
  StaffRequestType,
  SundayDuty,
} from "@/types";

/**
 * Buckets that carry a balance, in the printed sheet's column order. HD and LOP
 * are counters, not buckets.
 */
export const LEAVE_BUCKETS: LeaveBucket[] = ["CL", "EL", "ML", "FL"];

export const LEAVE_BUCKET_LABELS: Record<LeaveBucket, string> = {
  CL: "Casual Leave",
  ML: "Medical Leave",
  EL: "Earned Leave",
  FL: "Flexible Leave",
};

/**
 * Request types that draw down a leave balance. Long leave is ordinary leave
 * over a longer range — it consumes the same buckets and follows the same
 * dept-head then admin approval. Anything reading "days of leave" off a request
 * must ask here, so the ledger, the request form and the staff dashboard cannot
 * disagree about whether a long leave counts.
 */
export function consumesLeaveBalance(type?: StaffRequestType | string | null): boolean {
  return type === "leave" || type === "long-leave";
}

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

/** The working-day length overtime converts at; anything unusable falls back to 8h. */
export function overtimeDayLength(fullDayHours?: number): number {
  return typeof fullDayHours === "number" && Number.isFinite(fullDayHours) && fullDayHours > 0
    ? fullDayHours
    : 8;
}

/**
 * One overtime request's exact share of a working day (display only). Credit is
 * never floored per request: 6h + 6h + 6h is 18h, which is 2 days, whereas
 * flooring each request to a half day paid out 1.5 and silently lost 6 hours.
 */
export function overtimeCompOffDays(
  req: Pick<StaffRequest, "startTime" | "endTime">,
  fullDayHours?: number
): number {
  return Math.round((overtimeHours(req) / overtimeDayLength(fullDayHours)) * 100) / 100;
}

/**
 * Leave days credited for a year's accumulated overtime hours: every
 * `fullDayHours` (the org's working day, `settings.attendanceRules`) is one day,
 * credited in half-day steps because leave is taken in half days. The remainder
 * carries until it makes up the next half day.
 */
export function overtimeDaysFromHours(hours: number, fullDayHours?: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  // Rounded before flooring so 17.999… from summed minutes still reads as 18h.
  const halfDays = Math.round(((hours / overtimeDayLength(fullDayHours)) * 2) * 1e6) / 1e6;
  return Math.floor(halfDays) / 2;
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

// ==================== On duty ====================

/**
 * Jan..Dec on-duty days for one staff member, from their attendance records.
 * Counted per calendar day, not per record, so a day imported twice by the
 * biometric sync is still one OD — the same rule the printed sheet follows,
 * where a day carries one mark. Legacy statuses fold first; none of them mean
 * on duty, so only a real OD record counts.
 */
export function onDutyMonthsFromAttendance(
  records: Pick<Attendance, "date" | "status" | "isDeleted">[] | null | undefined,
  year: number
): number[] {
  const months = new Array(12).fill(0);
  const seen = new Set<string>();
  for (const r of records ?? []) {
    if (!r || r.isDeleted || !r.status) continue;
    if (normalizeAttendanceStatus(r.status) !== "on-duty") continue;
    const seconds = r.date?.seconds;
    if (!Number.isFinite(seconds) || !seconds) continue;
    const day = new Date(seconds * 1000);
    if (day.getFullYear() !== year) continue;
    const key = `${day.getMonth()}-${day.getDate()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    months[day.getMonth()] += 1;
  }
  return months;
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

/** The three groups the printed sheet splits staff into. */
export type EmploymentGroup = "PERMANENT" | "CONTRACT" | "INTERNS";

export interface EmploymentGroupSection<T> {
  title: EmploymentGroup;
  rows: T[];
}

/** Which sheet heading an employment type sits under. */
const GROUP_FOR_TYPE: Record<EmploymentType, EmploymentGroup> = {
  permanent: "PERMANENT",
  staff: "CONTRACT",
  intern: "INTERNS",
};

const GROUP_ORDER: EmploymentGroup[] = ["PERMANENT", "CONTRACT", "INTERNS"];

/**
 * Splits rows into the sheet's PERMANENT, CONTRACT and INTERNS groups. The
 * group is derived from the staff record, never a stored flag, so a legacy row
 * with no employment type still lands where employmentTypeOf() says it belongs.
 * Empty groups are dropped so a page of only interns shows one heading, not three.
 */
export function groupByEmployment<T extends { staff: QuotaStaff }>(
  rows: T[]
): EmploymentGroupSection<T>[] {
  const out: EmploymentGroupSection<T>[] = [];
  for (const title of GROUP_ORDER) {
    const group = rows.filter((r) => GROUP_FOR_TYPE[employmentTypeOf(r.staff)] === title);
    if (group.length) out.push({ title, rows: group });
  }
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
  /** Flexible-leave days those hours earned, in half-day steps. */
  daysEarned: number;
  /** Hours not yet converted: short of the next half day, carried forward. */
  carryHours: number;
  /** The working-day length the hours were converted at. */
  fullDayHours: number;
}

/** One wallet inside the FL bucket. */
export interface WalletLedger {
  earned: number;
  used: number;
  /** earned - used. Floored at 0 unless negatives are allowed. */
  balance: number;
}

/**
 * The FL bucket split by where the days came from: FL = Sunday/holiday duty
 * (and admin grants), OT = approved overtime. They sum to the bucket.
 */
export interface FlexWallets {
  fl: WalletLedger;
  ot: WalletLedger;
}

/** Where the flexible-leave entitlement came from, so the credit is explainable. */
export interface FlexibleLeaveSources {
  overtime: number;
  weekOff: number;
  manual: number;
}

/**
 * On-duty days, the sheet's OD marks. Not a leave bucket — the person worked,
 * just off-site — so it is counted alongside the balances and never inside them.
 */
export interface OnDutySummary {
  /** OD days in the year. */
  total: number;
  /** Jan..Dec OD days, for the month-wise sheet columns. */
  monthly: number[];
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
  /** Jan..Dec days worked, so a month-scoped view can count them. */
  monthlyWorked: number[];
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
  /** On-duty days taken from attendance, shown alongside the balances. */
  onDuty: OnDutySummary;
  /** Approved overtime for the year, shown alongside the balances. */
  overtime: OvertimeSummary;
  /** Breakdown of the flexible-leave entitlement by where it was earned. */
  flSources: FlexibleLeaveSources;
  /** The FL bucket as two separately spendable balances. */
  wallets: FlexWallets;
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
  return { worked: 0, converted: 0, pending: 0, creditedDays: 0, monthlyWorked: new Array(12).fill(0) };
}

function zeroOvertime(fullDayHours = 8): OvertimeSummary {
  return { count: 0, hours: 0, daysEarned: 0, carryHours: 0, fullDayHours };
}

function zeroOnDuty(): OnDutySummary {
  return { total: 0, monthly: new Array(12).fill(0) };
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

/** The month of a timestamp, but only when it falls inside `year`. */
function monthInYear(seconds: number | undefined, year: number): number | null {
  if (!Number.isFinite(seconds) || !seconds) return null;
  const date = new Date(seconds * 1000);
  return date.getFullYear() === year ? date.getMonth() : null;
}

/**
 * Which month column a row booked against `year` belongs in.
 *
 * Every row that counts toward a yearly total has to land in some month, or
 * the month-wise split stops adding up to it and a running balance read off
 * `monthly` never reconciles with the yearly one. So the effective date is
 * preferred, the recorded date is the fallback, and January is the floor —
 * a date missing or belonging to another year loses the row a column, never
 * the whole figure.
 */
export function monthColumn(
  row: { date?: { seconds?: number } | null; createdAt?: { seconds?: number } | null },
  year: number
): number {
  return (
    monthInYear(row.date?.seconds, year) ?? monthInYear(row.createdAt?.seconds, year) ?? 0
  );
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
  /** Jan..Dec on-duty days, from onDutyMonthsFromAttendance(). Optional: a
   *  caller that has not loaded attendance gets an empty OD summary, never a
   *  wrong one. */
  onDutyDays?: number[];
  quota: LeaveQuota;
  year: number;
  allowNegative?: boolean;
  /** `settings.attendanceRules.fullDayHours`: overtime hours per leave day. Default 8. */
  fullDayHours?: number;
}

/**
 * Rolls every input into one year's ledger. Pure: same inputs, same numbers,
 * whoever is asking.
 */
export function computeLeaveLedger({
  requests,
  adjustments,
  sundayDuties,
  onDutyDays,
  quota,
  year,
  allowNegative = false,
  fullDayHours,
}: LedgerInput): LeaveLedger {
  const buckets: Record<LeaveBucket, BucketLedger> = {
    CL: emptyBucket(quota.casualLeave ?? 0),
    ML: emptyBucket(quota.sickLeave ?? 0),
    EL: emptyBucket(quota.earnedLeave ?? 0),
    FL: emptyBucket(0),
  };
  let hd = 0;
  let lop = 0;
  const overtime = zeroOvertime(overtimeDayLength(fullDayHours));
  const flSources: FlexibleLeaveSources = { overtime: 0, weekOff: 0, manual: 0 };
  // FL-bucket movements by wallet; `unassigned` is spent FL first, then OT.
  const walletEarned: Record<FlexWallet, number> = { FL: 0, OT: 0 };
  const walletUsed: Record<FlexWallet, number> = { FL: 0, OT: 0 };
  let unassignedUsed = 0;
  const spendFlex = (wallet: FlexWallet | undefined, n: number) => {
    if (wallet === "FL" || wallet === "OT") walletUsed[wallet] += n;
    else unassignedUsed += n;
  };

  // ── Approved requests ────────────────────────────────────────────────
  for (const r of requests ?? []) {
    if (r.status !== "approved") continue;

    if (r.type === "overtime") {
      // Overtime earns flexible leave in the year the overtime happened.
      if (yearOf(r.startDate?.seconds) !== year) continue;
      // Hours accumulate here; they convert to days once, after the loop.
      overtime.count += 1;
      overtime.hours += overtimeHours(r);
      continue;
    }

    if (!consumesLeaveBalance(r.type)) continue;

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
    if (bucket === "FL") spendFlex(r.leaveWallet, daysInYear);
  }

  // ── Overtime → flexible leave ────────────────────────────────────────
  // Converted once, on the year's total hours (see overtimeDaysFromHours).
  overtime.hours = round(overtime.hours);
  overtime.daysEarned = overtimeDaysFromHours(overtime.hours, overtime.fullDayHours);
  overtime.carryHours = round(overtime.hours - overtime.daysEarned * overtime.fullDayHours);
  buckets.FL.credited += overtime.daysEarned;
  flSources.overtime += overtime.daysEarned;
  walletEarned.OT += overtime.daysEarned;

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
        walletEarned[a.wallet === "OT" ? "OT" : "FL"] += days;
      }
    } else {
      const used = -days;
      buckets[bucket].debited += used;
      buckets[bucket].monthly[monthColumn(a, year)] += used;
      if (bucket === "FL") spendFlex(a.wallet, used);
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
    sundays.monthlyWorked[monthColumn(d, year)] += 1;
    if (d.status === "converted") {
      sundays.converted += 1;
      sundays.creditedDays += typeof d.creditDays === "number" ? d.creditDays : 1;
    } else {
      sundays.pending += 1;
    }
  }
  sundays.creditedDays = round(sundays.creditedDays);
  const wallets = splitFlexWallets(walletEarned, walletUsed, unassignedUsed, allowNegative);
  flSources.overtime = round(flSources.overtime);
  flSources.weekOff = round(flSources.weekOff);
  flSources.manual = round(flSources.manual);

  // ── On duty ──────────────────────────────────────────────────────────
  const onDuty = zeroOnDuty();
  for (let m = 0; m < 12; m++) {
    const v = onDutyDays?.[m];
    onDuty.monthly[m] = typeof v === "number" && Number.isFinite(v) ? round(v) : 0;
  }
  onDuty.total = round(onDuty.monthly.reduce((a, b) => a + b, 0));

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
    onDuty,
    overtime,
    flSources,
    wallets,
    monthly,
    totalDays: round(monthly.reduce((a, b) => a + b, 0)),
    allowNegative,
  };
}

/**
 * Settles the FL bucket into its two wallets. Days that named a wallet are
 * charged to it; the rest (register marks, requests filed before the split)
 * spend FL first, then OT — the rule agreed with the org — and anything beyond
 * both lands on FL, the default wallet.
 */
function splitFlexWallets(
  earned: Record<FlexWallet, number>,
  used: Record<FlexWallet, number>,
  unassigned: number,
  allowNegative: boolean
): FlexWallets {
  let flUsed = used.FL;
  let otUsed = used.OT;
  const fromFl = Math.min(unassigned, Math.max(0, earned.FL - flUsed));
  const fromOt = Math.min(unassigned - fromFl, Math.max(0, earned.OT - otUsed));
  flUsed += unassigned - fromOt;
  otUsed += fromOt;
  const wallet = (e: number, u: number): WalletLedger => {
    const raw = round(e - u);
    return { earned: round(e), used: round(u), balance: allowNegative ? raw : Math.max(0, raw) };
  };
  return { fl: wallet(earned.FL, flUsed), ot: wallet(earned.OT, otUsed) };
}

/** The wallet a flexible-leave request spends, as the ledger reads it. */
export function walletOf(ledger: LeaveLedger, wallet: FlexWallet): WalletLedger {
  return wallet === "OT" ? ledger.wallets.ot : ledger.wallets.fl;
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

/**
 * The "YYYY-MM-01" key that files an adjustment against `month` (0 = January).
 *
 * This is the hinge of the month-wise edit: the grid hands back a zero-based
 * column index, createLeaveAdjustment parses the key as a local date, and the
 * ledger reads the month back off that date. All three have to agree or an
 * edit lands in the wrong column, so the round trip is tested rather than
 * assumed.
 */
export function monthStartDateKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Trims the trailing ".0" that half-day arithmetic leaves behind. */
export function days(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
