"use client";

// The balance sheet itself. It carries the same numbers as the printed sheet,
// but reads them in the order a person asks for them: ALLOCATED, USED,
// REMAINING — each split CL / EL / ML / FL — then on duty, week-off and the
// year total. The sheet spells its month-wise block out across 48 more
// columns; here that block lives one click away, under the row it belongs to.
// Presentational — the page owns fetching, paging and filtering.

import { Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  days,
  groupByEmployment,
  ledgerBucket,
} from "@/lib/leave-ledger";
import { LeaveMonthGrid } from "@/components/leaves/leave-month-grid";
import type { EmploymentGroupSection } from "@/lib/leave-ledger";
import type { OrgLedgerRow } from "@/lib/leave-adjustments";

export type LeaveBalanceSection = EmploymentGroupSection<OrgLedgerRow>;

/** Splits a page of rows into the PERMANENT / CONTRACT / INTERNS sheet groups. */
export function groupLedgerRows(rows: OrgLedgerRow[]): LeaveBalanceSection[] {
  return groupByEmployment(rows);
}

/**
 * The three bucket blocks. The sheet calls them CURRENT / USED / BALANCE and
 * prints balance first; here they read left to right as the sum they describe —
 * allocated minus used leaves remaining — because that is the question an admin
 * is actually asking when they open this page.
 */
const BLOCKS = [
  { key: "allocated", label: "Allocated", hint: "Days granted for the year", head: "bg-sky-50 text-sky-800" },
  { key: "used", label: "Used", hint: "Days already taken", head: "bg-orange-50 text-orange-800" },
  { key: "remaining", label: "Remaining", hint: "Allocated minus used", head: "bg-emerald-50 text-emerald-800" },
] as const;

/** Staff + expander + (3 blocks x 4 buckets) + OD + week-off + total. */
const COLUMN_COUNT = 2 + BLOCKS.length * LEAVE_BUCKETS.length + 3;

interface LeaveBalanceTableProps {
  sections: LeaveBalanceSection[];
  onOpenStaff: (staffId: string) => void;
  /** Rows whose month-wise block is open. */
  expanded: ReadonlySet<string>;
  onToggleExpand: (staffId: string) => void;
}

export function LeaveBalanceTable({
  sections,
  onOpenStaff,
  expanded,
  onToggleExpand,
}: LeaveBalanceTableProps) {
  // Desktop only. Below md the page renders LeaveBalanceCardList instead —
  // twelve numeric columns are not readable on a phone at any zoom.
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th
              scope="col"
              rowSpan={2}
              className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-2 text-left font-semibold"
            >
              Staff
            </th>
            <th scope="col" rowSpan={2} className="border-b border-slate-200 px-1 py-2">
              <span className="sr-only">Month-wise detail</span>
            </th>
            {BLOCKS.map((block) => (
              <th
                key={block.key}
                scope="colgroup"
                colSpan={LEAVE_BUCKETS.length}
                title={block.hint}
                className={`border-b border-l border-slate-200 px-3 py-2 text-center font-bold ${block.head}`}
              >
                {block.label}
              </th>
            ))}
            <th
              scope="col"
              rowSpan={2}
              title="On duty — worked away from the office"
              className="border-b border-l border-slate-200 bg-violet-50 px-3 py-2 text-center font-bold text-violet-800"
            >
              On duty
            </th>
            <th
              scope="col"
              rowSpan={2}
              title="Week-off days worked, and how many became flexible leave"
              className="border-b border-l border-slate-200 px-3 py-2 text-center font-semibold"
            >
              Week-off
            </th>
            <th
              scope="col"
              rowSpan={2}
              title="All leave days taken this year, across every type"
              className="border-b border-l border-slate-200 px-3 py-2 text-center font-semibold"
            >
              Total
            </th>
          </tr>
          <tr className="bg-slate-50 text-[11px] uppercase text-slate-500">
            {BLOCKS.map((block) =>
              LEAVE_BUCKETS.map((code, i) => (
                <th
                  key={`${block.key}-${code}`}
                  scope="col"
                  className={`border-b border-slate-200 px-3 py-1.5 text-center font-semibold ${
                    i === 0 ? "border-l" : ""
                  }`}
                >
                  <abbr
                    title={`${LEAVE_BUCKET_LABELS[code]} — ${block.hint.toLowerCase()}`}
                    className="no-underline"
                  >
                    {code}
                  </abbr>
                </th>
              ))
            )}
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
              {section.rows.map((row) => {
                const staffId = row.staff.id!;
                const isOpen = expanded.has(staffId);
                const open = () => onOpenStaff(staffId);
                return (
                  <Fragment key={staffId}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td
                        onClick={open}
                        className="sticky left-0 z-10 cursor-pointer bg-white px-4 py-3"
                      >
                        <p className="font-medium text-slate-900">
                          {row.staff.firstName} {row.staff.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {row.staff.employeeCode}
                          {row.staff.designation ? ` · ${row.staff.designation}` : ""}
                        </p>
                      </td>
                      <td className="px-1 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleExpand(staffId)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} month-wise leave for ${row.staff.firstName} ${row.staff.lastName}`}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      {BLOCKS.map((block) =>
                        LEAVE_BUCKETS.map((code, i) => {
                          const bucket = ledgerBucket(row.ledger, code);
                          const value =
                            block.key === "allocated"
                              ? bucket.entitled
                              : block.key === "used"
                                ? bucket.used
                                : bucket.balance;
                          // A negative remaining balance is the sheet's way of
                          // saying the person went past their allowance. The
                          // bare minus sign does not say that, so the cell does.
                          const over = value < 0 ? -value : 0;
                          return (
                            <td
                              key={`${block.key}-${code}`}
                              onClick={open}
                              title={
                                over
                                  ? `${LEAVE_BUCKET_LABELS[code]}: ${days(over)} day(s) past the allowance`
                                  : `${LEAVE_BUCKET_LABELS[code]} — ${block.hint.toLowerCase()}`
                              }
                              className={`cursor-pointer px-3 py-3 text-center tabular-nums ${
                                i === 0 ? "border-l border-slate-200" : ""
                              } ${
                                over
                                  ? "font-bold text-rose-600"
                                  : value > 0
                                    ? "font-semibold text-slate-900"
                                    : "text-slate-300"
                              }`}
                            >
                              {days(value)}
                              {over > 0 && (
                                <span className="block text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                                  over
                                </span>
                              )}
                            </td>
                          );
                        })
                      )}
                      <td
                        onClick={open}
                        className={`cursor-pointer border-l border-slate-200 px-3 py-3 text-center tabular-nums ${
                          row.ledger.onDuty.total > 0
                            ? "font-semibold text-violet-700"
                            : "text-slate-300"
                        }`}
                      >
                        {days(row.ledger.onDuty.total)}
                      </td>
                      <td
                        onClick={open}
                        className="cursor-pointer border-l border-slate-200 px-3 py-3 text-center tabular-nums"
                      >
                        <span className="font-semibold text-slate-900">
                          {row.ledger.sundays.worked}
                        </span>
                        <span className="text-xs text-slate-400">
                          {" "}
                          / {row.ledger.sundays.converted} conv
                        </span>
                      </td>
                      <td
                        onClick={open}
                        className="cursor-pointer border-l border-slate-200 px-3 py-3 text-center font-semibold tabular-nums text-slate-900"
                      >
                        {days(row.ledger.totalDays)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={COLUMN_COUNT} className="px-4 py-3">
                          <LeaveMonthGrid ledger={row.ledger} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the column codes mean, spelled out once. The header keeps the codes —
 * twelve columns of full words do not fit, and the codes are what the team
 * already writes on the printed sheet every day — so the expansion lives here.
 */
export function LeaveCodeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      {LEAVE_BUCKETS.map((code) => (
        <span key={code}>
          <span className="font-semibold text-slate-700">{code}</span> {LEAVE_BUCKET_LABELS[code]}
        </span>
      ))}
      <span>
        <span className="font-semibold text-violet-700">On duty</span> worked away from the office
      </span>
      <span className="text-rose-500">
        <span className="font-semibold">over</span> past the allowance
      </span>
    </div>
  );
}

/** Skeleton shaped like the real table, so the layout does not jump on load. */
export function LeaveBalanceTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[980px] border-collapse text-sm">
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
