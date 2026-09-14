"use client";

// The phone version of the balance sheet. A twelve-column grid cannot be read
// on a 375px screen, and squeezing it behind a horizontal scrollbar just hides
// the columns that matter, so the phone gets one card per person answering the
// question people actually open this page with: how many days has this person
// got left. Everything else is a tap away — the row opens the same ledger
// drawer the table opens, and the chevron opens the same month-wise grid.
//
// Given a `month`, the big number becomes the balance at that month's close and
// the tile says what was taken during it, so the card and the desktop table
// answer the same two questions in the same order.

import { ChevronDown, ChevronRight } from "lucide-react";
import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  MONTH_LABELS,
  days,
  ledgerBucket,
} from "@/lib/leave-ledger";
import { clampMonth, monthViewRow } from "@/lib/leave-month-view";
import { LeaveMonthGrid } from "@/components/leaves/leave-month-grid";
import type { LeaveBalanceSection } from "@/components/leaves/leave-balance-table";

interface LeaveBalanceCardListProps {
  sections: LeaveBalanceSection[];
  onOpenStaff: (staffId: string) => void;
  expanded: ReadonlySet<string>;
  onToggleExpand: (staffId: string) => void;
  /** A month index to scope the card to, or null for the whole year. */
  month?: number | null;
}

export function LeaveBalanceCardList({
  sections,
  onOpenStaff,
  expanded,
  onToggleExpand,
  month = null,
}: LeaveBalanceCardListProps) {
  const monthLabel = month === null ? null : MONTH_LABELS[clampMonth(month)];
  return (
    <div className="divide-y divide-slate-100">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="bg-slate-900 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
            {section.title}
          </h3>
          <ul className="divide-y divide-slate-100">
            {section.rows.map((row) => {
              const staffId = row.staff.id!;
              const isOpen = expanded.has(staffId);
              const name = `${row.staff.firstName} ${row.staff.lastName}`;
              const view = month === null ? null : monthViewRow(row.ledger, month);
              return (
                <li key={staffId} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenStaff(staffId)}
                      className="min-h-11 flex-1 text-left"
                    >
                      <p className="font-semibold text-slate-900">{name}</p>
                      <p className="text-xs text-slate-500">
                        {row.staff.employeeCode}
                        {row.staff.designation ? ` · ${row.staff.designation}` : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(staffId)}
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} month-wise leave for ${name}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {/* Remaining is the headline: allocated and used are one tap away. */}
                  <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200">
                    {LEAVE_BUCKETS.map((code, i) => {
                      const bucket = ledgerBucket(row.ledger, code);
                      const remaining = view ? view.buckets[code].remaining : bucket.balance;
                      const taken = view ? view.buckets[code].taken : 0;
                      const over = remaining < 0 ? -remaining : 0;
                      return (
                        <div
                          key={code}
                          className={`px-1 py-2 text-center ${i > 0 ? "border-l border-slate-200" : ""} ${
                            over ? "bg-rose-50" : "bg-slate-50/60"
                          }`}
                        >
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                            title={LEAVE_BUCKET_LABELS[code]}
                          >
                            {code}
                          </p>
                          <p
                            className={`text-base font-bold tabular-nums ${
                              over
                                ? "text-rose-600"
                                : remaining > 0
                                  ? "text-slate-900"
                                  : "text-slate-300"
                            }`}
                          >
                            {days(remaining)}
                          </p>
                          {over > 0 && (
                            <p className="text-[10px] font-semibold uppercase text-rose-500">over</p>
                          )}
                          {taken > 0 && (
                            <p className="text-[10px] font-semibold tabular-nums text-orange-600">
                              −{days(taken)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    {view && monthLabel ? (
                      <>
                        Remaining at {monthLabel} end · {days(view.total)} taken in {monthLabel} ·{" "}
                        <span className="font-medium text-violet-700">
                          {days(view.onDuty)} on duty
                        </span>
                        {view.weekOffWorked > 0 ? ` · ${view.weekOffWorked} week-off worked` : ""}
                      </>
                    ) : (
                      <>
                        Remaining · {days(row.ledger.totalDays)} used ·{" "}
                        <span className="font-medium text-violet-700">
                          {days(row.ledger.onDuty.total)} on duty
                        </span>
                        {row.ledger.sundays.worked > 0
                          ? ` · ${row.ledger.sundays.worked} week-off worked`
                          : ""}
                      </>
                    )}
                  </p>

                  {isOpen && (
                    <div className="mt-3">
                      <LeaveMonthGrid ledger={row.ledger} highlightMonth={month} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Card-shaped skeleton, so the phone layout does not jump on load. */
export function LeaveBalanceCardListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
          <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-200">
            {Array.from({ length: 4 }).map((__, c) => (
              <div key={c} className="bg-slate-50/60 px-1 py-3">
                <div className="mx-auto h-6 w-8 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
