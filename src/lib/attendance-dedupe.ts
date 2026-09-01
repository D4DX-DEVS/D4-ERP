// ==================== Attendance duplicate-row resolution ====================
// Attendance rows for one staff+day can come from several writers (ESSL import,
// correction approval, manual register edit, legacy clock-ins) whose midnight
// conventions differ (server-local vs client-local), so the same calendar day
// can hold multiple live rows. Every view must resolve duplicates the same way:
// correction > manual > everything else, then newest write wins.

interface TimestampLike {
  seconds: number;
}

export interface AttendanceLike {
  status: string;
  source?: string;
  date?: TimestampLike | null;
  updatedAt?: TimestampLike | null;
  createdAt?: TimestampLike | null;
  isDeleted?: boolean;
}

const secOf = (ts: TimestampLike | null | undefined): number =>
  typeof ts?.seconds === "number" ? ts.seconds : 0;

/** Local-timezone YYYY-MM-DD key for a Date — matches how the register groups days. */
export const localDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayKeyFromSec = (s: number): string => localDayKey(new Date(s * 1000));

/** correction beats manual beats import/clock/legacy. */
const sourceRank = (source?: string): number =>
  source === "correction" ? 3 : source === "manual" ? 2 : 1;

/**
 * Given two live rows for the same staff+day, return the one views should show.
 * Stable: returns `a` on a full tie so callers can fold left over query order.
 */
export function pickAttendanceRecord<T extends AttendanceLike>(a: T, b: T): T {
  const rankA = sourceRank(a.source);
  const rankB = sourceRank(b.source);
  if (rankA !== rankB) return rankA > rankB ? a : b;

  const updatedA = secOf(a.updatedAt) || secOf(a.createdAt);
  const updatedB = secOf(b.updatedAt) || secOf(b.createdAt);
  if (updatedA !== updatedB) return updatedA > updatedB ? a : b;

  // Legacy healing rule: an unexplained "absent" never shadows a real record.
  if (a.status === "absent" && b.status !== "absent") return b;
  return a;
}

/**
 * Collapse rows to one per staff+local-day using pickAttendanceRecord.
 * Rows without a usable date (or soft-deleted) are dropped.
 */
export function dedupeAttendance<T extends AttendanceLike & { staffId: string }>(records: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of records) {
    if (r.isDeleted) continue;
    const s = secOf(r.date);
    if (!s) continue;
    const key = `${r.staffId}_${dayKeyFromSec(s)}`;
    const prev = map.get(key);
    map.set(key, prev ? pickAttendanceRecord(prev, r) : r);
  }
  return Array.from(map.values());
}
