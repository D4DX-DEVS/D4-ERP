import { describe, expect, it } from "vitest";
import { groupStaffForSheet, type SheetStaffEntry } from "./attendance-sheet";

const entry = (over: Partial<SheetStaffEntry>): SheetStaffEntry => ({
  name: "Ahmed Jasim",
  empCode: "D4P-101",
  dept: "D4 Productions",
  cells: [],
  ...over,
});

describe("groupStaffForSheet", () => {
  it("splits permanent and non-permanent staff into PERMANENT / CONTRACT sections", () => {
    const sections = groupStaffForSheet([
      entry({ empCode: "D4P-101", employmentType: "permanent" }),
      entry({ empCode: "D4A-102", employmentType: "staff" }),
      entry({ empCode: "INT-107", employmentType: "intern" }),
    ]);
    expect(sections.map((s) => s.title)).toEqual(["PERMANENT", "CONTRACT"]);
    expect(sections[0].rows.map((r) => r.empCode)).toEqual(["D4P-101"]);
    expect(sections[1].rows.map((r) => r.empCode)).toEqual(["D4A-102", "INT-107"]);
  });

  it("treats a missing employmentType as permanent", () => {
    const sections = groupStaffForSheet([entry({ employmentType: undefined })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("PERMANENT");
  });

  it("drops empty sections", () => {
    const sections = groupStaffForSheet([entry({ employmentType: "intern" })]);
    expect(sections.map((s) => s.title)).toEqual(["CONTRACT"]);
  });

  it("sorts each section by employee code with numeric ordering", () => {
    const sections = groupStaffForSheet([
      entry({ empCode: "D4P-110", employmentType: "permanent" }),
      entry({ empCode: "D4P-102", employmentType: "permanent" }),
      entry({ empCode: "D4E-100", employmentType: "permanent" }),
    ]);
    expect(sections[0].rows.map((r) => r.empCode)).toEqual(["D4E-100", "D4P-102", "D4P-110"]);
  });

  it("returns nothing for an empty roster", () => {
    expect(groupStaffForSheet([])).toEqual([]);
  });
});
