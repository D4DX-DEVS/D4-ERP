// ==================== Organisation timezone (pure) ====================
// Attendance punches arrive as a wall clock ("18 Sep, 09:54") from a biometric
// device that only ever knew the office's local time. Building those with
// `new Date(y, m, d, h, min)` reads them in the HOST's zone: correct on a laptop
// in India, five and a half hours wrong on a UTC server, and the record then
// renders as a 03:24 pm check-in. Everything here pins that conversion to the
// organisation's zone (Settings → General → Timezone) so the stored instant is
// the same no matter where the import ran, and so the register shows the office
// clock no matter where the viewer is.

/** Fallback when settings have not loaded — the org's zone since day one. */
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

const HOUR_MS = 3600_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // h23 still prints 24 on some ICU builds at exactly midnight.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Milliseconds the zone runs ahead of UTC at this instant (DST included). */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop the sub-second part the formatter never reported, or every offset
  // would come back a few hundred milliseconds short.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * The instant at which the given wall clock reads in `timeZone`.
 *
 * Applied twice on purpose: the first pass guesses with the offset in force at
 * the UTC-shaped guess, the second corrects it with the offset actually in
 * force at the answer — the only way a zone that shifts (unlike India) lands on
 * the right side of a DST change.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstPass = guess - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - zoneOffsetMs(new Date(firstPass), timeZone));
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Midnight that starts this calendar day in the org's zone. */
export function zonedDayStart(isoDate: string, timeZone: string): Date | undefined {
  const m = ISO_DATE_RE.exec(isoDate);
  if (!m) return undefined;
  return zonedTimeToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, timeZone);
}

/** An "YYYY-MM-DD" day plus an "HH:mm" punch, read as the org's clock. */
export function zonedDateAt(isoDate: string, time: string | undefined, timeZone: string): Date | undefined {
  if (!time) return undefined;
  const day = ISO_DATE_RE.exec(isoDate);
  const clock = TIME_RE.exec(time.trim());
  if (!day || !clock) return undefined;
  return zonedTimeToUtc(
    Number(day[1]),
    Number(day[2]),
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
    timeZone
  );
}

/** Anything the attendance layer hands around as a moment in time. */
export type TimeValue = Date | number | { seconds: number } | null | undefined;

/** Epoch milliseconds for a Date, epoch seconds, or a Mongo/Firestore timestamp. */
export function toMillis(value: TimeValue): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value * 1000 : undefined;
  if (typeof value === "object" && typeof (value as { seconds?: unknown }).seconds === "number") {
    return (value as { seconds: number }).seconds * 1000;
  }
  return undefined;
}

/** Local "YYYY-MM-DD" for an instant, as the org's calendar sees it. */
export function dateKeyInZone(value: TimeValue, timeZone: string): string | undefined {
  const ms = toMillis(value);
  if (ms === undefined) return undefined;
  const p = zonedParts(new Date(ms), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * "09:54 am" on the office wall clock. Built from parts rather than
 * toLocaleTimeString so the register reads the same on every ICU build.
 */
export function formatTimeInZone(value: TimeValue, timeZone: string, fallback = "—"): string {
  const ms = toMillis(value);
  if (ms === undefined) return fallback;
  const p = zonedParts(new Date(ms), timeZone);
  const suffix = p.hour < 12 ? "am" : "pm";
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${String(hour12).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ${suffix}`;
}

/**
 * "HH:mm" for an <input type="time">, on the org's clock.
 *
 * Locale strings like "02:58 pm" are rejected by the control, which then saves
 * a blank and silently wipes the punch — so this stays 24h and unformatted.
 */
export function timeInputValue(value: TimeValue, timeZone: string): string {
  const ms = toMillis(value);
  if (ms === undefined) return "";
  const p = zonedParts(new Date(ms), timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Hours between two punches, to two decimals; 0 when either side is missing. */
export function hoursBetween(from: TimeValue, to: TimeValue): number {
  const a = toMillis(from);
  const b = toMillis(to);
  if (a === undefined || b === undefined) return 0;
  const hrs = (b - a) / HOUR_MS;
  return hrs > 0 ? Math.round(hrs * 100) / 100 : 0;
}
