// ==================== Studio reporting aggregations ====================
// Pure aggregations behind /dashboard/studio/reports. Bookings are ad-hoc —
// taken per client at the client's time — so there is no operating-hours
// baseline here and no utilization percentage. Everything is counted off the
// bookings themselves.

import { timeToMinutes } from "@/lib/studio-utils";
import { crewKey, isExternalCrew, sanitizeCrew, sanitizeCrewMember } from "@/lib/studio-crew";
import type { StudioBooking, StudioBookingStatus } from "@/types";

export type ReportRange = "this-month" | "last-month" | "last-90" | "all";

export const REPORT_RANGES: { value: ReportRange; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/** Statuses that never occupied the studio. */
const INACTIVE_STATUSES: StudioBookingStatus[] = ["cancelled", "rejected"];

/** Local "YYYY-MM-DD" key — matches how bookings store their date. */
function dateKey(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

/** Inclusive "YYYY-MM-DD" bounds for a range; `{}` means unbounded. */
export function rangeBounds(range: ReportRange, today: Date = new Date()): { start?: string; end?: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (range) {
    case "this-month":
      return { start: dateKey(new Date(y, m, 1)), end: dateKey(new Date(y, m + 1, 0)) };
    case "last-month":
      return { start: dateKey(new Date(y, m - 1, 1)), end: dateKey(new Date(y, m, 0)) };
    case "last-90": {
      const start = new Date(y, m, today.getDate() - 89);
      return { start: dateKey(start), end: dateKey(today) };
    }
    case "all":
    default:
      return {};
  }
}

export function filterByRange<T extends Pick<StudioBooking, "date">>(
  bookings: T[],
  range: ReportRange,
  today: Date = new Date()
): T[] {
  const { start, end } = rangeBounds(range, today);
  if (!start || !end) return bookings;
  return bookings.filter((b) => !!b.date && b.date >= start && b.date <= end);
}

export function isActiveBooking(booking: StudioBooking): boolean {
  return !INACTIVE_STATUSES.includes(booking.status);
}

/** Minutes a booking occupied: stored duration first, time window second. */
export function bookingMinutes(booking: StudioBooking): number {
  if (typeof booking.duration === "number" && booking.duration > 0) return booking.duration;
  const start = timeToMinutes(booking.startTime);
  const end = timeToMinutes(booking.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

export interface ReportSummary {
  total: number;
  completed: number;
  cancelled: number;
  bookedMinutes: number;
  avgDurationMinutes: number;
  cancellationRate: number;
}

/**
 * Headline numbers. The average divides booked minutes by the same active set
 * that produced them — the old page divided by the total booking count, which
 * dragged the figure down for every cancellation.
 */
export function summarize(bookings: StudioBooking[]): ReportSummary {
  const active = bookings.filter(isActiveBooking);
  const bookedMinutes = active.reduce((sum, b) => sum + bookingMinutes(b), 0);
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;
  return {
    total: bookings.length,
    completed: bookings.filter((b) => b.status === "completed").length,
    cancelled,
    bookedMinutes,
    avgDurationMinutes: active.length ? Math.round(bookedMinutes / active.length) : 0,
    cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 100) : 0,
  };
}

export interface StudioTotals {
  studioId: string;
  name: string;
  count: number;
  minutes: number;
}

/**
 * Per-studio hours and counts over active bookings. Names resolve against the
 * `studios` collection first so a missing `studioName` never leaks a raw id
 * into the UI.
 */
export function perStudio(
  bookings: StudioBooking[],
  studios: { id: string; name: string }[]
): StudioTotals[] {
  const names = new Map(studios.map((s) => [s.id, s.name]));
  const totals = new Map<string, StudioTotals>();
  for (const b of bookings.filter(isActiveBooking)) {
    const id = b.studioId || "unknown";
    const entry = totals.get(id) ?? {
      studioId: id,
      name: names.get(id) || b.studioName || "Unknown studio",
      count: 0,
      minutes: 0,
    };
    entry.count += 1;
    entry.minutes += bookingMinutes(b);
    totals.set(id, entry);
  }
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes || b.count - a.count);
}

export interface KeyCount {
  key: string;
  count: number;
}

function countBy(bookings: StudioBooking[], keyOf: (b: StudioBooking) => string): KeyCount[] {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    const key = keyOf(b);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function countByType(bookings: StudioBooking[]): KeyCount[] {
  return countBy(bookings, (b) => b.bookingType || "other");
}

export function countByStatus(bookings: StudioBooking[]): KeyCount[] {
  return countBy(bookings, (b) => b.status);
}

export interface HourCount {
  hour: number;
  count: number;
}

/** Bookings touching each hour of the day, 0–23, zeros included. */
export function peakHours(bookings: StudioBooking[]): HourCount[] {
  const counts = new Array<number>(24).fill(0);
  for (const b of bookings.filter(isActiveBooking)) {
    const start = timeToMinutes(b.startTime);
    const end = timeToMinutes(b.endTime);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    const firstHour = Math.floor(start / 60);
    const lastHour = Math.floor((end - 1) / 60);
    for (let h = Math.max(0, firstHour); h <= Math.min(23, lastHour); h++) counts[h] += 1;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

export function busiestDay(bookings: StudioBooking[]): { date: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const b of bookings.filter(isActiveBooking)) {
    if (!b.date) continue;
    counts.set(b.date, (counts.get(b.date) || 0) + 1);
  }
  let best: { date: string; count: number } | null = null;
  for (const [date, count] of counts) {
    if (!best || count > best.count || (count === best.count && date < best.date)) {
      best = { date, count };
    }
  }
  return best;
}

export interface ClientTotals {
  name: string;
  count: number;
  minutes: number;
}

export function topClients(bookings: StudioBooking[], limit = 5): ClientTotals[] {
  const totals = new Map<string, ClientTotals>();
  for (const b of bookings.filter(isActiveBooking)) {
    const name = (b.clientName || "").trim();
    if (!name) continue;
    const entry = totals.get(name) ?? { name, count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += bookingMinutes(b);
    totals.set(name, entry);
  }
  return [...totals.values()]
    .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
    .slice(0, limit);
}

export interface CrewTotals {
  key: string;
  name: string;
  shoots: number;
  isExternal: boolean;
}

/** Shoots per shooter, sourced from the crew captured at completion time. */
export function crewLeaderboard(bookings: StudioBooking[]): CrewTotals[] {
  const totals = new Map<string, CrewTotals>();
  for (const b of bookings) {
    for (const member of sanitizeCrew(b.completion?.shooters)) {
      const key = crewKey(member);
      const entry = totals.get(key) ?? {
        key,
        name: member.name,
        shoots: 0,
        isExternal: isExternalCrew(member),
      };
      entry.shoots += 1;
      totals.set(key, entry);
    }
  }
  return [...totals.values()].sort((a, b) => b.shoots - a.shoots || a.name.localeCompare(b.name));
}

export interface CompletedReportRow {
  date: string;
  studio: string;
  time: string;
  durationMinutes: number;
  type: string;
  purpose: string;
  client: string;
  shooters: string;
  cardHolder: string;
}

/** Completed bookings flattened for the report table and the CSV export. */
export function completedReportRows(
  bookings: StudioBooking[],
  studios: { id: string; name: string }[]
): CompletedReportRow[] {
  const names = new Map(studios.map((s) => [s.id, s.name]));
  return bookings
    .filter((b) => b.status === "completed")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((b) => ({
      date: b.date || "",
      studio: names.get(b.studioId) || b.studioName || "Unknown studio",
      time: `${b.startTime || ""}-${b.endTime || ""}`,
      durationMinutes: bookingMinutes(b),
      type: b.bookingType || "other",
      purpose: b.purpose || "",
      client: b.clientName || "",
      shooters: sanitizeCrew(b.completion?.shooters)
        .map((m) => m.name)
        .join(", "),
      cardHolder: sanitizeCrewMember(b.completion?.cardHolder)?.name || "",
    }));
}

const CSV_HEADERS = [
  "Date",
  "Studio",
  "Time",
  "Duration (min)",
  "Type",
  "Purpose",
  "Client",
  "Shooters",
  "Card holder",
];

function csvCell(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CompletedReportRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.date, r.studio, r.time, r.durationMinutes, r.type, r.purpose, r.client, r.shooters, r.cardHolder]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}
