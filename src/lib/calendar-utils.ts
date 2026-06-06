import type {
  CalendarEvent,
  EventType,
  EventPriority,
  EventScope,
  LeaveRequest,
  StudioBooking,
  Task,
} from "@/types";
import type { Holiday } from "@/lib/settings";

// ── Category metadata ─────────────────────────────────────────────────────────
// `badge`/`bar` are Tailwind class strings; `hex` is used for PDF rendering.
export interface CategoryMeta {
  value: EventType;
  label: string;
  badge: string;
  bar: string;
  hex: string;
}

export const EVENT_CATEGORIES: CategoryMeta[] = [
  { value: "meeting", label: "Meeting", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-100 text-blue-700", hex: "#3b82f6" },
  { value: "deadline", label: "Deadline", badge: "bg-red-100 text-red-700", bar: "bg-red-100 text-red-700", hex: "#ef4444" },
  { value: "event", label: "Event", badge: "bg-purple-100 text-purple-700", bar: "bg-purple-100 text-purple-700", hex: "#a855f7" },
  { value: "holiday", label: "Holiday", badge: "bg-green-100 text-green-700", bar: "bg-green-100 text-green-700", hex: "#22c55e" },
  { value: "reminder", label: "Reminder", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-100 text-yellow-700", hex: "#eab308" },
  { value: "shoot", label: "Shoot", badge: "bg-pink-100 text-pink-700", bar: "bg-pink-100 text-pink-700", hex: "#ec4899" },
  { value: "delivery", label: "Delivery", badge: "bg-orange-100 text-orange-700", bar: "bg-orange-100 text-orange-700", hex: "#f97316" },
  { value: "program", label: "Program", badge: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-100 text-indigo-700", hex: "#6366f1" },
  { value: "leave", label: "Leave", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-100 text-amber-700", hex: "#f59e0b" },
  { value: "training", label: "Training", badge: "bg-teal-100 text-teal-700", bar: "bg-teal-100 text-teal-700", hex: "#14b8a6" },
  { value: "payroll", label: "Payroll", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-100 text-emerald-700", hex: "#10b981" },
  { value: "personal", label: "Personal", badge: "bg-slate-100 text-slate-700", bar: "bg-slate-100 text-slate-700", hex: "#64748b" },
  { value: "announcement", label: "Announcement", badge: "bg-cyan-100 text-cyan-700", bar: "bg-cyan-100 text-cyan-700", hex: "#06b6d4" },
  { value: "studio", label: "Studio Booking", badge: "bg-violet-100 text-violet-700", bar: "bg-violet-100 text-violet-700", hex: "#8b5cf6" },
];

const CATEGORY_MAP: Record<string, CategoryMeta> = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.value, c])
);

export function categoryMeta(type: string): CategoryMeta {
  return CATEGORY_MAP[type] ?? { value: type as EventType, label: type, badge: "bg-gray-100 text-gray-700", bar: "bg-gray-100 text-gray-700", hex: "#9ca3af" };
}

/** Categories selectable when creating a manual event (excludes derived ones). */
export const MANUAL_EVENT_TYPES: EventType[] = [
  "meeting", "event", "deadline", "shoot", "program",
  "reminder", "training", "payroll", "personal", "announcement",
];

// ── Unified calendar item ─────────────────────────────────────────────────────
export type CalendarSource = "event" | "leave" | "task" | "holiday" | "booking";

export interface CalendarItem {
  /** Unique per rendered occurrence (recurring events get suffixed keys). */
  key: string;
  /** Underlying document id (for events: editable doc; overlays: source id). */
  id: string;
  source: CalendarSource;
  title: string;
  type: EventType;
  /** Local midnight of the first day this occurrence covers. */
  start: Date;
  /** Local midnight of the last day this occurrence covers (inclusive). */
  end: Date;
  startTime?: string;
  endTime?: string;
  isAllDay: boolean;
  color?: string;
  priority?: EventPriority;
  scope?: EventScope;
  location?: string;
  description?: string;
  /** Deep-link to source module (overlays) or event page. */
  href?: string;
  editable: boolean;
  /** Original event document, present only for source === "event". */
  raw?: CalendarEvent & { id: string };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
type TsLike = { seconds?: number } | null | undefined;

export function tsToDate(ts: TsLike): Date | null {
  if (ts && typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  return null;
}

/** Local midnight of the given date (strips time component). */
export function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Parse "YYYY-MM-DD" into a local Date (no timezone shift). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whether [aStart,aEnd] overlaps [bStart,bEnd] at day granularity. */
function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

// ── Recurrence expansion ──────────────────────────────────────────────────────
/**
 * Expands a (possibly recurring) event into the occurrences that overlap the
 * [rangeStart, rangeEnd] window. Each occurrence keeps the original duration.
 */
export function expandRecurrence(
  start: Date,
  end: Date,
  recurrence: CalendarEvent["recurrence"],
  rangeStart: Date,
  rangeEnd: Date
): { start: Date; end: Date }[] {
  const freq = recurrence?.frequency ?? "none";
  if (freq === "none") {
    return rangesOverlap(start, end, rangeStart, rangeEnd) ? [{ start, end }] : [];
  }

  const interval = Math.max(1, recurrence?.interval ?? 1);
  const until = recurrence?.until ? parseDateKey(recurrence.until) : null;
  const durationDays = Math.round((dayStart(end).getTime() - dayStart(start).getTime()) / 86400000);

  const out: { start: Date; end: Date }[] = [];
  let cursor = dayStart(start);
  // Hard cap to avoid pathological loops.
  for (let i = 0; i < 1000; i++) {
    if (cursor.getTime() > rangeEnd.getTime()) break;
    if (until && cursor.getTime() > dayStart(until).getTime()) break;

    const occStart = cursor;
    const occEnd = addDays(cursor, durationDays);
    if (rangesOverlap(occStart, occEnd, rangeStart, rangeEnd)) {
      out.push({ start: occStart, end: occEnd });
    }

    cursor = stepDate(cursor, freq, interval);
  }
  return out;
}

function stepDate(date: Date, freq: string, interval: number): Date {
  const d = new Date(date);
  switch (freq) {
    case "daily": d.setDate(d.getDate() + interval); break;
    case "weekly": d.setDate(d.getDate() + 7 * interval); break;
    case "monthly": d.setMonth(d.getMonth() + interval); break;
    case "yearly": d.setFullYear(d.getFullYear() + interval); break;
    default: d.setDate(d.getDate() + 1);
  }
  return d;
}

// ── Source → CalendarItem converters ──────────────────────────────────────────
export function eventToItems(
  event: CalendarEvent & { id: string },
  rangeStart: Date,
  rangeEnd: Date
): CalendarItem[] {
  const start = tsToDate(event.startDate);
  if (!start) return [];
  const end = tsToDate(event.endDate) ?? start;
  const occ = expandRecurrence(dayStart(start), dayStart(end), event.recurrence, rangeStart, rangeEnd);
  return occ.map((o, i) => ({
    key: `event-${event.id}-${i}`,
    id: event.id,
    source: "event" as const,
    title: event.title,
    type: event.type,
    start: o.start,
    end: o.end,
    startTime: event.startTime,
    endTime: event.endTime,
    isAllDay: event.isAllDay,
    color: event.color,
    priority: event.priority,
    scope: event.scope,
    location: event.location,
    description: event.description,
    href: `/dashboard/calendar/event/${event.id}`,
    editable: true,
    raw: event,
  }));
}

export function leaveToItem(leave: LeaveRequest & { id: string }): CalendarItem | null {
  const start = tsToDate(leave.startDate);
  if (!start) return null;
  const end = tsToDate(leave.endDate) ?? start;
  return {
    key: `leave-${leave.id}`,
    id: leave.id,
    source: "leave",
    title: `${leave.staffName ?? "Staff"} · ${leave.leaveType ?? leave.type}`,
    type: "leave",
    start: dayStart(start),
    end: dayStart(end),
    isAllDay: true,
    description: leave.reason,
    href: `/dashboard/leaves`,
    editable: false,
  };
}

export function taskToItem(task: Task & { id: string }): CalendarItem | null {
  const due = tsToDate(task.dueDate);
  if (!due) return null;
  return {
    key: `task-${task.id}`,
    id: task.id,
    source: "task",
    title: task.title,
    type: "deadline",
    start: dayStart(due),
    end: dayStart(due),
    isAllDay: true,
    priority: task.priority,
    description: task.description,
    href: `/dashboard/tasks`,
    editable: false,
  };
}

export function holidayToItem(holiday: Holiday): CalendarItem {
  const d = parseDateKey(holiday.date);
  return {
    key: `holiday-${holiday.date}`,
    id: holiday.date,
    source: "holiday",
    title: holiday.name,
    type: "holiday",
    start: dayStart(d),
    end: dayStart(d),
    isAllDay: true,
    editable: false,
  };
}

/** Convert an approved/pending studio booking into a calendar overlay item. */
export function bookingToItem(booking: StudioBooking & { id: string }): CalendarItem | null {
  if (!booking.date) return null;
  const d = parseDateKey(booking.date);
  const studio = booking.studioName ?? "Studio";
  const title = `${studio} · ${booking.purpose || "Booking"}`;
  return {
    key: `booking-${booking.id}`,
    id: booking.id,
    source: "booking",
    title: booking.status === "pending" ? `${title} (pending)` : title,
    type: "studio",
    start: dayStart(d),
    end: dayStart(d),
    startTime: booking.startTime,
    endTime: booking.endTime,
    isAllDay: false,
    location: booking.studioName,
    description: booking.notes || booking.clientName,
    href: `/dashboard/studio`,
    editable: false,
  };
}

/** Items covering a specific day, sorted all-day first then by start time. */
export function itemsForDay(items: CalendarItem[], day: Date): CalendarItem[] {
  const ds = dayStart(day).getTime();
  return items
    .filter((it) => it.start.getTime() <= ds && it.end.getTime() >= ds)
    .sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
}
