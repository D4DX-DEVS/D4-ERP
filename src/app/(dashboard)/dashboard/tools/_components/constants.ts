import type { ToolBillingCycle, ToolLoginMethod } from "@/types";

/** Categories a company subscription can fall under. Free text is not allowed — a fixed
 *  list keeps the category filter and the spend breakdown meaningful. */
export const TOOL_CATEGORIES = [
  "Video Editing",
  "Design",
  "AI",
  "Development",
  "Marketing",
  "Storage & Backup",
  "Communication",
  "Productivity",
  "Hosting & Domains",
  "Accounting & Finance",
  "Analytics",
  "Security",
  "Other",
] as const;

export const CATEGORY_OPTIONS: { value: string; label: string }[] = TOOL_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}));

export const BILLING_CYCLE_OPTIONS: { value: ToolBillingCycle; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "one-time", label: "One-time purchase" },
];

export const LOGIN_METHOD_OPTIONS: { value: ToolLoginMethod; label: string }[] = [
  { value: "email-password", label: "Email & password" },
  { value: "google", label: "Sign in with Google" },
  { value: "microsoft", label: "Sign in with Microsoft" },
  { value: "sso", label: "Company SSO" },
  { value: "api-key", label: "API key" },
  { value: "other", label: "Other" },
];

export const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All tools" },
  { value: "expiring", label: "Expiring in 30 days" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

/** Midnight UTC today — stored dates are UTC midnight, so day comparisons line up. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** `YYYY-MM-DD` for a date picker, from the `{ seconds }` shape /api/db returns. */
export function toDateInput(value: unknown): string {
  if (!value) return "";
  const seconds = (value as { seconds?: number }).seconds;
  const date = typeof seconds === "number" ? new Date(seconds * 1000) : new Date(value as string);
  return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
