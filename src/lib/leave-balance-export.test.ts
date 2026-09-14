import { describe, it, expect } from "vitest";
import { computeLeaveLedger } from "@/lib/leave-ledger";
import { leaveBalanceExportRows } from "@/lib/leave-balance-export";
import { Timestamp } from "@/lib/firestore";
import type { LeaveLedger, EmploymentGroupSection } from "@/lib/leave-ledger";
import type { StaffRequest, Staff } from "@/types";

const YEAR = 2026;
const QUOTA = { casualLeave: 12, sickLeave: 12, earnedLeave: 15 };
const MAR = 2;

function ts(date: string): Timestamp {
  return Timestamp.fromDate(new Date(`${date}T00:00:00`));
}

function leave(leaveType: StaffRequest["leaveType"], start: string, end = start): StaffRequest {
  return {
    staffId: "s1",
    type: "leave",
    leaveType,
    startDate: ts(start),
    endDate: ts(end),
    reason: "test",
    status: "approved",
  } as StaffRequest;
}

function ledgerWith(requests: StaffRequest[]): LeaveLedger {
  return computeLeaveLedger({
    requests,
    adjustments: [],
    sundayDuties: [],
    quota: QUOTA,
    year: YEAR,
    allowNegative: false,
  });
}

const STAFF = {
  id: "s1",
  firstName: "Ranthees",
  lastName: "K",
  employeeCode: "D4-001",
  designation: "Editor",
  departmentId: "d1",
} as Staff;

function sectionsWith(ledger: LeaveLedger): EmploymentGroupSection<{ staff: Staff; ledger: LeaveLedger }>[] {
  return [{ title: "PERMANENT", rows: [{ staff: STAFF, ledger }] }];
}

const DEPARTMENTS = [{ id: "d1", name: "Production" }];

describe("leaveBalanceExportRows — identity columns", () => {
  it("names the group, the person and their department in both modes", () => {
    const sections = sectionsWith(ledgerWith([leave("CL", "2026-03-02")]));

    for (const month of [null, MAR]) {
      const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month });
      expect(row.Group).toBe("PERMANENT");
      expect(row.Code).toBe("D4-001");
      expect(row.Name).toBe("Ranthees K");
      expect(row.Designation).toBe("Editor");
      expect(row.Section).toBe("Production");
    }
  });

  it("leaves the department blank when the staff member has none on file", () => {
    const sections = sectionsWith(ledgerWith([]));
    sections[0].rows[0] = { staff: { ...STAFF, departmentId: "gone" } as Staff, ledger: ledgerWith([]) };
    const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: null });
    expect(row.Section).toBe("");
  });
});

describe("leaveBalanceExportRows — year mode", () => {
  it("writes the yearly blocks and the full month-wise breakdown", () => {
    const sections = sectionsWith(ledgerWith([leave("CL", "2026-03-02", "2026-03-04")]));
    const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: null });

    expect(row["Current CL"]).toBe(12);
    expect(row["Used CL"]).toBe(3);
    expect(row["Balance CL"]).toBe(9);
    expect(row["MAR CL"]).toBe(3);
    expect(row["FEB CL"]).toBe(0);
    expect(row["MAR Total"]).toBe(3);
    expect(row["Total Leave Days"]).toBe(3);
  });

  it("carries no month column of its own", () => {
    const sections = sectionsWith(ledgerWith([]));
    const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: null });
    expect(row.Month).toBeUndefined();
  });
});

describe("leaveBalanceExportRows — month mode", () => {
  it("writes days taken in the month and the balance at its close", () => {
    const sections = sectionsWith(
      ledgerWith([leave("CL", "2026-03-02", "2026-03-04"), leave("CL", "2026-11-09")])
    );
    const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: MAR });

    expect(row.Month).toBe("MAR");
    expect(row["Taken CL"]).toBe(3);
    expect(row["Remaining CL"]).toBe(9);
    expect(row["Taken EL"]).toBe(0);
    expect(row["Remaining EL"]).toBe(15);
    expect(row.Total).toBe(3);
  });

  it("drops the twelve-month block that only the year export needs", () => {
    const sections = sectionsWith(ledgerWith([leave("CL", "2026-03-02")]));
    const [row] = leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: MAR });

    expect(row["MAR CL"]).toBeUndefined();
    expect(row["Total Leave Days"]).toBeUndefined();
    expect(row["Balance CL"]).toBeUndefined();
  });
});

describe("leaveBalanceExportRows — shape", () => {
  it("returns one row per staff member across every section", () => {
    const ledger = ledgerWith([]);
    const sections: EmploymentGroupSection<{ staff: Staff; ledger: LeaveLedger }>[] = [
      { title: "PERMANENT", rows: [{ staff: STAFF, ledger }] },
      {
        title: "INTERNS",
        rows: [
          { staff: { ...STAFF, id: "s2", firstName: "Aslam" } as Staff, ledger },
          { staff: { ...STAFF, id: "s3", firstName: "Noushad" } as Staff, ledger },
        ],
      },
    ];

    expect(leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: null })).toHaveLength(3);
    expect(leaveBalanceExportRows({ sections, departments: DEPARTMENTS, month: MAR })).toHaveLength(3);
  });

  it("returns nothing for no sections", () => {
    expect(leaveBalanceExportRows({ sections: [], departments: DEPARTMENTS, month: null })).toEqual([]);
  });
});
