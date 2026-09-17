"use client";

// The four balance buckets and the month-wise strip, rendered from a computed
// ledger. Presentational only — no fetching, no mutation — so the admin view
// and the employee's own view are literally the same component.

import { Card, CardContent } from "@/components/ui/card";
import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  days,
  ledgerBucket,
  overtimeCompOffDays,
  overtimeHours,
} from "@/lib/leave-ledger";
import { LeaveMonthGrid } from "@/components/leaves/leave-month-grid";
import { formatDate } from "@/lib/utils";
import type { LeaveLedger } from "@/lib/leave-ledger";
import type { LeaveBucket, StaffRequest } from "@/types";

export { days };

const BUCKET_TONES: Record<LeaveBucket, { ring: string; value: string; chip: string }> = {
  CL: { ring: "border-cyan-200 bg-cyan-50/60", value: "text-cyan-700", chip: "bg-cyan-100 text-cyan-700" },
  ML: { ring: "border-pink-200 bg-pink-50/60", value: "text-pink-700", chip: "bg-pink-100 text-pink-700" },
  EL: { ring: "border-teal-200 bg-teal-50/60", value: "text-teal-700", chip: "bg-teal-100 text-teal-700" },
  FL: {
    ring: "border-orange-200 bg-orange-50/60",
    value: "text-orange-700",
    chip: "bg-orange-100 text-orange-700",
  },
};

export function LeaveBalanceCards({ ledger }: { ledger: LeaveLedger }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {LEAVE_BUCKETS.map((code) => {
        const bucket = ledgerBucket(ledger, code);
        const tone = BUCKET_TONES[code];
        const negative = bucket.balance < 0;
        return (
          <div key={code} className={`rounded-2xl border p-4 ${tone.ring}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-slate-600 sm:text-sm">
                {LEAVE_BUCKET_LABELS[code]}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>{code}</span>
            </div>
            <p className={`mt-2 text-lg font-bold sm:text-2xl ${negative ? "text-rose-600" : tone.value}`}>
              {days(bucket.balance)}
              <span className="ml-1 text-xs font-medium text-slate-500">left</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {days(bucket.used)} used of {days(bucket.entitled)}
            </p>
            {code === "FL" && bucket.credited > 0 && (
              <p className="mt-1 text-xs text-slate-500">{days(bucket.credited)} earned</p>
            )}
            {negative && <p className="mt-1 text-xs font-medium text-rose-600">Over the allowance</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The month-wise block from the printed sheet: every month crossed with the
 * four buckets and the OD row, rather than one aggregate number per month.
 */
export function LeaveMonthlyStrip({
  ledger,
  onEditCell,
}: {
  ledger: LeaveLedger;
  onEditCell?: (bucket: LeaveBucket, month: number, current: number) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Month by month</h3>
          <span className="text-xs text-slate-500">
            {days(ledger.totalDays)} leave day(s) · {days(ledger.onDuty.total)} OD in {ledger.year}
          </span>
        </div>
        <LeaveMonthGrid ledger={ledger} onEditCell={onEditCell} />
        {onEditCell && (
          <p className="mt-2 text-xs text-slate-500">
            Click any leave cell to post an adjustment for that month. On duty is counted from
            attendance and is corrected there.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SundaySummaryCards({ ledger }: { ledger: LeaveLedger }) {
  const { worked, converted, pending, creditedDays } = ledger.sundays;
  const items = [
    { label: "Week-offs worked", value: worked, hint: "Sundays and holidays on duty" },
    { label: "Converted", value: converted, hint: `${days(creditedDays)} flexible day(s) credited` },
    { label: "Awaiting conversion", value: pending, hint: "Not yet turned into leave" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600 sm:text-sm">{item.label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">{item.value}</p>
          <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Approved overtime, given the same weight as week-off duty because it is the
 * other half of the same story: both are extra hours worked, and both turn into
 * flexible leave. It used to be two entries in a five-across text line, where
 * the hours and the days they earned sat next to each other with nothing saying
 * one produced the other.
 */
export function OvertimeCards({
  ledger,
  requests = [],
}: {
  ledger: LeaveLedger;
  /** Approved requests for the year; the overtime ones are listed. */
  requests?: StaffRequest[];
}) {
  const { overtime } = ledger;
  const items = [
    { label: "Approved overtime", value: String(overtime.count), hint: "Requests this year" },
    { label: "Hours worked", value: `${days(overtime.hours)}h`, hint: "Across those requests" },
    {
      label: "Earned as flexible leave",
      value: days(overtime.daysEarned),
      hint: "8 hours makes 1 day",
    },
  ];

  const logged = requests
    .filter((r) => r.type === "overtime" && r.status === "approved")
    .sort((a, b) => (b.startDate?.seconds ?? 0) - (a.startDate?.seconds ?? 0));

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Overtime</h3>
          <p className="text-xs text-slate-500">
            Extra hours beyond the shift. Every 8 approved hours credit one flexible leave day.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {items.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-600 sm:text-sm">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
            </div>
          ))}
        </div>

        {logged.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-500">
            No approved overtime for {ledger.year}.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logged.map((r) => {
              const hours = overtimeHours(r);
              const earned = overtimeCompOffDays(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {formatDate(new Date((r.startDate?.seconds ?? 0) * 1000))}
                      {r.startTime && r.endTime ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          · {r.startTime}–{r.endTime}
                        </span>
                      ) : null}
                    </p>
                    {r.reason && <p className="truncate text-xs text-slate-500">{r.reason}</p>}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">
                    {days(hours)}h
                  </span>
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700 tabular-nums">
                    {days(earned)} FL
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The headline an admin reads first when they open a staff member: how much
 * leave this person took, and how much week-off duty they put in. Overtime used
 * to sit here too; it has its own card now, so this line stops being five
 * unrelated numbers in a row.
 */
export function LeaveSummaryLine({ ledger }: { ledger: LeaveLedger }) {
  const { flSources, sundays } = ledger;
  const items = [
    { label: "Leave taken", value: `${days(ledger.totalDays)} day(s)` },
    { label: "On duty", value: `${days(ledger.onDuty.total)} day(s)` },
    { label: "Week-offs worked", value: `${sundays.worked} (${sundays.converted} converted)` },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
      {ledger.fl.entitled > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Flexible leave earned from {days(flSources.overtime)} day(s) of overtime,{" "}
          {days(flSources.weekOff)} from converted week-offs
          {flSources.manual > 0 ? `, ${days(flSources.manual)} granted by admin` : ""}.
        </p>
      )}
    </div>
  );
}
