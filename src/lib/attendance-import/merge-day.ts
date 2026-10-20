// ==================== Biometric import: one day against what is there (pure) ====================
// A staff+day can already hold rows from other writers — an approved leave, an
// admin's hand edit, a correction — stored at a different midnight from the
// import's own (see attendance-dedupe.ts). The import decides per day which row,
// if any, it may write, and never writes over a row a person decided.

import { pickAttendanceRecord } from "@/lib/attendance-dedupe";

export interface ImportDayRow {
  id: string;
  status: string;
  source?: string;
  leaveRequestId?: string | null;
  isDeleted?: boolean;
  updatedAt?: { seconds: number } | null;
  createdAt?: { seconds: number } | null;
}

export type ImportDayAction = { kind: "skip" } | { kind: "create" } | { kind: "update"; id: string };

const PERSON_SOURCES: ReadonlySet<string> = new Set(["manual", "correction"]);

function heldByLeave(row: ImportDayRow): boolean {
  return Boolean(row.leaveRequestId) || row.source === "leave";
}

function heldByPerson(row: ImportDayRow): boolean {
  return Boolean(row.source && PERSON_SOURCES.has(row.source));
}

/**
 * What the import should do with one day.
 *
 * Its own rows it may overwrite. A hand-marked day it leaves alone. An
 * approved-leave day it leaves alone too, unless the device shows real punches:
 * then the punch goes in as a row of its own, where the register shows it over
 * the leave and the contradiction reaches a person instead of vanishing.
 */
export function planImportDay(input: {
  rows: ImportDayRow[];
  overwriteExisting: boolean;
  hasPunches: boolean;
}): ImportDayAction {
  const live = input.rows.filter((r) => !r.isDeleted);
  if (live.length === 0) return { kind: "create" };

  const own = live.filter((r) => !heldByLeave(r) && !heldByPerson(r));
  if (own.length > 0) {
    if (!input.overwriteExisting) return { kind: "skip" };
    return { kind: "update", id: own.reduce((a, b) => pickAttendanceRecord(a, b)).id };
  }

  if (live.some(heldByPerson)) return { kind: "skip" };
  // Only a leave holds the day. Overwrite or not, a punch is news the leave
  // row cannot carry, so it goes in beside it.
  return input.hasPunches ? { kind: "create" } : { kind: "skip" };
}
