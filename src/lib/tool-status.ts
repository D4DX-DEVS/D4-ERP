// ==================== Tools & Accounts derived state ====================
// Status, spend and health are computed from the stored dates rather than saved
// as a field, so a subscription can never sit in the list showing "active" a
// month after it lapsed. Pure and dependency-free: the page, the summary cards
// and the tests all read the same rules.

import type { CompanyTool, ToolSecurityFlag, ToolStatus } from "@/types";

const DAY_MS = 86_400_000;

/** A renewal this many days out (or nearer) counts as expiring soon. */
export const EXPIRING_SOON_DAYS = 30;

/** A password unchanged for this long is flagged for rotation. */
export const STALE_PASSWORD_DAYS = 365;

/** Cycles multiplied out to a yearly figure. One-time purchases are not recurring spend. */
const CYCLE_PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  "one-time": 0,
};

/** Dates arrive as `{ seconds }` from /api/db, but may be a Date or ISO string in forms. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const seconds = (value as { seconds?: unknown }).seconds;
  if (typeof seconds === "number") return new Date(seconds * 1000);
  return null;
}

/** Midnight UTC of the given date — dates are stored as UTC midnight by the date picker. */
function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

/** Whole days until renewal — negative once it has passed, null when no date is set. */
export function daysUntilRenewal(tool: CompanyTool, now: Date = new Date()): number | null {
  const renewal = toDate(tool.renewalDate);
  return renewal ? daysBetween(now, renewal) : null;
}

/** Days since the credential was last rotated, or null when it has never been recorded. */
export function daysSincePasswordChange(tool: CompanyTool, now: Date = new Date()): number | null {
  const changed = toDate(tool.lastPasswordChangedAt);
  return changed ? daysBetween(changed, now) : null;
}

/** Live status of a subscription, derived from its renewal date. */
export function toolStatus(tool: CompanyTool, now: Date = new Date()): ToolStatus {
  if (tool.cancelled) return "cancelled";
  const days = daysUntilRenewal(tool, now);
  if (days === null) return "active";
  if (days < 0) return "expired";
  return days <= EXPIRING_SOON_DAYS ? "expiring" : "active";
}

/** Yearly run-rate for a subscription. Cancelled and one-time entries contribute nothing. */
export function annualCost(tool: CompanyTool): number {
  if (tool.cancelled) return 0;
  const cost = Number(tool.cost) || 0;
  const multiplier = CYCLE_PER_YEAR[tool.billingCycle ?? "yearly"] ?? 1;
  return cost * multiplier;
}

export interface SeatUsage {
  total: number;
  used: number;
  free: number;
  pct: number;
}

/** Seat utilisation, or null when the tool does not track seats. */
export function seatUsage(tool: CompanyTool): SeatUsage | null {
  const total = Number(tool.seatsTotal) || 0;
  if (total <= 0) return null;
  const used = Math.max(Number(tool.seatsUsed) || 0, 0);
  return {
    total,
    used,
    free: Math.max(total - used, 0),
    pct: Math.min(Math.round((used / total) * 100), 100),
  };
}

/** Health problems worth showing next to a tool. Empty for a healthy or cancelled entry. */
export function toolSecurityFlags(tool: CompanyTool, now: Date = new Date()): ToolSecurityFlag[] {
  if (tool.cancelled) return [];
  const flags: ToolSecurityFlag[] = [];

  if (toolStatus(tool, now) === "expired") {
    flags.push({ key: "expired", label: "Subscription has expired" });
  }
  if (tool.hasCredentials && !tool.twoFactorEnabled) {
    flags.push({ key: "no-2fa", label: "Two-factor authentication is off" });
  }
  if (tool.hasCredentials) {
    const age = daysSincePasswordChange(tool, now);
    if (age !== null && age > STALE_PASSWORD_DAYS) {
      flags.push({ key: "stale-password", label: `Password unchanged for ${Math.floor(age / 30)} months` });
    }
  }
  if (!tool.ownerStaffId) {
    flags.push({ key: "no-owner", label: "No owner assigned" });
  }
  if (!toDate(tool.renewalDate) && (CYCLE_PER_YEAR[tool.billingCycle ?? "yearly"] ?? 1) > 0) {
    flags.push({ key: "no-renewal-date", label: "Recurring plan with no renewal date" });
  }
  return flags;
}

/** Tailwind classes + copy for a status badge. */
export function toolStatusBadge(status: ToolStatus): { label: string; className: string } {
  switch (status) {
    case "expiring":
      return { label: "Expiring soon", className: "bg-amber-100 text-amber-800" };
    case "expired":
      return { label: "Expired", className: "bg-red-100 text-red-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-gray-100 text-gray-700" };
    default:
      return { label: "Active", className: "bg-green-100 text-green-800" };
  }
}

/** Human-readable renewal countdown for a row or detail header. */
export function renewalLabel(tool: CompanyTool, now: Date = new Date()): string {
  const days = daysUntilRenewal(tool, now);
  if (days === null) return "No renewal date";
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Renews today";
  return `Renews in ${days} day${days === 1 ? "" : "s"}`;
}
