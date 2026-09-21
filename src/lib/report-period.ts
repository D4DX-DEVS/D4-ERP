// ==================== Reporting period helpers ====================
// Small, shared rules about the period a filing covers: does it fall inside the
// range being asked about, and how is that range written on a document.

import type { DepartmentReport } from "@/types";

/** Inclusive YYYY-MM-DD bounds. A blank bound means "open in that direction". */
export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * True when the filing's own period overlaps the asked-for range at all.
 *
 * Overlap, not containment: a quarterly report covering Jul-Sep is part of the
 * answer to "what happened in September", and demanding containment would
 * silently drop it.
 */
export function reportInRange(report: DepartmentReport, range: PeriodRange): boolean {
  const start = report.startDate || "";
  const end = report.endDate || start;
  if (range.from && end && end < range.from) return false;
  if (range.to && start && start > range.to) return false;
  return true;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Sep 2026" from a YYYY-MM-DD string, without dragging a locale in. */
export function formatRangeDate(value: string): string {
  const [year, month, day] = (value || "").split("-").map(Number);
  if (!year || !month || !day) return value || "";
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Title line for a document covering the range, open-ended cases included. */
export function rangeLabel(range: PeriodRange): string {
  if (range.from && range.to) return `${formatRangeDate(range.from)} \u2013 ${formatRangeDate(range.to)}`;
  if (range.from) return `From ${formatRangeDate(range.from)}`;
  if (range.to) return `Up to ${formatRangeDate(range.to)}`;
  return "All periods";
}
