// ==================== Leave balance CSV rows (pure) ====================
// The balances page exports every staff member matching the current filters,
// not just the page on screen, and the columns follow whichever view the admin
// is looking at:
//
//   year mode  — the printed sheet's shape: identity, the BALANCE / CURRENT /
//                USED blocks, the counters, then all twelve months crossed with
//                the four buckets and OD. Wide, but it is the archive copy.
//   month mode — the same identity columns, then what the screen shows for that
//                one month: days taken and the balance at its close.
//
// Pure, and out of the page component, so the column contract is tested rather
// than eyeballed in a spreadsheet after the fact.

import {
  LEAVE_BUCKETS,
  MONTH_LABELS,
  ledgerBucket,
  type EmploymentGroupSection,
  type LeaveLedger,
} from "@/lib/leave-ledger";
import { monthViewRow } from "@/lib/leave-month-view";
import type { Staff } from "@/types";

/** The slice of a ledger row the export needs: who, and their numbers. */
export interface LeaveExportRow {
  staff: Staff;
  ledger: LeaveLedger;
}

export interface LeaveBalanceExportInput {
  sections: EmploymentGroupSection<LeaveExportRow>[];
  departments: { id?: string; name: string }[];
  /** A month index to scope the columns to, or null for the full year. */
  month: number | null;
}

type CsvRow = Record<string, string | number>;

function identity(
  section: EmploymentGroupSection<LeaveExportRow>,
  row: LeaveExportRow,
  departments: LeaveBalanceExportInput["departments"]
): CsvRow {
  return {
    Group: section.title,
    Code: row.staff.employeeCode ?? "",
    Name: `${row.staff.firstName} ${row.staff.lastName}`,
    Designation: row.staff.designation ?? "",
    Section: departments.find((d) => d.id === row.staff.departmentId)?.name ?? "",
  };
}

function yearColumns(ledger: LeaveLedger): CsvRow {
  const base: CsvRow = {};
  for (const code of LEAVE_BUCKETS) base[`Balance ${code}`] = ledgerBucket(ledger, code).balance;
  for (const code of LEAVE_BUCKETS) base[`Current ${code}`] = ledgerBucket(ledger, code).entitled;
  for (const code of LEAVE_BUCKETS) base[`Used ${code}`] = ledgerBucket(ledger, code).used;
  base.OD = ledger.onDuty.total;
  base["Overtime Hours"] = ledger.overtime.hours;
  base["Week-offs Worked"] = ledger.sundays.worked;
  base["Week-offs Converted"] = ledger.sundays.converted;
  MONTH_LABELS.forEach((label, i) => {
    for (const code of LEAVE_BUCKETS) base[`${label} ${code}`] = ledgerBucket(ledger, code).monthly[i];
    base[`${label} OD`] = ledger.onDuty.monthly[i];
    base[`${label} Total`] = ledger.monthly[i];
  });
  base["Total Leave Days"] = ledger.totalDays;
  return base;
}

function monthColumns(ledger: LeaveLedger, month: number): CsvRow {
  const view = monthViewRow(ledger, month);
  const base: CsvRow = { Month: MONTH_LABELS[view.month] };
  for (const code of LEAVE_BUCKETS) base[`Taken ${code}`] = view.buckets[code].taken;
  for (const code of LEAVE_BUCKETS) base[`Remaining ${code}`] = view.buckets[code].remaining;
  base.OD = view.onDuty;
  base["Week-offs Worked"] = view.weekOffWorked;
  base.Total = view.total;
  return base;
}

export function leaveBalanceExportRows({
  sections,
  departments,
  month,
}: LeaveBalanceExportInput): CsvRow[] {
  return sections.flatMap((section) =>
    section.rows.map((row) => ({
      ...identity(section, row, departments),
      ...(month === null ? yearColumns(row.ledger) : monthColumns(row.ledger, month)),
    }))
  );
}
