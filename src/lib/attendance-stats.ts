// ==================== Attendance register counters (pure) ====================
// The four cards above the Attendance register. They were counted inline in the
// page against raw status strings, which meant they disagreed with the grid
// sitting underneath them: "Leave Days" only matched the legacy "leave" code and
// so read 0 on a month full of CL/ML marks, and "Present Days" missed overtime.
//
// Two rules keep them honest:
//   - every status is folded through normalizeAttendanceStatus first, exactly as
//     the grid and the status filter already do, so a legacy row counts as
//     whatever it is displayed as;
//   - "worked" is the same set the leave ledger uses, imported rather than
//     restated, so the Attendance page and Leave Balances cannot drift apart on
//     what counts as a working day.

import { normalizeAttendanceStatus, type ActiveAttendanceStatus } from "@/lib/attendance-status";
import { WORKED_ATTENDANCE_STATUSES } from "@/lib/leave-ledger";
import type { Attendance } from "@/types";

/** The buckets that carry a balance, as they appear on an attendance day. */
const LEAVE_STATUSES: ReadonlySet<ActiveAttendanceStatus> = new Set<ActiveAttendanceStatus>([
  "casual-leave",
  "earned-leave",
  "medical-leave",
  "full-leave",
]);

export interface AttendanceStats {
  /** Live headcount — removed staff are history, not employees. */
  staff: number;
  /** Days somebody actually worked, however the day was logged. */
  presentDays: number;
  /** Days taken as leave, across every bucket. */
  leaveDays: number;
  /** Rows flagged late, whatever status they carry. */
  lateMarks: number;
}

export function attendanceStats(
  records: Pick<Attendance, "status" | "isLate" | "isDeleted">[],
  staffList: { isDeleted?: boolean }[]
): AttendanceStats {
  let presentDays = 0;
  let leaveDays = 0;
  let lateMarks = 0;

  for (const record of records) {
    if (record.isDeleted) continue;
    if (record.isLate) lateMarks += 1;
    if (!record.status) continue;
    const status = normalizeAttendanceStatus(record.status);
    if (WORKED_ATTENDANCE_STATUSES.has(status)) presentDays += 1;
    else if (LEAVE_STATUSES.has(status)) leaveDays += 1;
  }

  return {
    staff: staffList.filter((s) => !s.isDeleted).length,
    presentDays,
    leaveDays,
    lateMarks,
  };
}
