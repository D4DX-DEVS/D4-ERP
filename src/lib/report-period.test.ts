import { describe, it, expect } from "vitest";
import { reportInRange, rangeLabel, formatRangeDate } from "@/lib/report-period";
import type { DepartmentReport } from "@/types";

function report(over: Partial<DepartmentReport> = {}): DepartmentReport {
  return { startDate: "2026-09-01", endDate: "2026-09-30", ...over } as DepartmentReport;
}

describe("reportInRange", () => {
  it("keeps a filing whose period sits inside the range", () => {
    expect(reportInRange(report(), { from: "2026-09-01", to: "2026-09-30" })).toBe(true);
  });

  it("keeps a filing that merely overlaps, so a quarter counts for a month asked about", () => {
    const quarter = report({ startDate: "2026-07-01", endDate: "2026-09-30" });
    expect(reportInRange(quarter, { from: "2026-09-01", to: "2026-09-30" })).toBe(true);
  });

  it("drops a filing that ends before the range opens", () => {
    const august = report({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(reportInRange(august, { from: "2026-09-01", to: "2026-09-30" })).toBe(false);
  });

  it("drops a filing that starts after the range closes", () => {
    const october = report({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(reportInRange(october, { from: "2026-09-01", to: "2026-09-30" })).toBe(false);
  });

  it("treats a blank bound as open-ended", () => {
    expect(reportInRange(report(), { from: "", to: "" })).toBe(true);
    expect(reportInRange(report(), { from: "2026-09-15", to: "" })).toBe(true);
    const january = report({ startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(reportInRange(january, { from: "2026-09-15", to: "" })).toBe(false);
  });

  it("falls back to the start date when a filing has no end date", () => {
    const oneDay = report({ startDate: "2026-09-21", endDate: "" });
    expect(reportInRange(oneDay, { from: "2026-09-21", to: "2026-09-21" })).toBe(true);
    expect(reportInRange(oneDay, { from: "2026-09-22", to: "2026-09-30" })).toBe(false);
  });
});

describe("rangeLabel", () => {
  it("reads as a period, not as two fields", () => {
    expect(rangeLabel({ from: "2026-09-01", to: "2026-09-30" })).toBe("1 Sep 2026 \u2013 30 Sep 2026");
  });

  it("names an open range for what it is", () => {
    expect(rangeLabel({ from: "", to: "" })).toBe("All periods");
    expect(rangeLabel({ from: "2026-09-01", to: "" })).toBe("From 1 Sep 2026");
    expect(rangeLabel({ from: "", to: "2026-09-30" })).toBe("Up to 30 Sep 2026");
  });

  it("leaves an unparseable date as typed rather than inventing one", () => {
    expect(formatRangeDate("not-a-date")).toBe("not-a-date");
  });
});
