// ==================== Contract duration & expiry (pure helpers) ====================
// No DB access. Given a staff record's contract type and end date, compute
// the preset end date, days remaining, and warning status. Same shape as
// src/lib/asset-availability.ts.

import type { ContractType } from "@/types";

export const CONTRACT_WARNING_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export interface ContractDuration {
  value: ContractType;
  label: string;
  months: number | null;
}

/** Listed in the order shown in the UI. */
export const CONTRACT_DURATIONS: ContractDuration[] = [
  { value: "3-months", label: "3 Months", months: 3 },
  { value: "4-months", label: "4 Months", months: 4 },
  { value: "6-months", label: "6 Months", months: 6 },
  { value: "12-months", label: "1 Year", months: 12 },
  { value: "24-months", label: "2 Years", months: 24 },
  { value: "36-months", label: "3 Years", months: 36 },
  { value: "permanent", label: "Permanent", months: null },
  { value: "custom", label: "Custom End Date", months: null },
];

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** null = no end date (permanent, or custom with no date chosen yet). */
export function computeContractEndDate(
  start: Date,
  type: ContractType,
  customEnd?: Date
): Date | null {
  if (type === "permanent") return null;
  if (type === "custom") return customEnd ?? null;
  const preset = CONTRACT_DURATIONS.find((d) => d.value === type);
  return preset?.months ? addMonths(start, preset.months) : null;
}

/** Whole days between today and `end`, ignoring time-of-day. Negative = past. */
export function getDaysRemaining(end: Date | null | undefined, today: Date = new Date()): number | null {
  if (!end) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((startOfEnd.getTime() - startOfToday.getTime()) / MS_PER_DAY);
}

export type ContractStatus = "none" | "active" | "expiring-soon" | "expired";

export function getContractStatus(end: Date | null | undefined, today: Date = new Date()): ContractStatus {
  const daysLeft = getDaysRemaining(end, today);
  if (daysLeft == null) return "none";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= CONTRACT_WARNING_DAYS) return "expiring-soon";
  return "active";
}
