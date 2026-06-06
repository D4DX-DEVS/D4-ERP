// ==================== Studio booking helpers ====================
// Pure helpers for the studio booking module: status metadata and
// time-overlap / double-booking detection. No external dependencies.

import type { StudioBooking, StudioBookingStatus } from "@/types";

export interface BookingStatusMeta {
  value: StudioBookingStatus;
  label: string;
  badge: string;
}

export const BOOKING_STATUSES: BookingStatusMeta[] = [
  { value: "pending", label: "Pending", badge: "bg-amber-100 text-amber-700" },
  { value: "approved", label: "Approved", badge: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rejected", badge: "bg-red-100 text-red-700" },
  { value: "cancelled", label: "Cancelled", badge: "bg-slate-100 text-slate-600" },
];

const STATUS_MAP: Record<string, BookingStatusMeta> = Object.fromEntries(
  BOOKING_STATUSES.map((s) => [s.value, s])
);

export function bookingStatusMeta(status: string): BookingStatusMeta {
  return STATUS_MAP[status] ?? { value: status as StudioBookingStatus, label: status, badge: "bg-gray-100 text-gray-700" };
}

/** Statuses that actively reserve a slot (block other bookings). */
export const BLOCKING_STATUSES: StudioBookingStatus[] = ["pending", "approved"];

/** Parse "HH:mm" into minutes-from-midnight. Returns NaN for malformed input. */
export function timeToMinutes(time: string | undefined | null): number {
  if (!time || typeof time !== "string") return NaN;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

/** Whether two [start,end) time ranges on the same day overlap. */
export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart < bEnd && bStart < aEnd;
}

/** True when endTime is strictly after startTime. */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}

/**
 * Returns the first existing booking that conflicts with the candidate
 * (same studio + date, overlapping time, blocking status), or null when free.
 * Pass `ignoreId` to exclude the booking being edited.
 */
export function findConflict(
  candidate: Pick<StudioBooking, "studioId" | "date" | "startTime" | "endTime">,
  existing: (StudioBooking & { id: string })[],
  ignoreId?: string
): (StudioBooking & { id: string }) | null {
  for (const b of existing) {
    if (ignoreId && b.id === ignoreId) continue;
    if (b.studioId !== candidate.studioId) continue;
    if (b.date !== candidate.date) continue;
    if (!BLOCKING_STATUSES.includes(b.status)) continue;
    if (timesOverlap(candidate.startTime, candidate.endTime, b.startTime, b.endTime)) {
      return b;
    }
  }
  return null;
}
