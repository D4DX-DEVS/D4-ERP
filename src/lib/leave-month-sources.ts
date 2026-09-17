// ==================== What one month-wise cell is made of (pure) ====================
// A cell in the month grid is a number of days TAKEN — never days granted. An
// admin who thinks the number is wrong needs to know which write put the days
// there, because the three possible writes are undone in three different places:
//
//   adjustment  a manual debit          → delete the row, and it is gone
//   attendance  posted by the reconcile → delete it and the next sync re-posts
//                                         it; the attendance day is the fix
//   request     an approved leave       → the request has to be cancelled
//
// Reading those back out is deliberately kept apart from the arithmetic that
// put them in, and pure, so the breakdown can be tested against the ledger's
// own figure for the same cell. The two must always agree: a dialog that
// explains 1 of a cell's 2 days is worse than one that explains nothing.

import {
  bucketForLeaveType,
  consumesLeaveBalance,
  monthColumn,
  splitRequestDaysByMonth,
} from "@/lib/leave-ledger";
import { clampMonth } from "@/lib/leave-month-view";
import type { LeaveAdjustment, LeaveAdjustmentKind, LeaveBucket, StaffRequest } from "@/types";

/** Where a cell's days came from, which decides how they are taken back out. */
export type LeaveMonthSourceKind = "adjustment" | "attendance" | "request";

export interface LeaveMonthSource {
  /** Document id of the request or adjustment behind these days. */
  id: string;
  kind: LeaveMonthSourceKind;
  /** Days this row contributes to this one cell. Always positive. */
  days: number;
  /** Seconds since epoch, for ordering and display. */
  seconds: number;
  /** Short line naming the row, e.g. "Deduction" or "Leave request". */
  label: string;
  /** The admin's own words for it — a reason, or the request's. */
  detail: string;
  /** True when deleting the row here actually clears the days for good. */
  removable: boolean;
  /** Set for attendance-sourced debits: the day that has to be corrected. */
  attendanceId?: string;
  /** Set for request-sourced days: the request that has to be cancelled. */
  requestId?: string;
  /** Kept so the caller can pass the whole adjustment back to the delete call. */
  adjustment?: LeaveAdjustment;
}

export interface LeaveMonthSourcesResult {
  sources: LeaveMonthSource[];
  /** Days the breakdown accounts for — equals the ledger's figure for the cell. */
  accountedDays: number;
  /** Of those, the days this dialog can actually delete on its own. */
  removableDays: number;
}

export interface LeaveMonthSourcesInput {
  /** Approved requests for the staff member. Anything else is ignored. */
  requests: StaffRequest[];
  adjustments: LeaveAdjustment[];
  bucket: LeaveBucket;
  month: number;
  year: number;
}

/** Rounds to the ledger's 0.01 precision, so summing halves never shows 2.9999. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

const ADJUSTMENT_SOURCE_LABELS: Partial<Record<LeaveAdjustmentKind, string>> = {
  deduction: "Days taken off the balance",
  correction: "Correction",
  attendance: "Marked as leave on the attendance register",
};

function adjustmentSource(a: LeaveAdjustment, taken: number): LeaveMonthSource {
  // An attendance-sourced row is recreated by the next reconcile, so offering a
  // delete here would be a button that undoes itself. It is named by its tag,
  // not by its kind, because the tag is what the reconciler actually matches on.
  const fromAttendance = Boolean(a.sourceAttendanceId);
  return {
    id: a.id!,
    kind: fromAttendance ? "attendance" : "adjustment",
    days: taken,
    seconds: a.date?.seconds ?? a.createdAt?.seconds ?? 0,
    label:
      (fromAttendance
        ? ADJUSTMENT_SOURCE_LABELS.attendance
        : ADJUSTMENT_SOURCE_LABELS[a.kind]) ?? "Manual entry",
    detail: a.reason?.trim() || "No reason recorded",
    removable: !fromAttendance,
    ...(fromAttendance ? { attendanceId: a.sourceAttendanceId } : {}),
    adjustment: a,
  };
}

function requestSource(r: StaffRequest, taken: number): LeaveMonthSource {
  return {
    id: r.id!,
    kind: "request",
    days: taken,
    seconds: r.startDate?.seconds ?? 0,
    label: r.isHalfDay ? "Approved leave request (half day)" : "Approved leave request",
    detail: r.reason?.trim() || "No reason recorded",
    removable: false,
    requestId: r.id,
  };
}

/**
 * Every row that spent days in one bucket during one month, oldest first.
 *
 * Credits are deliberately absent: a grant or a week-off conversion raises the
 * yearly entitlement and takes no day, so it never appears in a month cell and
 * listing it here would explain days that the cell does not contain.
 */
export function leaveMonthSources({
  requests,
  adjustments,
  bucket,
  month,
  year,
}: LeaveMonthSourcesInput): LeaveMonthSourcesResult {
  const m = clampMonth(month);
  const sources: LeaveMonthSource[] = [];

  for (const r of requests ?? []) {
    if (!r.id) continue;
    if (r.status !== "approved") continue;
    if (!consumesLeaveBalance(r.type)) continue;
    if (bucketForLeaveType(r.leaveType) !== bucket) continue;
    const taken = splitRequestDaysByMonth(r, year)[m] ?? 0;
    if (taken > 0) sources.push(requestSource(r, round(taken)));
  }

  for (const a of adjustments ?? []) {
    if (!a.id) continue;
    if (a.year !== year) continue;
    if (a.bucket !== bucket) continue;
    const days = typeof a.days === "number" && Number.isFinite(a.days) ? a.days : 0;
    if (days >= 0) continue;
    if (monthColumn(a, year) !== m) continue;
    sources.push(adjustmentSource(a, round(-days)));
  }

  sources.sort((a, b) => a.seconds - b.seconds);

  return {
    sources,
    accountedDays: round(sources.reduce((sum, s) => sum + s.days, 0)),
    removableDays: round(
      sources.reduce((sum, s) => (s.removable ? sum + s.days : sum), 0)
    ),
  };
}
