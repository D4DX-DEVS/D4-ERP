import { getDocuments } from "@/lib/firestore";
import type { Shift } from "@/types";
import { DEFAULT_LETTER_BODIES } from "@/lib/letter-templates";

// ==================== Work Schedule ====================

export type WeekdayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface DaySchedule {
  /** When false the day is treated as a weekly off / leave day. */
  enabled: boolean;
  /** "HH:mm" 24h work start time. */
  start: string;
  /** "HH:mm" 24h work end time. */
  end: string;
}

export type WeeklySchedule = Record<WeekdayKey, DaySchedule>;

export interface Holiday {
  /** "YYYY-MM-DD" calendar date that is a non-working day. */
  date: string;
  name: string;
  /** When set, the holiday applies only to staff of this company. Empty/undefined = all companies. */
  companyId?: string;
}

export interface AttendanceRules {
  /** Hours required to count a day as a full present day. */
  fullDayHours: number;
  /** Minimum hours to count as a half day (below this = absent). */
  halfDayHours: number;
  /** Hours worked beyond this threshold count as overtime. */
  overtimeAfterHours: number;
  /** When true, check-in is blocked unless a location is captured. */
  locationRequired: boolean;
}

export interface CompanyProfile {
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Public URL of the company logo shown on invoices/quotations. */
  logoUrl: string;
}

export interface LeavePolicy {
  casualLeave: number;
  sickLeave: number;
  earnedLeave: number;
}

/** Branding assets used when generating HR letters / certificates. */
export interface LetterSettings {
  /** Public URL of the authorized signatory's signature image. */
  signatureUrl: string;
  /** Public URL of the company seal / stamp image. */
  sealUrl: string;
  /** Optional full-letterhead background image URL. */
  letterheadUrl: string;
  /** Name printed under the signature. */
  authorizedSignatory: string;
  /** Designation printed under the signatory name. */
  signatoryDesignation: string;
  /** Optional footer line shown at the bottom of every letter. */
  footerText: string;
  /** Editable template body for the experience certificate. */
  experienceBody: string;
  /** Editable template body for the appointment letter. */
  appointmentBody: string;
  /** Editable template body for the relieving letter. */
  relievingBody: string;
}

/**
 * Number-format templates for auto-generated document numbers.
 * Supported tokens: {COMP} company code, {YYYY} FY start year, {YY} 2-digit
 * year, {FY} financial-year label (2026-27), {SEQ:n} zero-padded running
 * number, {SEQ} raw running number.
 */
export interface NumberFormats {
  quotation: string;
  estimate: string;
  invoice: string;
  receipt: string;
}

export interface AppSettings {
  id?: string;
  companyName: string;
  defaultCurrency: string;
  dateFormat: string;
  financialYearStart: string;
  timezone: string;
  companyProfile: CompanyProfile;
  leavePolicy: LeavePolicy;
  /** Branding / signatory details used by the HR letter generator. */
  letterSettings: LetterSettings;
  /** Default times used by the "apply to all days" helper. */
  workingHours: { start: string; end: string };
  /** Per-day work schedule. Drives attendance late / early / off-day logic. */
  weeklySchedule: WeeklySchedule;
  /** One-off non-working dates (public holidays, company closures). */
  holidays: Holiday[];
  lateThresholdMinutes: number;
  attendanceRules: AttendanceRules;
  emailNotifications: boolean;
  whatsappApiKey: string;
  gstNumber: string;
  panNumber: string;
  /** Default GST percentage pre-filled on new invoices/quotations. */
  defaultGstRate: number;
  invoicePrefix: string;
  quotationPrefix: string;
  /** Templates that drive auto-generated document numbers (FR-QT-003). */
  numberFormats: NumberFormats;
}

/** JS Date.getDay() index (0 = Sunday) → weekday key. */
export const DAY_KEYS: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Monday-first ordering for UI rendering. */
export const WEEKDAYS_UI: { key: WeekdayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const DEFAULT_START = "09:30";
const DEFAULT_END = "18:30";

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  sunday: { enabled: false, start: DEFAULT_START, end: DEFAULT_END },
  monday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
  tuesday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
  wednesday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
  thursday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
  friday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
  saturday: { enabled: true, start: DEFAULT_START, end: DEFAULT_END },
};

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "D4 Media",
  defaultCurrency: "INR",
  dateFormat: "DD/MM/YYYY",
  financialYearStart: "04",
  timezone: "Asia/Kolkata",
  companyProfile: { address: "", phone: "", email: "", website: "", logoUrl: "" },
  leavePolicy: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
  letterSettings: {
    signatureUrl: "",
    sealUrl: "",
    letterheadUrl: "",
    authorizedSignatory: "",
    signatoryDesignation: "",
    footerText: "",
    experienceBody: DEFAULT_LETTER_BODIES.experience,
    appointmentBody: DEFAULT_LETTER_BODIES.appointment,
    relievingBody: DEFAULT_LETTER_BODIES.relieving,
  },
  workingHours: { start: DEFAULT_START, end: DEFAULT_END },
  weeklySchedule: cloneWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE),
  holidays: [],
  lateThresholdMinutes: 15,
  attendanceRules: { fullDayHours: 8, halfDayHours: 4, overtimeAfterHours: 9, locationRequired: false },
  emailNotifications: true,
  whatsappApiKey: "",
  gstNumber: "",
  panNumber: "",
  defaultGstRate: 18,
  invoicePrefix: "INV",
  quotationPrefix: "QTN",
  numberFormats: {
    quotation: "D4-Q-{SEQ:3}",
    estimate: "EST-{COMP}-{YYYY}/{SEQ:3}",
    invoice: "D4-{SEQ:3}",
    receipt: "RCPT-{COMP}/{YYYY}/{SEQ:3}",
  },
};

export function cloneWeeklySchedule(schedule: WeeklySchedule): WeeklySchedule {
  return DAY_KEYS.reduce((acc, key) => {
    acc[key] = { ...schedule[key] };
    return acc;
  }, {} as WeeklySchedule);
}

/**
 * Normalizes a settings document loaded from Firestore, filling in defaults and
 * migrating legacy records that only carried a single `workingHours` value.
 */
export function normalizeSettings(raw?: Partial<AppSettings> | null): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS, weeklySchedule: cloneWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE) };

  const base = raw.workingHours ?? DEFAULT_SETTINGS.workingHours;
  const schedule: WeeklySchedule = cloneWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);

  // Seed from legacy single working-hours value so existing data keeps working.
  for (const key of DAY_KEYS) {
    schedule[key] = {
      ...schedule[key],
      start: base.start ?? schedule[key].start,
      end: base.end ?? schedule[key].end,
    };
  }

  // Apply any saved per-day overrides.
  if (raw.weeklySchedule) {
    for (const key of DAY_KEYS) {
      const day = raw.weeklySchedule[key];
      if (day) schedule[key] = { ...schedule[key], ...day };
    }
  }

  const numberFormats = { ...DEFAULT_SETTINGS.numberFormats, ...(raw.numberFormats ?? {}) };
  // ponytail: auto-upgrade the legacy hardcoded invoice format to the D4 series so
  // existing settings docs pick it up without a manual edit. Custom formats are kept.
  if (numberFormats.invoice === "INV-{COMP}/{YYYY}/{SEQ:3}") {
    numberFormats.invoice = DEFAULT_SETTINGS.numberFormats.invoice;
  }
  // ponytail: same auto-upgrade for the legacy quotation format -> clean D4-Q series.
  if (numberFormats.quotation === "QTN-{COMP}/{YYYY}/{SEQ:3}") {
    numberFormats.quotation = DEFAULT_SETTINGS.numberFormats.quotation;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    companyProfile: { ...DEFAULT_SETTINGS.companyProfile, ...(raw.companyProfile ?? {}) },
    leavePolicy: { ...DEFAULT_SETTINGS.leavePolicy, ...(raw.leavePolicy ?? {}) },
    letterSettings: { ...DEFAULT_SETTINGS.letterSettings, ...(raw.letterSettings ?? {}) },
    workingHours: { ...DEFAULT_SETTINGS.workingHours, ...(raw.workingHours ?? {}) },
    attendanceRules: { ...DEFAULT_SETTINGS.attendanceRules, ...(raw.attendanceRules ?? {}) },
    numberFormats,
    holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
    weeklySchedule: schedule,
  };
}

/** Loads and normalizes the singleton app settings document. */
export async function getAppSettings(): Promise<AppSettings> {
  const data = await getDocuments<AppSettings>("settings");
  if (data.length === 0) return normalizeSettings(null);
  return normalizeSettings({ ...data[0], id: data[0].id });
}

export function getDaySchedule(settings: AppSettings, date: Date): DaySchedule {
  return settings.weeklySchedule[DAY_KEYS[date.getDay()]];
}

/** Weekday long-names ("Sunday", ...) that are configured as off days. */
export function weeklyOffDayNames(settings: AppSettings): string[] {
  return DAY_KEYS.filter((k) => !settings.weeklySchedule[k].enabled).map(
    (k) => k.charAt(0).toUpperCase() + k.slice(1)
  );
}

/** Formats a Date as a local "YYYY-MM-DD" key (no timezone shift). */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Returns the matching holiday for a date, or null. Accepts a Date or "YYYY-MM-DD".
 * When `companyId` is supplied, only global holidays (no companyId) and holidays
 * for that company are considered.
 */
export function getHoliday(
  settings: AppSettings,
  date: Date | string,
  companyId?: string
): Holiday | null {
  const key = typeof date === "string" ? date : dateKey(date);
  return (
    settings.holidays.find(
      (h) => h.date === key && (!h.companyId || h.companyId === companyId)
    ) ?? null
  );
}

/** A day is "off" when it is a weekly off OR a configured holiday. */
export function isNonWorkingDay(settings: AppSettings, date: Date, companyId?: string): boolean {
  return !getDaySchedule(settings, date).enabled || getHoliday(settings, date, companyId) !== null;
}

/** Converts "HH:mm" into minutes since midnight. Returns null on bad input. */
export function timeToMinutes(time?: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export interface CheckInEvaluation {
  isOff: boolean;
  isLate: boolean;
  scheduledStart: string;
  graceMinutes: number;
  holiday: Holiday | null;
}

/** Evaluates a check-in against the configured schedule for that day. A shift,
 * when supplied, overrides the day's start time and grace window. */
export function evaluateCheckIn(
  settings: AppSettings,
  when: Date,
  shift?: Shift | null,
  companyId?: string
): CheckInEvaluation {
  const day = getDaySchedule(settings, when);
  const holiday = getHoliday(settings, when, companyId);
  const isOff = !day.enabled || holiday !== null;
  const start = shift?.startTime ?? day.start;
  const grace = shift ? shift.graceMinutes ?? 0 : settings.lateThresholdMinutes ?? 0;
  const scheduledStart = timeToMinutes(start);
  const checkInMinutes = when.getHours() * 60 + when.getMinutes();
  const isLate =
    !isOff && scheduledStart !== null && checkInMinutes > scheduledStart + grace;

  return {
    isOff,
    isLate,
    scheduledStart: start,
    graceMinutes: grace,
    holiday,
  };
}

export interface CheckOutEvaluation {
  isEarlyDeparture: boolean;
  scheduledEnd: string;
}

/** Evaluates a check-out against the configured schedule for that day. A shift,
 * when supplied, overrides the day's end time. */
export function evaluateCheckOut(settings: AppSettings, when: Date, shift?: Shift | null): CheckOutEvaluation {
  const day = getDaySchedule(settings, when);
  const end = shift?.endTime ?? day.end;
  const scheduledEnd = timeToMinutes(end);
  const checkOutMinutes = when.getHours() * 60 + when.getMinutes();
  const isEarlyDeparture =
    day.enabled && scheduledEnd !== null && checkOutMinutes < scheduledEnd;

  return { isEarlyDeparture, scheduledEnd: end };
}

/**
 * Derives the attendance status from hours worked using the configured
 * half-day / full-day thresholds. Returns "present", "half-day", or "absent".
 */
export function resolveAttendanceStatus(
  settings: AppSettings,
  workingHours: number
): "present" | "half-day" | "absent" {
  const { fullDayHours, halfDayHours } = settings.attendanceRules;
  if (workingHours >= fullDayHours) return "present";
  if (workingHours >= halfDayHours) return "half-day";
  return "absent";
}

/** Overtime hours earned for a given amount of working hours (rounded to 0.1h). */
export function calculateOvertime(settings: AppSettings, workingHours: number): number {
  const threshold = settings.attendanceRules.overtimeAfterHours;
  if (!threshold || workingHours <= threshold) return 0;
  return Math.round((workingHours - threshold) * 10) / 10;
}

export interface WorkSummary {
  workingHours: number;
  status: "present" | "half-day" | "absent";
  overtimeHours: number;
}

/**
 * Derives the working hours, status and overtime for a completed day from the
 * check-in / check-out timestamps (in milliseconds).
 */
export function evaluateWorkSummary(
  settings: AppSettings,
  checkInMs: number,
  checkOutMs: number
): WorkSummary {
  const rawHours = Math.max(0, (checkOutMs - checkInMs) / (1000 * 60 * 60));
  const workingHours = Math.round(rawHours * 100) / 100;
  return {
    workingHours,
    status: resolveAttendanceStatus(settings, workingHours),
    overtimeHours: calculateOvertime(settings, workingHours),
  };
}

