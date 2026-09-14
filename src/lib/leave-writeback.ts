"use client";

// ==================== Approved leave -> the attendance register ====================
// Approving leave used to move the balance and write nothing to attendance, so
// the biometric import's "absent" stood for those days: the same person read as
// absent on one page and as approved leave on the other.
//
// This is the other half of the pair in leave-attendance-sync.ts. The planner
// decides which days to claim and which to leave alone; this applies that
// decision and stamps every row it writes with the request's id — the stamp the
// reconcile looks for before posting a debit, and so the thing that stops an
// approved leave being deducted twice.

import { createDocument, deleteDocument, getDocuments, updateDocument, where, Timestamp } from "@/lib/firestore";
import { logAudit } from "@/lib/audit";
import {
  attendanceDayKey,
  planRequestWriteback,
  type WritebackConflict,
} from "@/lib/leave-attendance-sync";
import type { Attendance, AuthUser, StaffRequest } from "@/types";

const COLLECTION = "attendance";

export interface RequestWritebackResult {
  written: number;
  /** Days left as they stood, each one something a person should look at. */
  conflicts: WritebackConflict[];
}

function midnight(dayKey: string): Date {
  const d = new Date(`${dayKey}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Attendance rows for one staff member across the days a request covers. */
async function rowsForRequest(request: StaffRequest): Promise<(Attendance & { id: string })[]> {
  const startSec = request.startDate?.seconds;
  const endSec = request.endDate?.seconds ?? startSec;
  if (!startSec) return [];
  return getDocuments<Attendance & { id: string }>(COLLECTION, [
    where("staffId", "==", request.staffId),
    where("date", ">=", Timestamp.fromDate(midnight(attendanceDayKey(startSec)!))),
    where("date", "<=", Timestamp.fromDate(midnight(attendanceDayKey(endSec)!))),
  ]);
}

/**
 * Claims the attendance days an approved request covers.
 *
 * Safe to run again: a day this request already owns is rewritten rather than
 * duplicated, so a re-approval or a repaired run converges instead of drifting.
 */
export async function applyRequestWriteback(
  request: StaffRequest,
  user: AuthUser | null
): Promise<RequestWritebackResult> {
  if (!request.id || !request.staffId) return { written: 0, conflicts: [] };

  const existingRows = await rowsForRequest(request);
  const plan = planRequestWriteback({
    request: { ...request, id: request.id },
    existingRows,
  });
  if (plan.upserts.length === 0 && plan.conflicts.length === 0) {
    return { written: 0, conflicts: [] };
  }

  const byDay = new Map<string, Attendance & { id: string }>();
  for (const row of existingRows) {
    if (row.isDeleted) continue;
    const key = attendanceDayKey(row.date?.seconds);
    if (key) byDay.set(key, row);
  }

  for (const day of plan.upserts) {
    const existing = byDay.get(day.dayKey);
    const shared = {
      status: day.status,
      leaveRequestId: request.id,
      source: "leave" as const,
      updatedAt: Timestamp.now(),
    };
    if (existing) {
      await updateDocument(COLLECTION, existing.id, {
        ...shared,
        // Recorded once, on the write that actually replaced something. A
        // re-run must not overwrite it with this request's own status, or the
        // original day is lost after all.
        ...(day.replacesStatus && !existing.statusBeforeLeave
          ? { statusBeforeLeave: day.replacesStatus }
          : {}),
      });
    } else {
      await createDocument(COLLECTION, {
        staffId: request.staffId,
        date: Timestamp.fromDate(midnight(day.dayKey)),
        isLate: false,
        isEarlyDeparture: false,
        ...shared,
        createdAt: Timestamp.now(),
      } as unknown as Record<string, unknown>);
    }
  }

  if (plan.upserts.length > 0) {
    await logAudit(
      "update",
      "attendance",
      "attendance",
      request.id,
      `Marked ${plan.upserts.length} day(s) as ${plan.upserts[0].status} from approved leave`,
      user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
    );
  }

  return { written: plan.upserts.length, conflicts: plan.conflicts };
}

/**
 * Releases the days a request had claimed, when it stops being approved.
 *
 * Only rows this request stamped are touched, so a day somebody has since
 * corrected by hand is left alone. A day that had a record before the approval
 * is put back to exactly what it was; a day the approval invented is removed,
 * because nothing was there to return to. Nothing the register knew is lost
 * either way — which matters, because this runs automatically on a decision,
 * not behind a button someone chose to press.
 */
export async function withdrawRequestWriteback(
  request: StaffRequest,
  user: AuthUser | null
): Promise<number> {
  if (!request.id) return 0;
  const claimed = await getDocuments<Attendance & { id: string }>(COLLECTION, [
    where("leaveRequestId", "==", request.id),
  ]);

  let restored = 0;
  for (const row of claimed) {
    if (row.statusBeforeLeave) {
      await updateDocument(COLLECTION, row.id, {
        status: row.statusBeforeLeave,
        leaveRequestId: null,
        statusBeforeLeave: null,
        source: "manual",
        updatedAt: Timestamp.now(),
      });
      restored += 1;
    } else {
      await deleteDocument(COLLECTION, row.id);
    }
  }

  if (claimed.length > 0) {
    await logAudit(
      "update",
      "attendance",
      "attendance",
      request.id,
      `Released ${claimed.length} attendance day(s) after the leave stopped being approved — ${restored} restored to what they were, ${claimed.length - restored} removed`,
      user ? { uid: user.staffId, firstName: user.firstName, lastName: user.lastName } : null
    );
  }
  return claimed.length;
}
