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
  computeLeaveLedger,
  countsAsWeekOffDuty,
  onDutyMonthsFromAttendance,
  resolveQuota,
  weekOffDutyKey,
  type LeaveLedger,
  type LeavePolicyConfig,
} from "@/lib/leave-ledger";
import type {
  Attendance,
  AuthUser,
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
