import { describe, it, expect } from "vitest";
import {
  reportingStatus,
  defaultSelections,
  buildMasterReport,
  weekRangeOf,
  monthRangeOf,
  titleFor,
} from "@/lib/organization-report";
import type { DepartmentReport, ReportAutoMetrics } from "@/types";

const DEPARTMENTS = [
  { id: "d1", name: "HR" },
  { id: "d2", name: "Finance" },
  { id: "d3", name: "Operations" },
];

function metrics(over: Partial<ReportAutoMetrics> = {}): ReportAutoMetrics {
  return {
    attendance: { presentRate: 90, lateRate: 5, absentRate: 5, totalDays: 6 },
    tasks: { total: 10, completed: 7, inProgress: 2, overdue: 1, completionRate: 70 },
    leaves: { approved: 1, pending: 0, rejected: 0, byType: {} },
    workLogs: { totalHours: 120, avgHoursPerStaff: 30, coverageRate: 80 },
    ...over,
  };
}

function report(over: Partial<DepartmentReport> = {}): DepartmentReport {
  return {
    id: "r1",
    kind: "report",
    departmentId: "d1",
    departmentName: "HR",
    companyId: "c1",
    period: "weekly",
    startDate: "2026-09-21",
    endDate: "2026-09-27",
    autoMetrics: metrics(),
    customKPIs: [],
    status: "submitted",
    generatedBy: "s1",
    ...over,
  } as DepartmentReport;
}

function plan(over: Partial<DepartmentReport> = {}): DepartmentReport {
  return report({ id: "p1", kind: "plan", documentTitle: "HR plan", ...over });
}

const WEEK = { from: "2026-09-21", to: "2026-09-27" };

describe("reportingStatus", () => {
  it("reports one row per department, including the ones that filed nothing", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a" })], WEEK);
    expect(status.rows.map((r) => r.departmentName)).toEqual(["HR", "Finance", "Operations"]);
    expect(status.rows[2].state).toBe("missing");
    expect(status.counts).toMatchObject({ departments: 3, submitted: 1, missing: 2, ready: 1 });
  });

  it("keeps reports and plans in separate columns", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a" }), plan({ id: "b" })], WEEK);
    expect(status.rows[0].reportOptions.map((r) => r.id)).toEqual(["a"]);
    expect(status.rows[0].planOptions.map((r) => r.id)).toEqual(["b"]);
    expect(status.counts.plansReady).toBe(1);
  });

  it("treats a filing with no kind as a report, the way old rows were written", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", kind: undefined })], WEEK);
    expect(status.rows[0].reportOptions).toHaveLength(1);
    expect(status.rows[0].planOptions).toHaveLength(0);
  });

  it("counts a submitted filing as ready — submitting is the last step", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", status: "submitted" })], WEEK);
    expect(status.rows[0].state).toBe("submitted");
    expect(status.counts).toMatchObject({ submitted: 1, ready: 1 });
  });

  it("still admits a filing left over from when documents were published", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", status: "published" })], WEEK);
    expect(status.rows[0].state).toBe("submitted");
    expect(status.rows[0].defaultReportId).toBe("a");
  });

  it("says nothing about a draft — an unsubmitted document is the head's own", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", status: "draft" })], WEEK);
    expect(status.rows[0].state).toBe("missing");
    expect(status.rows[0].planState).toBe("missing");
    expect(status.rows[0].reportOptions).toHaveLength(0);
    // All three departments read as "not submitted", the draft included.
    expect(status.counts).toMatchObject({ ready: 0, missing: 3 });
  });

  it("a rejected filing is not selectable — it was sent back for a reason", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", status: "rejected" })], WEEK);
    expect(status.rows[0].reportOptions).toHaveLength(0);
    expect(status.rows[0].rejected).toBe(1);
    expect(status.counts.ready).toBe(0);
  });

  it("offers every filing a department made in the period, newest first", () => {
    const status = reportingStatus(
      DEPARTMENTS,
      [
        report({ id: "daily", period: "daily", startDate: "2026-09-22", endDate: "2026-09-22" }),
        report({ id: "weekly", period: "weekly", startDate: "2026-09-21", endDate: "2026-09-27" }),
      ],
      WEEK
    );
    expect(status.rows[0].reportOptions.map((o) => o.id)).toEqual(["weekly", "daily"]);
  });

  it("starts on the published filing even when a submitted one is newer", () => {
    const status = reportingStatus(
      DEPARTMENTS,
      [
        report({ id: "pub", status: "published" }),
        report({ id: "sub", status: "submitted", startDate: "2026-09-25", endDate: "2026-09-25", period: "daily" }),
      ],
      WEEK
    );
    expect(status.rows[0].defaultReportId).toBe("pub");
  });

  it("ignores filings outside the period", () => {
    const status = reportingStatus(DEPARTMENTS, [report({ id: "a", startDate: "2026-09-01", endDate: "2026-09-07" })], WEEK);
    expect(status.rows[0].state).toBe("missing");
  });
});

describe("defaultSelections", () => {
  it("pre-selects the report and the plan each department filed", () => {
    const status = reportingStatus(
      DEPARTMENTS,
      [report({ id: "a" }), plan({ id: "b" }), report({ id: "c", departmentId: "d2", departmentName: "Finance" })],
      WEEK
    );
    expect(defaultSelections(status)).toEqual([
      { departmentId: "d1", reportId: "a", planId: "b", order: 0 },
      { departmentId: "d2", reportId: "c", planId: null, order: 1 },
      { departmentId: "d3", reportId: null, planId: null, order: 2 },
    ]);
  });
});

describe("buildMasterReport", () => {
  const goals = [
    { id: "g1", goal: "Hire an editor", owner: "HR", targetDate: "2026-10-02", status: "planned" as const },
    { id: "g2", goal: "Close payroll", owner: "Finance", status: "done" as const },
  ];

  const reports = [
    report({ id: "a" }),
    plan({ id: "ap", planItems: goals }),
    report({
      id: "b",
      departmentId: "d2",
      departmentName: "Finance",
      autoMetrics: metrics({ tasks: { total: 30, completed: 3, inProgress: 7, overdue: 6, completionRate: 10 } }),
    }),
  ];

  const base = {
    period: "weekly" as const,
    range: WEEK,
    departments: DEPARTMENTS,
    reports,
  };

  it("numbers the sections in the order the admin arranged them", () => {
    const master = buildMasterReport({
      ...base,
      selections: [
        { departmentId: "d2", reportId: "b", planId: null, order: 0 },
        { departmentId: "d1", reportId: "a", planId: "ap", order: 1 },
      ],
    });
    expect(master.sections.map((s) => [s.index, s.departmentName])).toEqual([
      [1, "Finance"],
      [2, "HR"],
    ]);
  });

  it("records the departments left out instead of quietly dropping them", () => {
    const master = buildMasterReport({
      ...base,
      selections: [{ departmentId: "d1", reportId: "a", planId: "ap", order: 0 }],
    });
    expect(master.missing.map((m) => m.name)).toEqual(["Finance", "Operations"]);
  });

  it("can carry a department's plan without its report", () => {
    const master = buildMasterReport({
      ...base,
      selections: [{ departmentId: "d1", reportId: null, planId: "ap", order: 0 }],
    });
    expect(master.sections[0].report).toBeUndefined();
    expect(master.sections[0].plan?.id).toBe("ap");
    // The department is still in the document, on the strength of its plan.
    expect(master.totals.departments).toBe(1);
  });

  it("leaves an exempt department out of the did-not-submit list entirely", () => {
    const master = buildMasterReport({
      ...base,
      selections: [{ departmentId: "d1", reportId: "a", planId: null, order: 0 }],
      exemptDepartments: ["d3"],
    });
    // d2 still filed nothing and is still named; d3 was never expected to.
    expect(master.missing.map((m) => m.id)).toEqual(["d2"]);
  });

  it("counts only the departments that made it into the document", () => {
    const master = buildMasterReport({
      ...base,
      selections: [
        { departmentId: "d1", reportId: "a", planId: null, order: 0 },
        { departmentId: "d2", reportId: "b", planId: null, order: 1 },
      ],
    });
    expect(master.totals).toEqual({ departments: 2 });
  });

  it("names itself after the period when no title was typed", () => {
    const master = buildMasterReport({ ...base, selections: [] });
    expect(master.title).toBe("Organization Weekly Report");
    expect(master.periodLabel).toBe("21 Sep 2026 – 27 Sep 2026");
  });

  it("keeps a title the admin typed", () => {
    const master = buildMasterReport({ ...base, title: "Board pack — week 39", selections: [] });
    expect(master.title).toBe("Board pack — week 39");
  });

  it("ignores a selection pointing at a filing that no longer exists", () => {
    const master = buildMasterReport({
      ...base,
      selections: [{ departmentId: "d1", reportId: "gone", planId: "also-gone", order: 0 }],
    });
    expect(master.sections).toHaveLength(0);
    expect(master.missing).toHaveLength(3);
  });
});

describe("period helpers", () => {
  it("weekRangeOf returns the Sunday-to-Saturday week the date falls in", () => {
    expect(weekRangeOf("2026-09-23")).toEqual({ from: "2026-09-20", to: "2026-09-26" });
  });

  it("weekRangeOf keeps a Sunday in its own week", () => {
    expect(weekRangeOf("2026-09-20")).toEqual({ from: "2026-09-20", to: "2026-09-26" });
  });

  it("monthRangeOf spans the whole calendar month", () => {
    expect(monthRangeOf("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("titleFor names the cadence", () => {
    expect(titleFor("weekly")).toBe("Organization Weekly Report");
    expect(titleFor("daily")).toBe("Organization Daily Report");
    expect(titleFor("custom")).toBe("Organization Report");
  });
});
