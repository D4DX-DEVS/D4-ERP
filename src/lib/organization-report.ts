// ==================== Organization (master) report assembly ====================
// Six department heads file for a period; the admin decides which of those
// filings become the organization's report for that period, in what order, and
// with or without each department's plan. These are the pure rules behind that
// decision — no React, no Mongo — so the arithmetic and the "who hasn't filed"
// question can be tested on their own and reused by the PDF renderer.

import { rangeLabel, reportInRange, type PeriodRange as Range } from "@/lib/report-period";
import type { DepartmentReport, ReportKind, ReportPeriod } from "@/types";

/** Rows written before plans became their own document are reports. */
function kindOf(report: DepartmentReport): ReportKind {
  return report.kind ?? "report";
}

export type PeriodRange = Range;

export interface DepartmentRef {
  id: string;
  name: string;
}

/**
 * Statuses a filing must be in before it can go into a master report: sent to
 * the admin, whether or not they have approved it yet (`published` is the
 * older name for approved).
 */
const SELECTABLE = new Set(["submitted", "approved", "published"]);

/**
 * How a department stands for the period: they submitted, or they did not.
 * There is deliberately no "draft" state — an unsubmitted document is the
 * head's own business. Approval is shown on the filing itself.
 */
export type ReportingState = "submitted" | "missing";

export interface ReportingRow {
  departmentId: string;
  departmentName: string;
  /** Report documents in the period that may be chosen, newest first. */
  reportOptions: DepartmentReport[];
  /** Plan documents in the period, same rules. */
  planOptions: DepartmentReport[];
  /** Filings the admin sent back and the head has not resubmitted. */
  rejected: number;
  /** The department's report state; its plan is tracked separately. */
  state: ReportingState;
  planState: ReportingState;
  /** Where the builder starts: the newest filing of that kind. */
  defaultReportId: string | null;
  defaultPlanId: string | null;
}

export interface ReportingStatus {
  range: PeriodRange;
  rows: ReportingRow[];
  counts: {
    departments: number;
    submitted: number;
    missing: number;
    /** Departments with a report that could go into the master document. */
    ready: number;
    /** Departments with a plan that could go into it. */
    plansReady: number;
  };
}

/** Newest period first; a tie falls back to the later start date. */
function byNewest(a: DepartmentReport, b: DepartmentReport): number {
  const end = (b.endDate || "").localeCompare(a.endDate || "");
  return end !== 0 ? end : (b.startDate || "").localeCompare(a.startDate || "");
}

/**
 * Who has filed what for this period — the question the admin asks before
 * assembling anything, and the one a blind "combine everything" never answers.
 */
export function reportingStatus(
  departments: DepartmentRef[],
  reports: DepartmentReport[],
  range: PeriodRange
): ReportingStatus {
  const inPeriod = reports.filter((r) => reportInRange(r, range));

  const rows: ReportingRow[] = departments.map((department) => {
    const mine = inPeriod.filter((r) => String(r.departmentId) === String(department.id));
    const selectable = mine.filter((r) => SELECTABLE.has(r.status)).sort(byNewest);
    const reportOptions = selectable.filter((r) => kindOf(r) === "report");
    const planOptions = selectable.filter((r) => kindOf(r) === "plan");
    const rejected = mine.filter((r) => r.status === "rejected").length;

    // Options are already newest-first, so the latest filing is the default.
    const chosenReport = reportOptions[0] ?? null;
    const chosenPlan = planOptions[0] ?? null;

    const stateOf = (chosen: DepartmentReport | null): ReportingState =>
      chosen ? "submitted" : "missing";

    return {
      departmentId: department.id,
      departmentName: department.name,
      reportOptions,
      planOptions,
      rejected,
      state: stateOf(chosenReport),
      planState: stateOf(chosenPlan),
      defaultReportId: chosenReport?.id ?? null,
      defaultPlanId: chosenPlan?.id ?? null,
    };
  });

  return {
    range,
    rows,
    counts: {
      departments: rows.length,
      submitted: rows.filter((r) => r.state === "submitted").length,
      missing: rows.filter((r) => r.state === "missing").length,
      ready: rows.filter((r) => r.defaultReportId).length,
      plansReady: rows.filter((r) => r.defaultPlanId).length,
    },
  };
}

export interface SectionSelection {
  departmentId: string;
  /** The report document to print, or null to leave the report out. */
  reportId: string | null;
  /** The plan document to print, or null to leave the plan out. */
  planId: string | null;
  order: number;
}

/** Everything that filed is in by default; the admin unticks what they don't want. */
export function defaultSelections(status: ReportingStatus): SectionSelection[] {
  return status.rows.map((row, order) => ({
    departmentId: row.departmentId,
    reportId: row.defaultReportId,
    planId: row.defaultPlanId,
    order,
  }));
}

export interface MasterSection {
  /** 1-based, the number printed beside the department in the document. */
  index: number;
  departmentId: string;
  departmentName: string;
  /** The department's report document, when the admin included it. */
  report?: DepartmentReport;
  /** The department's plan document, when the admin included it. */
  plan?: DepartmentReport;
}

export interface MasterReport {
  title: string;
  period: ReportPeriod | "custom";
  range: PeriodRange;
  periodLabel: string;
  executiveSummary: string;
  closingNote: string;
  sections: MasterSection[];
  /** Departments that are not in the document, whatever the reason. */
  missing: DepartmentRef[];
  totals: {
    /** How many departments the document actually speaks for. */
    departments: number;
  };
}

const PERIOD_WORD: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Annual",
};

/** "Organization Weekly Report" — the default name for a period's master report. */
export function titleFor(period: ReportPeriod | "custom"): string {
  const word = PERIOD_WORD[period];
  return word ? `Organization ${word} Report` : "Organization Report";
}

export interface BuildMasterInput {
  title?: string;
  period: ReportPeriod | "custom";
  range: PeriodRange;
  departments: DepartmentRef[];
  reports: DepartmentReport[];
  selections: SectionSelection[];
  executiveSummary?: string;
  closingNote?: string;
  /**
   * Departments the admin unticked from the "did not submit" list. Not every
   * department is a reporting one — Administration and Management may never
   * file — and naming them as silent would be an accusation rather than a fact.
   */
  exemptDepartments?: string[];
}

/**
 * Turns the admin's choices into the document model the preview and the PDF
 * both render. It collates rather than rewrites: each department's filing is
 * carried through whole, in the admin's chosen order, and the departments that
 * filed nothing are named instead of quietly dropped.
 */
export function buildMasterReport(input: BuildMasterInput): MasterReport {
  const byId = new Map(input.reports.map((r) => [r.id, r]));
  const nameOf = new Map(input.departments.map((d) => [String(d.id), d.name]));

  const sections: MasterSection[] = [];
  for (const selection of [...input.selections].sort((a, b) => a.order - b.order)) {
    // A selection can outlive the filing it points at (deleted, or filtered out
    // by a narrowed range) - skip it rather than printing an empty section.
    const report = selection.reportId ? byId.get(selection.reportId) : undefined;
    const plan = selection.planId ? byId.get(selection.planId) : undefined;
    if (!report && !plan) continue;

    sections.push({
      index: sections.length + 1,
      departmentId: selection.departmentId,
      departmentName:
        nameOf.get(String(selection.departmentId)) ?? report?.departmentName ?? plan?.departmentName ?? "",
      report,
      plan,
    });
  }

  const included = new Set(sections.map((s) => String(s.departmentId)));
  const exempt = new Set((input.exemptDepartments ?? []).map(String));
  const missing = input.departments.filter((d) => !included.has(String(d.id)) && !exempt.has(String(d.id)));

  return {
    title: input.title?.trim() || titleFor(input.period),
    period: input.period,
    range: input.range,
    periodLabel: rangeLabel(input.range),
    executiveSummary: (input.executiveSummary ?? "").trim(),
    closingNote: (input.closingNote ?? "").trim(),
    sections,
    missing,
    totals: { departments: sections.length },
  };
}

// ==================== Period presets ====================

function iso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parse(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** The Sunday-to-Saturday week a date falls in, matching getPeriodRange(). */
export function weekRangeOf(dateISO: string): PeriodRange {
  const date = parse(dateISO);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: iso(start), to: iso(end) };
}

export function monthRangeOf(dateISO: string): PeriodRange {
  const date = parse(dateISO);
  return {
    from: iso(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: iso(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

export function dayRangeOf(dateISO: string): PeriodRange {
  return { from: dateISO, to: dateISO };
}

/** Quick picks offered above the date fields, newest period first. */
export function periodPresets(todayISO: string): { key: ReportPeriod | "custom"; label: string; range: PeriodRange }[] {
  const today = parse(todayISO);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  return [
    { key: "daily", label: "Today", range: dayRangeOf(todayISO) },
    { key: "weekly", label: "This week", range: weekRangeOf(todayISO) },
    { key: "weekly", label: "Last week", range: weekRangeOf(iso(lastWeek)) },
    { key: "monthly", label: "This month", range: monthRangeOf(todayISO) },
    { key: "monthly", label: "Last month", range: monthRangeOf(iso(lastMonth)) },
  ];
}
