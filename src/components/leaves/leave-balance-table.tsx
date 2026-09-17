"use client";

// The balance sheet itself. It carries the same numbers as the printed sheet,
// but reads them in the order a person asks for them: ALLOCATED, USED,
// REMAINING — each split CL / EL / ML / FL — then on duty, week-off and the
// year total. The sheet spells its month-wise block out across 48 more
// columns; here that block lives one click away, under the row it belongs to.
//
// Given a `month`, the same table re-scopes to it: the three yearly blocks
// collapse to two — what was taken during the month, and what was left when it
// closed — and the counters beside them follow. Eight numeric columns instead
// of twelve, so the month view is narrower than the year view, not wider.
//
// Presentational — the page owns fetching, paging and filtering.

import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  MONTH_LABELS,
  days,
  groupByEmployment,
  ledgerBucket,
} from "@/lib/leave-ledger";
import { clampMonth, monthViewRow, type MonthViewRow } from "@/lib/leave-month-view";
import { LeaveMonthGrid } from "@/components/leaves/leave-month-grid";
import type { EmploymentGroupSection, LeaveLedger } from "@/lib/leave-ledger";
import type { LeaveBucket } from "@/types";
import type { OrgLedgerRow } from "@/lib/leave-adjustments";

export type LeaveBalanceSection = EmploymentGroupSection<OrgLedgerRow>;

/**
 * How tall the scrolling table box is allowed to get. Bounded, because the box
 * only scrolls — and so only pins its header — if it has a height to overflow.
 * Deep enough that a default page of 20 rows still shows a dozen at a time.
 */
const TABLE_VIEWPORT = "max-h-[calc(100dvh-15rem)] min-h-[22rem]";

/**
 * The lines that close the pinned edges, drawn as box-shadows rather than
 * borders: under `border-collapse: collapse` a sticky cell's own border is
 * collapsed away with its neighbour's and stops being painted once the cell
 * detaches, which is exactly when the line is needed. A zero-blur shadow is
 * not subject to that and lands on the same pixel a border would.
 *
 * The bottom line belongs to whichever cell forms the band's BOTTOM edge — the
 * code row, plus the tall cells spanning both rows — or it would be drawn
 * halfway up the band, across the row still above it.
 */
const EDGE_DOWN = "shadow-[0_2px_0_0_#94a3b8]";
const EDGE_RIGHT = "shadow-[2px_0_0_0_#cbd5e1]";
const EDGE_BOTH = "shadow-[0_2px_0_0_#94a3b8,2px_0_0_0_#cbd5e1]";

/** Whether the staff column currently has content hidden behind it. */
function useScrollShadows() {
  const [shadows, setShadows] = useState({ right: false });
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setShadows((prev) => {
      const right = el.scrollLeft > 0;
      return prev.right === right ? prev : { right };
    });
  }, []);
  return { shadows, onScroll };
}

/**
 * The height of the first header row, measured rather than assumed, so the
 * second row (the CL/EL/ML/FL codes) sticks flush beneath it. A hardcoded
 * offset drifts with font size and browser zoom, and the failure is ugly: a
 * sliver of scrolled row showing between the two header bands.
 */
function useHeaderOffset<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setOffset(el.getBoundingClientRect().height);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, offset };
}

/** Splits a page of rows into the PERMANENT / CONTRACT / INTERNS sheet groups. */
export function groupLedgerRows(rows: OrgLedgerRow[]): LeaveBalanceSection[] {
  return groupByEmployment(rows);
}

type BlockKey = "allocated" | "used" | "remaining" | "taken" | "monthRemaining";

interface Block {
  key: BlockKey;
  label: string;
  hint: string;
  head: string;
}

/**
 * The yearly blocks. The sheet calls them CURRENT / USED / BALANCE and prints
 * balance first; here they read left to right as the sum they describe —
 * allocated minus used leaves remaining — because that is the question an admin
 * is actually asking when they open this page.
 */
const YEAR_BLOCKS: Block[] = [
  { key: "allocated", label: "Allocated", hint: "Days granted for the year", head: "bg-sky-50 text-sky-800" },
  { key: "used", label: "Used", hint: "Days already taken", head: "bg-orange-50 text-orange-800" },
  { key: "remaining", label: "Remaining", hint: "Allocated minus used", head: "bg-emerald-50 text-emerald-800" },
];

/**
 * In month mode there is nothing useful to say about allocation — entitlement
 * is annual, so an "allocated" column would print the same number twelve times.
 * What changes month to month is what was taken and what survived it.
 */
function blocksFor(month: number | null): Block[] {
  if (month === null) return YEAR_BLOCKS;
  const label = MONTH_LABELS[clampMonth(month)];
  return [
    {
      key: "taken",
      label: `Taken in ${label}`,
      hint: `Days taken during ${label}`,
      head: "bg-orange-50 text-orange-800",
    },
    {
      key: "monthRemaining",
      label: `Remaining @ ${label} end`,
      hint: `Balance left when ${label} closed`,
      head: "bg-emerald-50 text-emerald-800",
    },
  ];
}

/** Staff + expander + (blocks x 4 buckets) + OD + week-off + total. */
function columnCount(blocks: Block[]): number {
  return 2 + blocks.length * LEAVE_BUCKETS.length + 3;
}

function cellValue(
  key: BlockKey,
  ledger: LeaveLedger,
  view: MonthViewRow | null,
  code: LeaveBucket
): number {
  const bucket = ledgerBucket(ledger, code);
  switch (key) {
    case "allocated":
      return bucket.entitled;
    case "used":
      return bucket.used;
    case "remaining":
      return bucket.balance;
    case "taken":
      return view?.buckets[code].taken ?? 0;
    case "monthRemaining":
      return view?.buckets[code].remaining ?? 0;
  }
}

interface LeaveBalanceTableProps {
  sections: LeaveBalanceSection[];
  onOpenStaff: (staffId: string) => void;
  /** Rows whose month-wise block is open. */
  expanded: ReadonlySet<string>;
  onToggleExpand: (staffId: string) => void;
  /** A month index to scope every column to, or null for the whole year. */
  month?: number | null;
}

export function LeaveBalanceTable({
  sections,
  onOpenStaff,
  expanded,
  onToggleExpand,
  month = null,
}: LeaveBalanceTableProps) {
  const blocks = blocksFor(month);
  const columns = columnCount(blocks);
  const monthLabel = month === null ? null : MONTH_LABELS[clampMonth(month)];
  const { ref: headRowRef, offset: headOffset } = useHeaderOffset<HTMLTableRowElement>();
  const { shadows, onScroll } = useScrollShadows();
  // The header line is always drawn — it is the band's edge, not a scroll hint,
  // and appearing only once scrolled made the header look like it moved. The
  // staff column's line waits for a sideways scroll, because until then there
  // is nothing behind it to separate from.
  const leftEdge = shadows.right ? EDGE_RIGHT : "";
  const cornerEdge = shadows.right ? EDGE_BOTH : EDGE_DOWN;

  // Desktop only. Below md the page renders LeaveBalanceCardList instead —
  // twelve numeric columns are not readable on a phone at any zoom.
  //
  // The table owns its own vertical scroll rather than riding the page's. A
  // sticky header cannot stick to the viewport from inside an overflow-x
  // wrapper — the wrapper becomes the scrollport, and one that never scrolls
  // vertically pins nothing. Bounding its height makes it scroll for real, so
  // the two header rows and the staff column stay put together, and the legend
  // and pager below stay on screen while the roster moves.
  return (
    <div onScroll={onScroll} className={`hidden overflow-auto md:block ${TABLE_VIEWPORT}`}>
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr ref={headRowRef} className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th
              scope="col"
              rowSpan={2}
              className={`sticky left-0 top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2 text-left font-semibold ${cornerEdge}`}
            >
              Staff
            </th>
            <th scope="col" rowSpan={2} className={`sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-1 py-2 ${EDGE_DOWN}`}>
              <span className="sr-only">Month-wise detail</span>
            </th>
            {blocks.map((block) => (
              <th
                key={block.key}
                scope="colgroup"
                colSpan={LEAVE_BUCKETS.length}
                title={block.hint}
                className={`sticky top-0 z-20 border-b border-l border-slate-200 px-3 py-2 text-center font-bold ${block.head}`}
              >
                {block.label}
              </th>
            ))}
            <th
              scope="col"
              rowSpan={2}
              title={
                monthLabel
                  ? `On duty in ${monthLabel} — worked away from the office`
                  : "On duty — worked away from the office"
              }
              className={`sticky top-0 z-20 border-b border-l border-slate-200 bg-violet-50 px-3 py-2 text-center font-bold text-violet-800 ${EDGE_DOWN}`}
            >
              On duty
            </th>
            <th
              scope="col"
              rowSpan={2}
              title={
                monthLabel
                  ? `Week-off days worked during ${monthLabel}`
                  : "Week-off days worked, and how many became flexible leave"
              }
              className={`sticky top-0 z-20 border-b border-l border-slate-200 bg-slate-50 px-3 py-2 text-center font-semibold ${EDGE_DOWN}`}
            >
              Week-off
            </th>
            <th
              scope="col"
              rowSpan={2}
              title={
                monthLabel
                  ? `All leave days taken in ${monthLabel}, across every type`
                  : "All leave days taken this year, across every type"
              }
              className={`sticky top-0 z-20 border-b border-l border-slate-200 bg-slate-50 px-3 py-2 text-center font-semibold ${EDGE_DOWN}`}
            >
              Total
            </th>
          </tr>
          <tr className="bg-slate-50 text-[11px] uppercase text-slate-500">
            {blocks.map((block) =>
              LEAVE_BUCKETS.map((code, i) => (
                <th
                  key={`${block.key}-${code}`}
                  scope="col"
                  style={{ top: headOffset }}
                  className={`sticky z-20 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-center font-semibold ${EDGE_DOWN} ${
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
                  colSpan={columns}
                  className="sticky left-0 z-10 bg-slate-900 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white"
                >
                  {section.title}
                </td>
              </tr>
              {section.rows.map((row) => {
                const staffId = row.staff.id!;
                const isOpen = expanded.has(staffId);
                const open = () => onOpenStaff(staffId);
                const view = month === null ? null : monthViewRow(row.ledger, month);
                const onDuty = view ? view.onDuty : row.ledger.onDuty.total;
                const total = view ? view.total : row.ledger.totalDays;
                return (
                  <Fragment key={staffId}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td
                        onClick={open}
                        className={`sticky left-0 z-10 cursor-pointer bg-white px-4 py-3 ${leftEdge}`}
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
                      {blocks.map((block) =>
                        LEAVE_BUCKETS.map((code, i) => {
                          const value = cellValue(block.key, row.ledger, view, code);
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
                          onDuty > 0 ? "font-semibold text-violet-700" : "text-slate-300"
                        }`}
                      >
                        {days(onDuty)}
                      </td>
                      <td
                        onClick={open}
                        className="cursor-pointer border-l border-slate-200 px-3 py-3 text-center tabular-nums"
                      >
                        {view ? (
                          <span
                            className={
                              view.weekOffWorked > 0
                                ? "font-semibold text-slate-900"
                                : "text-slate-300"
                            }
                          >
                            {view.weekOffWorked}
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold text-slate-900">
                              {row.ledger.sundays.worked}
                            </span>
                            <span className="text-xs text-slate-400">
                              {" "}
                              / {row.ledger.sundays.converted} conv
                            </span>
                          </>
                        )}
                      </td>
                      <td
                        onClick={open}
                        className="cursor-pointer border-l border-slate-200 px-3 py-3 text-center font-semibold tabular-nums text-slate-900"
                      >
                        {days(total)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={columns} className="px-4 py-3">
                          {/* The wide view, with the scoped month marked, so the
                              two readings of the same numbers visibly agree. */}
                          <LeaveMonthGrid ledger={row.ledger} highlightMonth={month} />
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
export function LeaveCodeLegend({ month = null }: { month?: number | null }) {
  const monthLabel = month === null ? null : MONTH_LABELS[clampMonth(month)];
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
      {monthLabel && (
        <span>
          Remaining counts every day taken from January through {monthLabel}; the yearly
          entitlement is available across the whole year.
        </span>
      )}
    </div>
  );
}

/** Skeleton shaped like the real table, so the layout does not jump on load. */
export function LeaveBalanceTableSkeleton({
  rows = 10,
  month = null,
}: {
  rows?: number;
  month?: number | null;
}) {
  const columns = columnCount(blocksFor(month));
  return (
    <div className={`hidden overflow-auto md:block ${TABLE_VIEWPORT}`}>
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-slate-100">
              <td className="px-4 py-3">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-slate-100" />
              </td>
              {Array.from({ length: columns - 1 }).map((__, c) => (
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
