"use client";

// ==================== Leave ledger data access ====================
// Loads the four inputs the pure ledger needs (approved requests, manual
// adjustments, week-off duty, on-duty attendance) and writes the two
// collections an admin edits.
// Every mutation is audited; the arithmetic itself lives in leave-ledger.ts.

import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  updateDocument,
  where,
  Timestamp,
} from "@/lib/firestore";
import { logAudit } from "@/lib/audit";
import { getAppSettings, dateKey, isNonWorkingDay, type AppSettings } from "@/lib/settings";
import {
  allowsNegativeBalance,
  bucketForLeaveType,
  computeLeaveLedger,
  consumesLeaveBalance,
  countsAsWeekOffDuty,
  onDutyMonthsFromAttendance,
  resolveQuota,
  weekOffDutyKey,
  type LeaveLedger,
  type LeavePolicyConfig,
} from "@/lib/leave-ledger";
import {
  coveredDayKey,
  planAttendanceReconcile,
  requestDayKeys,
  type ReconcileEntry,
} from "@/lib/leave-attendance-sync";
import type {
  Attendance,
  AuthUser,
  FlexWallet,
  LeaveAdjustment,
  LeaveAdjustmentKind,
  LeaveBucket,
  LeaveQuota,
  Staff,
  StaffRequest,
  SundayDuty,
} from "@/types";

export const ADJUSTMENTS_COLLECTION = "leave_adjustments";
export const SUNDAY_DUTIES_COLLECTION = "sunday_duties";
const REQUESTS_COLLECTION = "leaveRequests";

export const ADJUSTMENT_KIND_LABELS: Record<LeaveAdjustmentKind, string> = {
  opening: "Opening balance",
  grant: "Granted days",
  "sunday-credit": "Week-off duty credit",
  correction: "Correction",
  deduction: "Deduction",
  attendance: "Marked on attendance",
};

/**
 * The same six kinds said the way the office says them. The short labels above
 * still title the history rows, where the surrounding line already supplies the
 * sign and the date; these are for the form, where the admin has to pick one
 * cold and "Deduction" does not tell them whether the balance goes up or down.
 */
export const ADJUSTMENT_REASON_LABELS: Record<LeaveAdjustmentKind, string> = {
  opening: "Carried from last year",
  grant: "Extra days given",
  "sunday-credit": "Earned by working a week-off",
  correction: "Fixing a mistake",
  deduction: "Leave not logged yet",
  attendance: "Marked as leave on the attendance register",
};

/**
 * Which reasons an admin may pick by hand, split by what the entry does to the
 * balance. The sign is the admin's choice, not the kind's — which is why
 * `correction` appears under both, and why the two system kinds appear under
 * neither: `sunday-credit` belongs to the week-off conversion and `attendance`
 * to the reconciler, which finds its own rows again by `sourceAttendanceId`.
 * Hand-posting either kind puts a row in the way of a job that owns it.
 */
export const ADJUSTMENT_REASONS: Record<"credit" | "debit", LeaveAdjustmentKind[]> = {
  credit: ["opening", "grant", "correction"],
  debit: ["deduction", "correction"],
};

/** Local midnight for a date, so day keys never drift by a timezone hour. */
function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function yearRange(year: number): { start: Timestamp; end: Timestamp } {
  return {
    start: Timestamp.fromDate(new Date(year, 0, 1, 0, 0, 0, 0)),
    end: Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59, 999)),
  };
}

// ==================== Reads ====================

/**
 * On-duty attendance for a year, scoped to the staff asked for. Filtering on
 * the status server-side keeps this to the OD rows alone — a year of every
 * attendance record for a page of staff would be thousands of documents for a
 * column that only ever shows a count.
 */
async function getOnDutyAttendance(
  year: number,
  scope: { staffId?: string; staffIds?: string[] }
): Promise<Attendance[]> {
  const { start, end } = yearRange(year);
  const constraints = [
    where("status", "==", "on-duty"),
    where("date", ">=", start),
    where("date", "<=", end),
  ];
  if (scope.staffId) constraints.push(where("staffId", "==", scope.staffId));
  else if (scope.staffIds) {
    if (scope.staffIds.length === 0) return [];
    constraints.push(where("staffId", "in", scope.staffIds));
  }
  return getDocuments<Attendance>("attendance", constraints);
}

export async function getLeaveAdjustments(staffId: string, year: number): Promise<LeaveAdjustment[]> {
  return getDocuments<LeaveAdjustment>(ADJUSTMENTS_COLLECTION, [
    where("staffId", "==", staffId),
    where("year", "==", year),
  ]);
}

export async function getSundayDuties(staffId: string, year: number): Promise<SundayDuty[]> {
  return getDocuments<SundayDuty>(SUNDAY_DUTIES_COLLECTION, [
    where("staffId", "==", staffId),
    where("year", "==", year),
  ]);
}

export interface StaffLedgerBundle {
  ledger: LeaveLedger;
  quota: LeaveQuota;
  adjustments: LeaveAdjustment[];
  sundayDuties: SundayDuty[];
  requests: StaffRequest[];
}

/**
 * One staff member's full ledger for a year. Used by the staff profile tab and
 * the staff portal, which is why both always agree on the number.
 */
export async function loadStaffLedger(
  staffId: string,
  year: number,
  opts?: { staff?: Staff | null; settings?: AppSettings }
): Promise<StaffLedgerBundle> {
  const [settings, staff, requests, adjustments, sundayDuties, onDutyRecords] = await Promise.all([
    opts?.settings ? Promise.resolve(opts.settings) : getAppSettings(),
    opts?.staff !== undefined ? Promise.resolve(opts.staff) : getDocument<Staff>("staff", staffId),
    getDocuments<StaffRequest>(REQUESTS_COLLECTION, [
      where("staffId", "==", staffId),
      where("status", "==", "approved"),
    ]),
    getLeaveAdjustments(staffId, year),
    getSundayDuties(staffId, year),
    getOnDutyAttendance(year, { staffId }),
  ]);

  const policy = settings.leavePolicy as LeavePolicyConfig;
  const quota = resolveQuota(staff, policy);
  const ledger = computeLeaveLedger({
    requests,
    adjustments,
    sundayDuties,
    onDutyDays: onDutyMonthsFromAttendance(onDutyRecords, year),
    quota,
    year,
    allowNegative: allowsNegativeBalance(staff, policy),
    fullDayHours: settings.attendanceRules?.fullDayHours,
  });
  return { ledger, quota, adjustments, sundayDuties, requests };
}

export interface OrgLedgerRow {
  staff: Staff;
  ledger: LeaveLedger;
  quota: LeaveQuota;
}

/**
 * Ledgers for many staff in one pass — five collection reads total rather than
 * five per person. The reads are scoped to the ids passed in, so a paginated
 * page of 20 staff never drags the whole org's request history over the wire.
 */
export async function loadOrgLedgers(staffList: Staff[], year: number): Promise<Record<string, OrgLedgerRow>> {
  const ids = staffList.map((s) => s.id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return {};
  const forThesePeople = [where("staffId", "in", ids)];

  const [settings, requests, adjustments, duties, onDutyRecords] = await Promise.all([
    getAppSettings(),
    getDocuments<StaffRequest>(REQUESTS_COLLECTION, [
      ...forThesePeople,
      where("status", "==", "approved"),
    ]),
    getDocuments<LeaveAdjustment>(ADJUSTMENTS_COLLECTION, [
      ...forThesePeople,
      where("year", "==", year),
    ]),
    getDocuments<SundayDuty>(SUNDAY_DUTIES_COLLECTION, [
      ...forThesePeople,
      where("year", "==", year),
    ]),
    getOnDutyAttendance(year, { staffIds: ids }),
  ]);

  const byStaff = <T extends { staffId: string }>(rows: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const list = map.get(r.staffId);
      if (list) list.push(r);
      else map.set(r.staffId, [r]);
    }
    return map;
  };

  const reqMap = byStaff(requests);
  const adjMap = byStaff(adjustments);
  const dutyMap = byStaff(duties);
  const odMap = byStaff(onDutyRecords);
  const policy = settings.leavePolicy as LeavePolicyConfig;

  const out: Record<string, OrgLedgerRow> = {};
  for (const staff of staffList) {
    const id = staff.id;
    if (!id) continue;
    const quota = resolveQuota(staff, policy);
    out[id] = {
      staff,
      quota,
      ledger: computeLeaveLedger({
        requests: reqMap.get(id) ?? [],
        adjustments: adjMap.get(id) ?? [],
        sundayDuties: dutyMap.get(id) ?? [],
        onDutyDays: onDutyMonthsFromAttendance(odMap.get(id) ?? [], year),
        quota,
        year,
        allowNegative: allowsNegativeBalance(staff, policy),
        fullDayHours: settings.attendanceRules?.fullDayHours,
      }),
    };
  }
  return out;
}

// ==================== Adjustments ====================

export interface CreateAdjustmentInput {
  staff: Pick<Staff, "id" | "firstName" | "lastName" | "departmentId">;
  year: number;
  bucket: LeaveBucket;
  kind: LeaveAdjustmentKind;
  /** Signed days: positive credits the balance, negative consumes it. */
  days: number;
  /** "YYYY-MM-DD"; defaults to today. */
  date?: string;
  reason: string;
  sundayDutyId?: string;
  /** FL bucket only: which wallet this moves (see FlexWallet). */
  wallet?: FlexWallet;
}

export async function createLeaveAdjustment(
  input: CreateAdjustmentInput,
  user: AuthUser | null
): Promise<string> {
  if (!input.staff.id) throw new Error("Missing staff record");
  if (!Number.isFinite(input.days) || input.days === 0) {
    throw new Error("Enter a non-zero number of days");
  }
  if (!input.reason.trim()) throw new Error("A reason is required");

  const when = input.date ? new Date(`${input.date}T00:00:00`) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error("Please select a valid date");

  const doc: Omit<LeaveAdjustment, "id"> = {
    staffId: input.staff.id,
    staffName: `${input.staff.firstName} ${input.staff.lastName}`.trim(),
    departmentId: input.staff.departmentId,
    year: input.year,
    bucket: input.bucket,
    kind: input.kind,
    days: input.days,
    date: Timestamp.fromDate(atMidnight(when)),
    reason: input.reason.trim(),
    ...(input.sundayDutyId ? { sundayDutyId: input.sundayDutyId } : {}),
    ...(input.bucket === "FL" && input.wallet ? { wallet: input.wallet } : {}),
    createdBy: user?.staffId,
    createdByName: user ? `${user.firstName} ${user.lastName}` : undefined,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const id = await createDocument(ADJUSTMENTS_COLLECTION, doc as unknown as Record<string, unknown>);
  await logAudit(
    "create",
    "leaves",
    "leave_adjustment",
    id,
    `${input.days > 0 ? "Credited" : "Deducted"} ${Math.abs(input.days)} ${input.bucket} day(s) for ${doc.staffName}: ${doc.reason}`,
    user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null,
    { newData: { bucket: input.bucket, days: input.days, year: input.year } }
  );
  return id;
}

/**
 * Removes an adjustment. Deleting is the correction path for a row entered by
 * mistake; a row that was genuinely applied should be offset with its negation
 * instead, so the history still explains the balance.
 */
export async function deleteLeaveAdjustment(
  adjustment: LeaveAdjustment,
  user: AuthUser | null
): Promise<void> {
  if (!adjustment.id) throw new Error("Missing adjustment record");
  await deleteDocument(ADJUSTMENTS_COLLECTION, adjustment.id);
  if (adjustment.sundayDutyId) {
    // Re-open the week-off day so it can be converted again.
    await updateDocument(SUNDAY_DUTIES_COLLECTION, adjustment.sundayDutyId, {
      status: "pending",
      adjustmentId: null,
      creditDays: null,
      updatedAt: Timestamp.now(),
    });
  }
  await logAudit(
    "delete",
    "leaves",
    "leave_adjustment",
    adjustment.id,
    `Removed ${adjustment.days} ${adjustment.bucket} day adjustment for ${adjustment.staffName ?? adjustment.staffId}`,
    user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null,
    { previousData: { bucket: adjustment.bucket, days: adjustment.days } }
  );
}

/** Writes a per-staff quota override onto the staff document. */
export async function saveLeaveQuotaOverride(
  staff: Staff,
  quota: Partial<LeaveQuota>,
  user: AuthUser | null
): Promise<void> {
  if (!staff.id) throw new Error("Missing staff record");
  // An empty override object means "follow the category default" — store null
  // rather than {} so resolveQuota's fallback ladder stays predictable.
  const clean: Partial<LeaveQuota> = {};
  for (const key of ["casualLeave", "sickLeave", "earnedLeave"] as const) {
    const v = quota[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[key] = v;
  }
  const value = Object.keys(clean).length > 0 ? clean : null;
  await updateDocument("staff", staff.id, { leaveQuota: value, updatedAt: Timestamp.now() });
  await logAudit(
    "update",
    "leaves",
    "staff",
    staff.id,
    value
      ? `Set leave quota override for ${staff.firstName} ${staff.lastName}`
      : `Cleared leave quota override for ${staff.firstName} ${staff.lastName}`,
    user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null,
    { previousData: { leaveQuota: staff.leaveQuota ?? null }, newData: { leaveQuota: value } }
  );
}

// ==================== Week-off duty ====================

/**
 * Week-off duty detection starts here, not at the start of the year.
 *
 * January to August 2026 came in from the attendance sheet, and that sheet's
 * flexible leave was migrated as an opening credit — it had to be, because the
 * grids stop marking worked holidays (`HW`) after May even though FL keeps being
 * taken, so the days cannot be counted. Scanning those months would raise a
 * hundred pending duties for the same period and credit the same FL a second
 * time the moment an admin converted them. From September the ERP earns FL the
 * ordinary way, off its own register.
 */
export const WEEK_OFF_SCAN_START = new Date(2026, 8, 1);

export interface DetectSundayDutiesInput {
  staffList: Staff[];
  year: number;
  /** Restrict detection to one staff member. */
  staffId?: string;
}

export interface DetectSundayDutiesResult {
  scanned: number;
  created: number;
  alreadyKnown: number;
}

/**
 * Turns attendance on a non-working day into pending week-off duty rows.
 * Idempotent by staff + day, so re-running after another biometric import
 * never double-counts a Sunday.
 */
export async function detectSundayDuties(
  { staffList, year, staffId }: DetectSundayDutiesInput,
  user: AuthUser | null
): Promise<DetectSundayDutiesResult> {
  const settings = await getAppSettings();
  const { start, end } = yearRange(year);

  const constraints = [where("date", ">=", start), where("date", "<=", end)];
  if (staffId) constraints.push(where("staffId", "==", staffId));
  const [attendance, existing] = await Promise.all([
    getDocuments<Attendance>("attendance", constraints),
    getDocuments<SundayDuty>(
      SUNDAY_DUTIES_COLLECTION,
      staffId ? [where("year", "==", year), where("staffId", "==", staffId)] : [where("year", "==", year)]
    ),
  ]);

  const staffById = new Map(staffList.filter((s) => s.id).map((s) => [s.id!, s]));
  const known = new Set(
    existing.map((d) => weekOffDutyKey(d.staffId, dateKey(new Date((d.date?.seconds ?? 0) * 1000))))
  );

  let scanned = 0;
  let created = 0;
  let alreadyKnown = 0;

  for (const record of attendance) {
    const staff = staffById.get(record.staffId);
    if (!staff) continue;

    const day = atMidnight(new Date((record.date?.seconds ?? 0) * 1000));
    if (Number.isNaN(day.getTime()) || day.getFullYear() !== year) continue;
    if (day < WEEK_OFF_SCAN_START) continue; // migrated months: FL came in as an opening credit

    if (!countsAsWeekOffDuty(record, isNonWorkingDay(settings, day, staff.companyId))) continue;

    scanned++;
    const key = weekOffDutyKey(record.staffId, dateKey(day));
    if (known.has(key)) {
      alreadyKnown++;
      continue;
    }
    known.add(key);

    const doc: Omit<SundayDuty, "id"> = {
      staffId: record.staffId,
      staffName: `${staff.firstName} ${staff.lastName}`.trim(),
      departmentId: staff.departmentId,
      date: Timestamp.fromDate(day),
      year,
      source: "attendance",
      attendanceStatus: record.status,
      workingHours: record.workingHours,
      attendanceId: record.id,
      status: "pending",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await createDocument(SUNDAY_DUTIES_COLLECTION, doc as unknown as Record<string, unknown>);
    created++;
  }

  if (created > 0) {
    await logAudit(
      "create",
      "leaves",
      "sunday_duty",
      `${year}`,
      `Detected ${created} week-off duty day(s) for ${year}`,
      user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
    );
  }
  return { scanned, created, alreadyKnown };
}

export interface ReconcileAttendanceLeaveInput {
  staffList: Staff[];
  year: number;
  staffId?: string;
}

export interface ReconcileAttendanceLeaveResult {
  /** Leave days found on the register that no request accounts for. */
  scanned: number;
  created: number;
  updated: number;
  removed: number;
  /**
   * Days an approved request covers but which the register marks as a different
   * bucket. Nothing is posted for them — the request already counted the day —
   * but the disagreement is real and somebody should look at it.
   */
  mismatched: number;
}

/**
 * Brings the ledger in line with leave marked straight onto the attendance
 * register.
 *
 * A day marked CL on the grid is a day consumed, but only an approved request
 * or an adjustment moves a balance — so without this the grid and the balance
 * sheet drift apart, which is exactly what they had been doing. Each debit is
 * posted as an ordinary adjustment carrying the id of the day that caused it,
 * so it shows up in the staff member's history, can be reversed, and is found
 * again rather than duplicated on the next run.
 *
 * Days already stamped with a leaveRequestId are skipped: the request consumed
 * them once already.
 */
export async function reconcileAttendanceLeave(
  { staffList, year, staffId }: ReconcileAttendanceLeaveInput,
  user: AuthUser | null
): Promise<ReconcileAttendanceLeaveResult> {
  const { start, end } = yearRange(year);

  const attendanceConstraints = [where("date", ">=", start), where("date", "<=", end)];
  if (staffId) attendanceConstraints.push(where("staffId", "==", staffId));

  const adjustmentConstraints = [where("year", "==", year)];
  if (staffId) adjustmentConstraints.push(where("staffId", "==", staffId));

  const requestConstraints = [where("status", "==", "approved")];
  if (staffId) requestConstraints.push(where("staffId", "==", staffId));

  const [attendance, adjustments, approved] = await Promise.all([
    getDocuments<Attendance>("attendance", attendanceConstraints),
    getDocuments<LeaveAdjustment>(ADJUSTMENTS_COLLECTION, adjustmentConstraints),
    getDocuments<StaffRequest>(REQUESTS_COLLECTION, requestConstraints),
  ]);

  // Every day an approved request already accounts for. The leaveRequestId
  // stamp only covers days this app wrote, so requests approved before the
  // writeback existed are matched on staff and date instead — without which
  // their days read as unaccounted for and get deducted a second time.
  const coveredDays = new Set<string>();
  for (const request of approved) {
    if (!consumesLeaveBalance(request.type)) continue;
    if (!bucketForLeaveType(request.leaveType)) continue;
    for (const dayKey of requestDayKeys(request)) {
      coveredDays.add(coveredDayKey(request.staffId, dayKey));
    }
  }

  const staffById = new Map(staffList.filter((st) => st.id).map((st) => [st.id!, st]));
  const rows = attendance.filter((r) => staffById.has(r.staffId));
  const plan = planAttendanceReconcile({ rows, adjustments, coveredDays });

  const docFor = (entry: ReconcileEntry): Omit<LeaveAdjustment, "id"> => {
    const staff = staffById.get(entry.staffId);
    return {
      staffId: entry.staffId,
      staffName: staff ? `${staff.firstName} ${staff.lastName}`.trim() : undefined,
      departmentId: staff?.departmentId,
      year: entry.year,
      bucket: entry.bucket,
      kind: "attendance",
      days: entry.days,
      date: Timestamp.fromDate(atMidnight(new Date(`${entry.dayKey}T00:00:00`))),
      reason: `${entry.bucket} marked on the attendance register for ${entry.dayKey}`,
      sourceAttendanceId: entry.attendanceId,
      createdBy: user?.staffId,
      createdByName: user ? `${user.firstName} ${user.lastName}` : undefined,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  };

  for (const entry of plan.create) {
    await createDocument(ADJUSTMENTS_COLLECTION, docFor(entry) as unknown as Record<string, unknown>);
  }
  for (const { adjustmentId, entry } of plan.update) {
    await updateDocument(ADJUSTMENTS_COLLECTION, adjustmentId, {
      bucket: entry.bucket,
      days: entry.days,
      reason: `${entry.bucket} marked on the attendance register for ${entry.dayKey}`,
      updatedAt: Timestamp.now(),
    });
  }
  for (const adjustmentId of plan.remove) {
    await deleteDocument(ADJUSTMENTS_COLLECTION, adjustmentId);
  }

  const touched = plan.create.length + plan.update.length + plan.remove.length;
  if (touched > 0) {
    await logAudit(
      "update",
      "leaves",
      "leave_adjustment",
      `${year}`,
      `Reconciled attendance leave for ${year}: ${plan.create.length} posted, ${plan.update.length} corrected, ${plan.remove.length} withdrawn`,
      user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
    );
  }

  return {
    scanned: plan.create.length + plan.update.length,
    created: plan.create.length,
    updated: plan.update.length,
    removed: plan.remove.length,
    mismatched: plan.mismatches.length,
  };
}

export interface ReconcileDayResult {
  /** The bucket the day now draws on, or null when it is not leave. */
  bucket: LeaveBucket | null;
  posted: boolean;
  withdrawn: boolean;
  /** An approved request already accounts for the day, so nothing was posted. */
  coveredByRequest: boolean;
}

/**
 * Reconciles a single day, for the moment an admin edits it on the register.
 *
 * The year-wide reconcile exists for imports and backfills; this is what makes
 * a hand edit feel like one action rather than two, so nobody has to remember a
 * button for the balance to be right. It is deliberately narrow — one person,
 * one day — so an edit can never move more than the day it was about.
 *
 * Idempotent, like the wider one: marking the same day twice posts one debit,
 * and changing the day back to Present withdraws it again.
 */
export async function reconcileAttendanceDay(
  input: {
    staff: Staff;
    attendanceId: string;
    date: Date;
    status: Attendance["status"];
    leaveRequestId?: string;
  },
  user: AuthUser | null
): Promise<ReconcileDayResult> {
  const { staff, attendanceId, date, status, leaveRequestId } = input;
  if (!staff.id) return { bucket: null, posted: false, withdrawn: false, coveredByRequest: false };

  const year = date.getFullYear();
  const [adjustments, approved] = await Promise.all([
    getDocuments<LeaveAdjustment>(ADJUSTMENTS_COLLECTION, [
      where("staffId", "==", staff.id),
      where("year", "==", year),
    ]),
    getDocuments<StaffRequest>(REQUESTS_COLLECTION, [
      where("staffId", "==", staff.id),
      where("status", "==", "approved"),
    ]),
  ]);

  const coveredDays = new Set<string>();
  for (const request of approved) {
    if (!consumesLeaveBalance(request.type)) continue;
    if (!bucketForLeaveType(request.leaveType)) continue;
    for (const dayKey of requestDayKeys(request)) {
      coveredDays.add(coveredDayKey(staff.id, dayKey));
    }
  }

  // Only this day's adjustment is in scope. Passing the rest would read every
  // other day as "source row missing" and withdraw the lot.
  const mine = adjustments.filter((a) => a.sourceAttendanceId === attendanceId);
  const plan = planAttendanceReconcile({
    rows: [
      {
        id: attendanceId,
        staffId: staff.id,
        date: Timestamp.fromDate(atMidnight(date)),
        status,
        ...(leaveRequestId ? { leaveRequestId } : {}),
      } as Attendance,
    ],
    adjustments: mine,
    coveredDays,
  });

  for (const entry of plan.create) {
    await createDocument(
      ADJUSTMENTS_COLLECTION,
      {
        staffId: entry.staffId,
        staffName: `${staff.firstName} ${staff.lastName}`.trim(),
        departmentId: staff.departmentId,
        year: entry.year,
        bucket: entry.bucket,
        kind: "attendance",
        days: entry.days,
        date: Timestamp.fromDate(atMidnight(new Date(`${entry.dayKey}T00:00:00`))),
        reason: `${entry.bucket} marked on the attendance register for ${entry.dayKey}`,
        sourceAttendanceId: entry.attendanceId,
        createdBy: user?.staffId,
        createdByName: user ? `${user.firstName} ${user.lastName}` : undefined,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as unknown as Record<string, unknown>
    );
  }
  for (const { adjustmentId, entry } of plan.update) {
    await updateDocument(ADJUSTMENTS_COLLECTION, adjustmentId, {
      bucket: entry.bucket,
      days: entry.days,
      reason: `${entry.bucket} marked on the attendance register for ${entry.dayKey}`,
      updatedAt: Timestamp.now(),
    });
  }
  for (const adjustmentId of plan.remove) {
    await deleteDocument(ADJUSTMENTS_COLLECTION, adjustmentId);
  }

  return {
    bucket: plan.create[0]?.bucket ?? plan.update[0]?.entry.bucket ?? plan.mismatches[0]?.bucket ?? null,
    posted: plan.create.length > 0 || plan.update.length > 0,
    withdrawn: plan.remove.length > 0,
    coveredByRequest: plan.mismatches.length > 0,
  };
}

/** Adds a week-off duty day by hand, for a day attendance never captured. */
export async function addManualSundayDuty(
  input: { staff: Staff; date: string; remarks?: string },
  user: AuthUser | null
): Promise<string> {
  if (!input.staff.id) throw new Error("Missing staff record");
  const day = atMidnight(new Date(`${input.date}T00:00:00`));
  if (Number.isNaN(day.getTime())) throw new Error("Please select a valid date");

  const duplicate = await getDocuments<SundayDuty>(SUNDAY_DUTIES_COLLECTION, [
    where("staffId", "==", input.staff.id),
    where("date", "==", Timestamp.fromDate(day)),
  ]);
  if (duplicate.length > 0) throw new Error("That day is already recorded as week-off duty");

  const doc: Omit<SundayDuty, "id"> = {
    staffId: input.staff.id,
    staffName: `${input.staff.firstName} ${input.staff.lastName}`.trim(),
    departmentId: input.staff.departmentId,
    date: Timestamp.fromDate(day),
    year: day.getFullYear(),
    source: "manual",
    status: "pending",
    remarks: input.remarks?.trim() || undefined,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const id = await createDocument(SUNDAY_DUTIES_COLLECTION, doc as unknown as Record<string, unknown>);
  await logAudit(
    "create",
    "leaves",
    "sunday_duty",
    id,
    `Recorded week-off duty on ${input.date} for ${doc.staffName}`,
    user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
  );
  return id;
}

/**
 * Converts one week-off day into flexible leave: writes the FL credit and links
 * it back to the duty. Refuses an already-converted day so a double click can
 * never double-credit.
 */
export async function convertSundayDuty(
  input: { duty: SundayDuty; staff: Staff; creditDays?: number; remarks?: string },
  user: AuthUser | null
): Promise<string> {
  const { duty, staff } = input;
  if (!duty.id) throw new Error("Missing week-off duty record");
  if (duty.status === "converted") throw new Error("This day is already converted to flexible leave");

  const creditDays = input.creditDays ?? 1;
  if (!Number.isFinite(creditDays) || creditDays <= 0) throw new Error("Credit must be more than zero days");

  const dutyDate = new Date((duty.date?.seconds ?? 0) * 1000);
  const adjustmentId = await createLeaveAdjustment(
    {
      staff,
      year: duty.year,
      bucket: "FL",
      kind: "sunday-credit",
      days: creditDays,
      date: dateKey(atMidnight(dutyDate)),
      reason: input.remarks?.trim() || `Week-off duty on ${dateKey(atMidnight(dutyDate))}`,
      sundayDutyId: duty.id,
    },
    user
  );

  await updateDocument(SUNDAY_DUTIES_COLLECTION, duty.id, {
    status: "converted",
    creditDays,
    adjustmentId,
    remarks: input.remarks?.trim() || duty.remarks || null,
    reviewedBy: user?.staffId ?? null,
    reviewedByName: user ? `${user.firstName} ${user.lastName}` : null,
    reviewedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return adjustmentId;
}

/** Marks a detected week-off day as not eligible for flexible leave. */
export async function rejectSundayDuty(
  input: { duty: SundayDuty; remarks?: string },
  user: AuthUser | null
): Promise<void> {
  const { duty } = input;
  if (!duty.id) throw new Error("Missing week-off duty record");
  if (duty.status === "converted") {
    throw new Error("Remove the flexible-leave credit before rejecting this day");
  }
  await updateDocument(SUNDAY_DUTIES_COLLECTION, duty.id, {
    status: "rejected",
    remarks: input.remarks?.trim() || duty.remarks || null,
    reviewedBy: user?.staffId ?? null,
    reviewedByName: user ? `${user.firstName} ${user.lastName}` : null,
    reviewedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await logAudit(
    "update",
    "leaves",
    "sunday_duty",
    duty.id,
    `Rejected week-off duty for ${duty.staffName ?? duty.staffId}`,
    user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
  );
}

/** Puts a rejected week-off day back in the queue. */
export async function reopenSundayDuty(duty: SundayDuty, user: AuthUser | null): Promise<void> {
  if (!duty.id) throw new Error("Missing week-off duty record");
  await updateDocument(SUNDAY_DUTIES_COLLECTION, duty.id, {
    status: "pending",
    reviewedBy: user?.staffId ?? null,
    reviewedByName: user ? `${user.firstName} ${user.lastName}` : null,
    reviewedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}
