"use client";

// The balance sheet itself: one row per staff member, PERMANENT and CONTRACT
// grouped the way the printed sheet groups them. Presentational — the page
// owns fetching, paging and filtering.

import { Fragment } from "react";
import { LEAVE_BUCKETS, MONTH_LABELS, groupByEmployment, ledgerBucket } from "@/lib/leave-ledger";
import { days } from "@/components/leaves/leave-balance-cards";
import type { EmploymentGroupSection } from "@/lib/leave-ledger";
import type { OrgLedgerRow } from "@/lib/leave-adjustments";

export type LeaveBalanceSection = EmploymentGroupSection<OrgLedgerRow>;

/** Splits a page of rows into the sheet's PERMANENT / CONTRACT groups. */
export function groupLedgerRows(rows: OrgLedgerRow[]): LeaveBalanceSection[] {
  return groupByEmployment(rows);
}

const COLUMN_COUNT = LEAVE_BUCKETS.length + MONTH_LABELS.length + 3;

interface LeaveBalanceTableProps {
  sections: LeaveBalanceSection[];
  onOpenStaff: (staffId: string) => void;
}

export function LeaveBalanceTable({ sections, onOpenStaff }: LeaveBalanceTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-semibold">Staff</th>
            {LEAVE_BUCKETS.map((code) => (
              <th key={code} className="border-l border-slate-200 px-3 py-3 text-center font-semibold">
                {code}
                <span className="ml-1 font-normal normal-case text-slate-400">bal / used / total</span>
              </th>
            ))}
            <th className="border-l border-slate-200 px-3 py-3 text-center font-semibold">Week-off</th>
            {MONTH_LABELS.map((m) => (
              <th key={m} className="border-l border-slate-100 px-2 py-3 text-center font-medium">
                {m}
              </th>
            ))}
            <th className="border-l border-slate-200 px-3 py-3 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <Fragment key={section.title}>
              <tr>
                <td
                  colSpan={COLUMN_COUNT}
                  className="sticky left-0 bg-slate-900 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white"
                >
                  {section.title}
                </td>
              </tr>
              {section.rows.map((row) => (
                <tr
                  key={row.staff.id}
                  onClick={() => onOpenStaff(row.staff.id!)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <p className="font-medium text-slate-900">
                      {row.staff.firstName} {row.staff.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.staff.employeeCode}
                      {row.staff.designation ? ` · ${row.staff.designation}` : ""}
                    </p>
                  </td>
                  {LEAVE_BUCKETS.map((code) => {
                    const bucket = ledgerBucket(row.ledger, code);
                    return (
                      <td key={code} className="border-l border-slate-200 px-3 py-3 text-center">
                        <span
                          className={`font-semibold ${bucket.balance < 0 ? "text-rose-600" : "text-slate-900"}`}
                        >
                          {days(bucket.balance)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {" "}
                          / {days(bucket.used)} / {days(bucket.entitled)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-200 px-3 py-3 text-center">
                    <span className="font-semibold text-slate-900">{row.ledger.sundays.worked}</span>
                    <span className="text-xs text-slate-400"> / {row.ledger.sundays.converted} conv</span>
                  </td>
                  {row.ledger.monthly.map((value, i) => (
                    <td
                      key={MONTH_LABELS[i]}
                      className={`border-l border-slate-100 px-2 py-3 text-center ${
                        value > 0 ? "font-medium text-slate-900" : "text-slate-300"
                      }`}
                    >
                      {value > 0 ? days(value) : "·"}
                    </td>
                  ))}
                  <td className="border-l border-slate-200 px-3 py-3 text-center font-semibold text-slate-900">
                    {days(row.ledger.totalDays)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton shaped like the real table, so the layout does not jump on load. */
export function LeaveBalanceTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-slate-100" />
              </td>
              {Array.from({ length: COLUMN_COUNT - 1 }).map((__, c) => (
                <td key={c} className="border-l border-slate-100 px-3 py-3">
                  <div className="mx-auto h-4 w-8 animate-pulse rounded bg-slate-100" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
