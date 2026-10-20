import { describe, expect, it } from "vitest";
import { planImportDay, type ImportDayRow } from "./merge-day";

const row = (id: string, over: Partial<ImportDayRow> = {}): ImportDayRow => ({
  id,
  status: "absent",
  source: "biometric",
  ...over,
});

describe("planImportDay", () => {
  it("creates a row for a day nothing has recorded", () => {
    expect(planImportDay({ rows: [], overwriteExisting: false, hasPunches: false })).toEqual({ kind: "create" });
  });

  it("skips a day it already recorded when not overwriting", () => {
    const rows = [row("imp", { source: "biometric", status: "present" })];
    expect(planImportDay({ rows, overwriteExisting: false, hasPunches: true })).toEqual({ kind: "skip" });
  });

  it("skips a punch-less approved-leave day when not overwriting", () => {
    const rows = [row("lv", { source: "leave", status: "casual-leave", leaveRequestId: "req-1" })];
    expect(planImportDay({ rows, overwriteExisting: false, hasPunches: false })).toEqual({ kind: "skip" });
  });

  it("records punches on an approved-leave day even when not overwriting", () => {
    const rows = [row("lv", { source: "leave", status: "casual-leave", leaveRequestId: "req-1" })];
    expect(planImportDay({ rows, overwriteExisting: false, hasPunches: true })).toEqual({ kind: "create" });
  });

  it("updates its own import row when overwriting", () => {
    const rows = [row("imp", { source: "biometric", status: "week-off" })];
    expect(planImportDay({ rows, overwriteExisting: true, hasPunches: false })).toEqual({ kind: "update", id: "imp" });
  });

  it("never overwrites a day an approved leave claimed", () => {
    // The writeback claims the import's own row in place; a re-import must not
    // put ESSL's "WO" back over the approved leave.
    const rows = [row("imp", { source: "leave", status: "casual-leave", leaveRequestId: "req-1" })];
    expect(planImportDay({ rows, overwriteExisting: true, hasPunches: false })).toEqual({ kind: "skip" });
  });

  it("records real punches on an approved-leave day beside the leave, for someone to review", () => {
    const rows = [row("lv", { source: "leave", status: "casual-leave", leaveRequestId: "req-1" })];
    expect(planImportDay({ rows, overwriteExisting: true, hasPunches: true })).toEqual({ kind: "create" });
  });

  it("never overwrites or shadows a day a person marked by hand", () => {
    for (const source of ["manual", "correction"] as const) {
      const rows = [row("man", { source, status: "present" })];
      expect(planImportDay({ rows, overwriteExisting: true, hasPunches: true })).toEqual({ kind: "skip" });
    }
  });

  it("updates its own row even when a held row sits beside it", () => {
    const rows = [
      row("lv", { source: "leave", status: "casual-leave", leaveRequestId: "req-1" }),
      row("imp", { source: "biometric", status: "absent" }),
    ];
    expect(planImportDay({ rows, overwriteExisting: true, hasPunches: false })).toEqual({ kind: "update", id: "imp" });
  });

  it("ignores soft-deleted rows", () => {
    const rows = [row("old", { isDeleted: true, source: "manual" })];
    expect(planImportDay({ rows, overwriteExisting: false, hasPunches: false })).toEqual({ kind: "create" });
  });
});
