// One rule for every monthly grid cell (admin grid, staff portal, staff profile
// widget). Previously each page inlined its own copy and all three treated a
// MISSING record as "Absent" — so a staff member whose rows were never imported
// (or whose history was orphaned by a delete) showed a full month of red A.
// Missing data is now blank: absence is only what an import or an admin wrote.
import type { AttendanceStatus } from "@/types";
import { WEEKLY_OFF_META, attendanceStatusMeta, type StatusMeta } from "./attendance-status";

const HOLIDAY_CELL = "bg-rose-100 text-rose-500";

export function holidayMeta(name: string): StatusMeta {
  return { code: "H", label: name || "Holiday", cell: HOLIDAY_CELL, badge: HOLIDAY_CELL };
}

export interface GridDay {
  /** Local date key, "YYYY-MM-DD". */
  key: string;
  isOff: boolean;
  holidayName: string | null;
  isFuture: boolean;
}

/** The window a staff member was actually on the roster, as date keys. */
export interface StaffWindow {
  joinedKey?: string | null;
  /** Set for soft-deleted staff — nothing is inferred after their last day. */
  removedKey?: string | null;
}

/**
 * Resolves one day cell. Returns null for "nothing to show" — before joining,
 * after removal, in the future, or simply no data for that day.
 */
export function resolveDayCell(
  rec: { status: AttendanceStatus } | null | undefined,
  day: GridDay,
  window: StaffWindow = {}
): StatusMeta | null {
  if (rec) {
    // Imported ESSL PDFs mark punch-less off days "A" — a configured holiday or
    // weekly off wins over that absent mark.
    if ((rec.status === "absent" || rec.status === "week-off") && day.holidayName) {
      return holidayMeta(day.holidayName);
    }
    if (rec.status === "absent" && day.isOff) return WEEKLY_OFF_META;
    return attendanceStatusMeta(rec.status);
  }
  if (day.isFuture) return null;
  if (window.joinedKey && day.key < window.joinedKey) return null;
  if (window.removedKey && day.key > window.removedKey) return null;
  if (day.holidayName) return holidayMeta(day.holidayName);
  if (day.isOff) return WEEKLY_OFF_META;
  // No record: unknown, NOT absent.
  return null;
}
