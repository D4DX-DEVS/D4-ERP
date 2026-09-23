// ==================== Request conflicts (pure) ====================
// What the server checks before it accepts a new staff request: that it does
// not claim a day (or an overtime window) another live request already claims,
// and how much of a flexible-leave wallet is already spoken for by requests
// still waiting for approval. Pure so both rules are testable on their own.
//
// Dates arrive as Mongo Dates or client timestamps, and in two conventions —
// UTC midnight from today's form, IST midnight from older rows — so every day
// comparison goes through the org's calendar (dateKeyInZone), never the instant.

import { DEFAULT_TIME_ZONE, dateKeyInZone, type TimeValue } from "@/lib/tz";
import type { FlexWallet, HalfDaySession, StaffRequestType } from "@/types";

export interface ConflictRequest {
  id?: string;
  type: StaffRequestType | string;
  status?: string;
  leaveType?: string;
  leaveWallet?: FlexWallet;
  isHalfDay?: boolean;
  session?: HalfDaySession;
  startDate: TimeValue;
  endDate?: TimeValue;
  startTime?: string;
  endTime?: string;
}

/** A person can be on exactly one of these on a given day. */
const DAY_TYPES = new Set(["leave", "long-leave", "wfh", "on-duty"]);
const LIVE = new Set(["pending", "approved"]);

function dayRange(r: ConflictRequest, timeZone: string): [string, string] | null {
  const start = dateKeyInZone(r.startDate, timeZone);
  const end = dateKeyInZone(r.endDate ?? r.startDate, timeZone) ?? start;
  if (!start || !end) return null;
  return start <= end ? [start, end] : [end, start];
}

/** [start, end) in minutes from the day's midnight; an end at or before the start runs past midnight. */
function minuteWindow(r: ConflictRequest): [number, number] | null {
  const parse = (t?: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = parse(r.startTime);
  const e = parse(r.endTime);
  if (s === null || e === null) return null;
  return [s, e <= s ? e + 24 * 60 : e];
}

function halvesDiffer(a: ConflictRequest, b: ConflictRequest): boolean {
  return Boolean(a.isHalfDay && b.isHalfDay && a.session && b.session && a.session !== b.session);
}

/**
 * The first live request the candidate collides with, or null.
 * - Leave, long leave, WFH and on-duty share the day: any overlap collides,
 *   except the two different halves of one day.
 * - Overtime collides only with overtime on the same day whose window overlaps.
 * - Every other request type never collides.
 */
export function findRequestConflict<T extends ConflictRequest>(
  candidate: ConflictRequest,
  existing: T[],
  timeZone: string = DEFAULT_TIME_ZONE
): T | null {
  const isDay = DAY_TYPES.has(candidate.type);
  const isOvertime = candidate.type === "overtime";
  if (!isDay && !isOvertime) return null;
  const range = dayRange(candidate, timeZone);
  if (!range) return null;

  for (const other of existing) {
    if (!LIVE.has(String(other.status))) continue;
    const otherRange = dayRange(other, timeZone);
    if (!otherRange) continue;
    const overlaps = range[0] <= otherRange[1] && otherRange[0] <= range[1];
    if (!overlaps) continue;

    if (isDay && DAY_TYPES.has(other.type)) {
      if (halvesDiffer(candidate, other)) continue;
      return other;
    }
    if (isOvertime && other.type === "overtime") {
      const a = minuteWindow(candidate);
      const b = minuteWindow(other);
      if (a && b && a[0] < b[1] && b[0] < a[1]) return other;
    }
  }
  return null;
}

/** Leave days a request covers on the org's calendar (0.5 for a half day). */
export function requestDayCount(r: ConflictRequest, timeZone: string = DEFAULT_TIME_ZONE): number {
  if (r.isHalfDay) return 0.5;
  const range = dayRange(r, timeZone);
  if (!range) return 0;
  const [start, end] = range.map((k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Flexible-leave days already requested from `wallet` and still awaiting a
 * decision. A pending request that names no wallet is charged to FL, the
 * wallet it would spend first.
 */
export function pendingWalletDays(
  requests: ConflictRequest[],
  wallet: FlexWallet,
  timeZone: string = DEFAULT_TIME_ZONE
): number {
  return requests
    .filter((r) => r.status === "pending" && r.leaveType === "CO" && (r.leaveWallet ?? "FL") === wallet)
    .reduce((sum, r) => sum + requestDayCount(r, timeZone), 0);
}
