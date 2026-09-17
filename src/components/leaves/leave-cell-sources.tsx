"use client";

// What one month-wise cell is made of, and how to take it back out.
//
// The cell counts days TAKEN, and only the row that logged a day can un-log it:
// a positive adjustment raises the yearly entitlement and never touches a month
// column, so "offset it with a credit" would leave the cell reading exactly the
// same number it read before. That is why this list exists instead of a
// "set the month to 0" box — each row is shown with the one action that
// actually clears it, and the rows this dialog cannot clear say so plainly
// rather than offering a button that undoes itself on the next sync.

import Link from "next/link";
import { ArrowUpRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEAVE_BUCKET_LABELS, MONTH_LABELS, days } from "@/lib/leave-ledger";
import { formatDate } from "@/lib/utils";
import type { LeaveMonthSource } from "@/lib/leave-month-sources";
import type { LeaveBucket } from "@/types";

interface LeaveCellSourcesProps {
  bucket: LeaveBucket;
  month: number;
  year: number;
  sources: LeaveMonthSource[];
  /** Days the ledger shows in this cell, for the "does it add up" line. */
  cellDays: number;
  accountedDays: number;
  /** Deletes a manual row. Only ever called for a source marked removable. */
  onRemove?: (source: LeaveMonthSource) => void;
  busyId?: string | null;
}

/** Colour and wording per source, so the three are never mistaken for each other. */
const TONE: Record<LeaveMonthSource["kind"], string> = {
  adjustment: "border-slate-200 bg-white",
  attendance: "border-amber-200 bg-amber-50/60",
  request: "border-sky-200 bg-sky-50/60",
};

export function LeaveCellSources({
  bucket,
  month,
  year,
  sources,
  cellDays,
  accountedDays,
  onRemove,
  busyId,
}: LeaveCellSourcesProps) {
  const monthLabel = MONTH_LABELS[month];

  if (cellDays <= 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        No {bucket} taken in {monthLabel} {year}. Anything added below starts this month at zero.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">
          Where {monthLabel}&rsquo;s {days(cellDays)} {LEAVE_BUCKET_LABELS[bucket]} day
          {cellDays === 1 ? "" : "s"} came from
        </h4>
        {accountedDays !== cellDays && (
          // Only reachable if a row was written outside the two paths the ledger
          // reads. Saying so beats quietly showing a list that does not add up.
          <span className="text-xs font-medium text-rose-600">
            Only {days(accountedDays)} of {days(cellDays)} accounted for
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {sources.map((source) => {
          const busy = busyId === source.id;
          return (
            <li
              key={source.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${TONE[source.kind]}`}
            >
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 tabular-nums">
                {days(source.days)} {bucket}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{source.label}</p>
                <p className="truncate text-xs text-slate-500">
                  {source.seconds ? `${formatDate(new Date(source.seconds * 1000))} · ` : ""}
                  {source.detail}
                </p>
              </div>

              {source.removable && onRemove && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRemove(source)}
                  aria-label={`Remove this ${days(source.days)} day ${bucket} entry`}
                >
                  {busy ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-3.5 w-3.5 text-rose-600" />
                  )}
                  Remove
                </Button>
              )}

              {source.kind === "attendance" && (
                <Link
                  href={`/dashboard/attendance/${source.attendanceId}`}
                  className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                >
                  Fix the attendance day
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              )}

              {source.kind === "request" && (
                <Link
                  href="/dashboard/leaves"
                  className="inline-flex min-h-9 items-center rounded-lg border border-sky-300 bg-white px-2.5 text-xs font-semibold text-sky-800 hover:bg-sky-50"
                >
                  Cancel the request
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {sources.some((s) => s.kind === "attendance") && (
        <p className="text-xs text-amber-700">
          A day marked as leave on the attendance register is re-posted by &ldquo;Sync attendance
          leave&rdquo;, so deleting it here would not hold. Correct the attendance day instead.
        </p>
      )}
      {sources.some((s) => s.kind === "request") && (
        <p className="text-xs text-sky-800">
          Days from an approved request are cleared by cancelling the request, not from here.
        </p>
      )}
    </div>
  );
}
