// Attendance status display config — the active set is P/A/H/OD/PH (+ derived
// WO for weekly offs). Legacy stored statuses (late/wfh/leave) still exist in
// old records; normalizeAttendanceStatus folds them into the active set.
import type { AttendanceStatus } from "@/types";

export type ActiveAttendanceStatus = "present" | "absent" | "half-day" | "on-duty" | "public-holiday";

export interface StatusMeta {
  code: string;
  label: string;
  cell: string;
  badge: string;
}

export const ATTENDANCE_STATUS_CONFIG: Record<ActiveAttendanceStatus, StatusMeta> = {
  present: { code: "P", label: "Present", cell: "bg-emerald-100 text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  absent: { code: "A", label: "Absent", cell: "bg-rose-100 text-rose-700", badge: "bg-rose-100 text-rose-700" },
  "half-day": { code: "H", label: "Half Day", cell: "bg-amber-100 text-amber-700", badge: "bg-amber-100 text-amber-700" },
  "on-duty": { code: "OD", label: "On Duty", cell: "bg-violet-100 text-violet-700", badge: "bg-violet-100 text-violet-700" },
  "public-holiday": { code: "PH", label: "Public Holiday", cell: "bg-purple-100 text-purple-700", badge: "bg-purple-100 text-purple-700" },
};

export const WEEKLY_OFF_META: StatusMeta = { code: "WO", label: "Weekly Off", cell: "bg-slate-100 text-slate-400", badge: "bg-slate-100 text-slate-400" };

export const ATTENDANCE_STATUS_OPTIONS: { value: ActiveAttendanceStatus; label: string }[] = (
  Object.entries(ATTENDANCE_STATUS_CONFIG) as [ActiveAttendanceStatus, StatusMeta][]
).map(([value, cfg]) => ({ value, label: cfg.label }));

/** Folds legacy statuses into the active set: late/wfh → present, leave → absent. */
export function normalizeAttendanceStatus(status: AttendanceStatus): ActiveAttendanceStatus {
  if (status === "late" || status === "wfh") return "present";
  if (status === "leave") return "absent";
  return status;
}

export function attendanceStatusMeta(status: AttendanceStatus): StatusMeta {
  return ATTENDANCE_STATUS_CONFIG[normalizeAttendanceStatus(status)];
}
