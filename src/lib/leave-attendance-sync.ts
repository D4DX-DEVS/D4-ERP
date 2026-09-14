// ==================== Attendance ↔ leave sync planners (pure) ====================
// The Attendance register and Leave Balances describe the same days. These two
// planners are how they stay in step, and they are deliberately pure: they read
// what exists and return what should change, so every rule below is testable
// without a database in the way.
//
//   planRequestWriteback   an approved request -> the attendance days it covers
//   planAttendanceReconcile  a leave day marked on attendance -> a ledger debit
//
// The guard that keeps the two from double-counting is one field. A day written
// by a request carries its `leaveRequestId`; the reconcile skips any row that
// has one, because the request already consumed that day. Remove the stamp and
// every approved leave is deducted twice.

import { normalizeAttendanceStatus } from "@/lib/attendance-status";
import { bucketForLeaveType, consumesLeaveBalance } from "@/lib/leave-ledger";
import type {
  Attendance,
  AttendanceStatus,
  LeaveAdjustment,
  LeaveBucket,
  StaffRequest,
} from "@/types";

/** How each balance bucket appears as a day on the register. */
const STATUS_FOR_BUCKET = {
  CL: "casual-leave",
  EL: "earned-leave",
  ML: "medical-leave",
  FL: "full-leave",
} as const satisfies Record<LeaveBucket, AttendanceStatus>;

export function attendanceStatusForBucket(bucket: LeaveBucket): AttendanceStatus {
  return STATUS_FOR_BUCKET[bucket];
}

/**
 * The bucket a day draws on, or null when the day is not leave. Legacy rows fold
 * first, so a stored "leave" counts as the flexible leave the grid already
 * displays it as.
 */
export function bucketForAttendanceStatus(status: AttendanceStatus): LeaveBucket | null {
  switch (normalizeAttendanceStatus(status)) {
    case "casual-leave":
      return "CL";
    case "earned-leave":
      return "EL";
    case "medical-leave":
      return "ML";
    case "full-leave":
      return "FL";
    default:
      return null;
  }
}

/** Local "YYYY-MM-DD" for a stored timestamp — the key both sides join on. */
export function attendanceDayKey(seconds?: number): string | null {
  if (!Number.isFinite(seconds) || !seconds) return null;
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The days a request covers, as the keys both directions join on. */
export function requestDayKeys(
  request: Pick<StaffRequest, "startDate" | "endDate">
): string[] {
  return dayKeysBetween(request.startDate?.seconds, request.endDate?.seconds);
}

/** The key a covered day is looked up by. */
export function coveredDayKey(staffId: string, dayKey: string): string {
  return `${staffId}|${dayKey}`;
}

function dayKeysBetween(startSec?: number, endSec?: number): string[] {
  if (!Number.isFinite(startSec) || !startSec) return [];
  const start = new Date(startSec * 1000);
  start.setHours(0, 0, 0, 0);
  const end = new Date((Number.isFinite(endSec) && endSec ? endSec : startSec) * 1000);
  end.setHours(0, 0, 0, 0);
  if (end < start) return [];

  const keys: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = attendanceDayKey(cursor.getTime() / 1000);
    if (key) keys.push(key);
  }
  return keys;
}

// ==================== Direction A: request -> attendance ====================

export interface WritebackDay {
  dayKey: string;
  status: AttendanceStatus;
  isHalfDay: boolean;
  /**
   * What stood on the day before this request claimed it, when anything did.
   * Withdrawing the approval puts it back, so claiming a day is reversible
   * rather than a quiet loss of whatever the register already knew.
   */
  replacesStatus?: AttendanceStatus;
}

/** Why a day was left as it stood. Each one is something a person should see. */
export type WritebackConflictReason = "worked" | "other-request" | "non-working";

export interface WritebackConflict {
  dayKey: string;
  attendanceId?: string;
  existingStatus: AttendanceStatus;
  reason: WritebackConflictReason;
}

export interface RequestWritebackPlan {
  upserts: WritebackDay[];
  conflicts: WritebackConflict[];
}

type ExistingRow = Pick<Attendance, "date" | "status" | "leaveRequestId" | "isDeleted"> & {
  id?: string;
};

/** Statuses that mean the person turned up, whatever the request says. */
const WORKED: ReadonlySet<string> = new Set(["present", "half-day", "on-duty", "overtime"]);
/** Days that were never working days to begin with. */
const NON_WORKING: ReadonlySet<string> = new Set(["week-off", "public-holiday"]);

/**
 * The attendance days an approved request should own.
 *
 * An absence is overwritten — they were on approved leave, not absent. A day
 * they actually worked is not: that contradiction is a fact for someone to look
 * at, not something to erase quietly. Re-running is safe, because a day already
 * stamped with this request is rewritten rather than skipped.
 */
export function planRequestWriteback(input: {
  request: Pick<StaffRequest, "type" | "leaveType" | "startDate" | "endDate" | "isHalfDay"> & {
    id?: string;
  };
  existingRows: ExistingRow[];
}): RequestWritebackPlan {
  const { request, existingRows } = input;
  const plan: RequestWritebackPlan = { upserts: [], conflicts: [] };

  if (!consumesLeaveBalance(request.type)) return plan;
  const bucket = bucketForLeaveType(request.leaveType);
  if (!bucket) return plan; // HD and LOP are counters, not buckets

  const status = attendanceStatusForBucket(bucket);
  const byDay = new Map<string, ExistingRow>();
  for (const row of existingRows) {
    if (row.isDeleted) continue;
    const key = attendanceDayKey(row.date?.seconds);
    if (key) byDay.set(key, row);
  }

  for (const dayKey of dayKeysBetween(request.startDate?.seconds, request.endDate?.seconds)) {
    const existing = byDay.get(dayKey);
    const write = () =>
      plan.upserts.push({
        dayKey,
        status,
        isHalfDay: Boolean(request.isHalfDay),
        // Its own earlier write is not something to remember replacing.
        ...(existing && existing.leaveRequestId !== request.id
          ? { replacesStatus: existing.status }
          : {}),
      });

    if (!existing) {
      write();
      continue;
    }
    if (existing.leaveRequestId && existing.leaveRequestId !== request.id) {
      plan.conflicts.push({
        dayKey,
        attendanceId: existing.id,
        existingStatus: existing.status,
        reason: "other-request",
      });
      continue;
    }
    if (!existing.leaveRequestId) {
      const folded = normalizeAttendanceStatus(existing.status);
      if (WORKED.has(folded)) {
        plan.conflicts.push({
          dayKey,
          attendanceId: existing.id,
          existingStatus: existing.status,
          reason: "worked",
        });
        continue;
      }
      if (NON_WORKING.has(folded)) {
        plan.conflicts.push({
          dayKey,
          attendanceId: existing.id,
          existingStatus: existing.status,
          reason: "non-working",
        });
        continue;
      }
    }
    // Absent, a hand-marked leave day, or this same request being re-run.
    write();
  }

  return plan;
}

// ==================== Direction B: attendance -> ledger ====================

export interface ReconcileEntry {
  attendanceId: string;
  staffId: string;
  dayKey: string;
  year: number;
  bucket: LeaveBucket;
  /** Always a debit. One marked day is one day consumed. */
  days: number;
}

/** A day an approved request covers, but which the register marks differently. */
export interface ReconcileMismatch {
  attendanceId: string;
  staffId: string;
  dayKey: string;
  /** The bucket the register says. The request says something else. */
  bucket: LeaveBucket;
}

export interface ReconcilePlan {
  create: ReconcileEntry[];
  update: { adjustmentId: string; entry: ReconcileEntry }[];
  /** Adjustment ids whose source day no longer justifies them. */
  remove: string[];
  /** Days left alone because a request covers them, but whose bucket disagrees. */
  mismatches: ReconcileMismatch[];
}

type ReconcileRow = Pick<
  Attendance,
  "staffId" | "date" | "status" | "leaveRequestId" | "isDeleted"
> & { id?: string };

type ReconcileAdjustment = Pick<LeaveAdjustment, "bucket" | "days" | "sourceAttendanceId"> & {
  id?: string;
};

/**
 * What the ledger owes the register.
 *
 * Every leave day marked on attendance without a request behind it should carry
 * one debit, found again by `sourceAttendanceId`. That tag is what makes this
 * safe to run as often as you like: a second pass produces nothing, an edited
 * day updates its own row rather than adding a second, and a day that stopped
 * being leave takes its debit with it.
 */
export function planAttendanceReconcile(input: {
  rows: ReconcileRow[];
  adjustments: ReconcileAdjustment[];
  /**
   * Days already consumed by an approved request, keyed by coveredDayKey.
   *
   * The leaveRequestId stamp only exists on days this app wrote. Every request
   * approved before the writeback existed left its days unstamped, so without
   * this second reading those days look unaccounted for and get deducted a
   * second time. Matching on staff and date is what makes the guard hold for
   * history as well as for what happens next.
   */
  coveredDays?: ReadonlySet<string>;
}): ReconcilePlan {
  const plan: ReconcilePlan = { create: [], update: [], remove: [], mismatches: [] };
  const covered = input.coveredDays ?? new Set<string>();

  const wanted = new Map<string, ReconcileEntry>();
  for (const row of input.rows) {
    if (!row.id || row.isDeleted) continue;
    if (row.leaveRequestId) continue; // the request already consumed this day
    const bucket = row.status ? bucketForAttendanceStatus(row.status) : null;
    if (!bucket) continue;
    const dayKey = attendanceDayKey(row.date?.seconds);
    if (!dayKey) continue;
    if (covered.has(coveredDayKey(row.staffId, dayKey))) {
      // A request owns the day. Whether the register agrees about which bucket
      // is a separate question, and one worth putting in front of a person.
      plan.mismatches.push({ attendanceId: row.id, staffId: row.staffId, dayKey, bucket });
      continue;
    }
    wanted.set(row.id, {
      attendanceId: row.id,
      staffId: row.staffId,
      dayKey,
      year: Number(dayKey.slice(0, 4)),
      bucket,
      days: -1,
    });
  }

  const seen = new Set<string>();
  for (const adjustment of input.adjustments) {
    const source = adjustment.sourceAttendanceId;
    if (!source || !adjustment.id) continue; // not ours to touch
    seen.add(source);
    const entry = wanted.get(source);
    if (!entry) {
      plan.remove.push(adjustment.id);
      continue;
    }
    if (adjustment.bucket !== entry.bucket || adjustment.days !== entry.days) {
      plan.update.push({ adjustmentId: adjustment.id, entry });
    }
  }

  for (const [attendanceId, entry] of wanted) {
    if (!seen.has(attendanceId)) plan.create.push(entry);
  }

  return plan;
}
