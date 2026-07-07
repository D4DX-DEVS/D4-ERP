// ==================== Cross-availability (assets ⇄ studio bookings ⇄ events) ====================
// Pure helpers, no DB. Given already-loaded arrays, decide whether an item
// (a physical asset or studio equipment) is free during a target window.
//
// Two "busy" sources:
//   1. A blocking studio booking that reserves the item (both pools).
//   2. An OUT asset movement to an asset-event (physical assets only).
//
// Granularity: studio↔studio overlaps at the HOUR level (reuse timesOverlap);
// event↔studio and event↔event overlap at the DAY level, because a physical
// asset OUT to an event is gone for the whole day.

import { timesOverlap } from "./studio-utils";
import type { StudioBookingStatus } from "@/types";

const MS_PER_DAY = 86_400_000;

/**
 * Studio booking statuses that reserve their assets (locking them against
 * asset-event checkout and other bookings). Broader than studio-utils'
 * `BLOCKING_STATUSES` (which governs studio *time-slot* double-booking): a
 * confirmed or in-progress booking is a firm commitment, so its assets are
 * gone. Only rejected / cancelled / completed free them.
 */
export const RESERVING_STATUSES: StudioBookingStatus[] = ["pending", "approved", "confirmed", "in-progress"];

export type ReservedItemKind = "asset" | "equipment";

export interface ReservedItem {
  itemId: string;
  name: string;
  kind: ReservedItemKind;
}

/** Minimal studio-booking shape needed for availability. */
export interface BookingLike {
  id?: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  status: StudioBookingStatus;
  reservedItems?: ReservedItem[];
  purpose?: string;
  studioName?: string;
}

/** Minimal OUT-movement shape (physical asset checked out to an asset-event). */
export interface MovementLike {
  assetId: string;
  eventId: string;
  eventName?: string;
  status: string; // "OUT" | "IN"
}

/** Minimal asset-event shape (a date range). fromDate/toDate may be any stored form. */
export interface AssetEventLike {
  id: string;
  name?: string;
  fromDate: unknown;
  toDate: unknown;
}

export interface AvailabilityContext {
  outMovements: MovementLike[];
  assetEvents: AssetEventLike[];
  studioBookings: BookingLike[];
  /** Ignore this booking when checking (edit mode). */
  ignoreBookingId?: string;
  /** Ignore movements belonging to this asset-event (its own checkout page). */
  ignoreEventId?: string;
}

/** The window to test availability for — a studio time slot or an event date range. */
export type AvailabilityWindow =
  | { kind: "studio"; date: string; startTime: string; endTime: string }
  | { kind: "event"; fromDate: unknown; toDate: unknown };

export interface BusyReason {
  type: "event" | "studio";
  name: string;
  refId?: string;
}

/** Convert a stored date field (Date, ISO string, number, {seconds}, Timestamp) to ms, or null. */
function toMs(val: unknown): number | null {
  if (val == null) return null;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "object") {
    const s = (val as { seconds?: number }).seconds;
    if (typeof s === "number") return s * 1000;
  }
  const n = new Date(val as string | number).getTime();
  return Number.isNaN(n) ? null : n;
}

/** UTC day index (days since epoch) from a "YYYY-MM-DD" string. */
function dayIndexFromDateStr(s: string): number | null {
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor(ms / MS_PER_DAY);
}

/** UTC day index from an arbitrary stored date field. */
function dayIndexFromField(val: unknown): number | null {
  const ms = toMs(val);
  return ms == null ? null : Math.floor(ms / MS_PER_DAY);
}

/** Day range [from, to] of an asset-event. Missing values become null (open-ended). */
function eventDayRange(ev?: AssetEventLike): { from: number | null; to: number | null } {
  if (!ev) return { from: null, to: null };
  return { from: dayIndexFromField(ev.fromDate), to: dayIndexFromField(ev.toDate) };
}

/** Does a studio booking's reservation overlap the target window? */
function bookingOverlapsWindow(b: BookingLike, window: AvailabilityWindow): boolean {
  if (window.kind === "studio") {
    if (b.date !== window.date) return false;
    return timesOverlap(window.startTime, window.endTime, b.startTime, b.endTime);
  }
  // event window vs a single-day booking → is the booking day inside the range?
  const bDay = dayIndexFromDateStr(b.date);
  if (bDay == null) return false;
  const from = dayIndexFromField(window.fromDate);
  const to = dayIndexFromField(window.toDate);
  const afterStart = from == null || from <= bDay;
  const beforeEnd = to == null || to >= bDay;
  return afterStart && beforeEnd;
}

/** Does an OUT movement's event overlap the target window? Missing event → conservatively busy. */
function movementOverlapsWindow(ev: AssetEventLike | undefined, window: AvailabilityWindow): boolean {
  const { from, to } = eventDayRange(ev);
  if (window.kind === "studio") {
    const day = dayIndexFromDateStr(window.date);
    if (day == null) return false;
    const afterStart = from == null || from <= day;
    const beforeEnd = to == null || to >= day;
    return afterStart && beforeEnd;
  }
  // event window vs event range → day-level range overlap
  const wf = dayIndexFromField(window.fromDate);
  const wt = dayIndexFromField(window.toDate);
  const overlapStart = wt == null || from == null || from <= wt;
  const overlapEnd = wf == null || to == null || to >= wf;
  return overlapStart && overlapEnd;
}

/**
 * Is `item` busy during `window`? Returns the first blocking reason, or `{ busy: false }`.
 * Studio bookings block both pools; asset-event movements only block `asset` items.
 */
export function itemBusyReason(
  item: { id: string; kind: ReservedItemKind },
  window: AvailabilityWindow,
  ctx: AvailabilityContext
): { busy: boolean; reason?: BusyReason } {
  // 1) Reserved by a blocking studio booking
  for (const b of ctx.studioBookings) {
    if (ctx.ignoreBookingId && b.id === ctx.ignoreBookingId) continue;
    if (!RESERVING_STATUSES.includes(b.status)) continue;
    const reserves = b.reservedItems?.some((r) => r.itemId === item.id && r.kind === item.kind);
    if (!reserves) continue;
    if (bookingOverlapsWindow(b, window)) {
      return {
        busy: true,
        reason: { type: "studio", name: b.purpose || b.studioName || "Studio booking", refId: b.id },
      };
    }
  }

  // 2) Physically OUT to an asset-event (assets only)
  if (item.kind === "asset") {
    for (const m of ctx.outMovements) {
      if (m.status !== "OUT") continue;
      if (m.assetId !== item.id) continue;
      if (ctx.ignoreEventId && m.eventId === ctx.ignoreEventId) continue;
      const ev = ctx.assetEvents.find((e) => e.id === m.eventId);
      if (movementOverlapsWindow(ev, window)) {
        return {
          busy: true,
          reason: { type: "event", name: m.eventName || ev?.name || "Event", refId: m.eventId },
        };
      }
    }
  }

  return { busy: false };
}

/** Batch convenience for the UI: annotate each item with availability. */
export function computeAvailability<T extends { id: string; kind: ReservedItemKind }>(
  items: T[],
  window: AvailabilityWindow,
  ctx: AvailabilityContext
): (T & { available: boolean; reason?: BusyReason })[] {
  return items.map((it) => {
    const { busy, reason } = itemBusyReason(it, window, ctx);
    return { ...it, available: !busy, reason };
  });
}
