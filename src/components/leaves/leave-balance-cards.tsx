"use client";

// The four balance buckets and the month-wise strip, rendered from a computed
// ledger. Presentational only — no fetching, no mutation — so the admin view
// and the employee's own view are literally the same component.

import { Card, CardContent } from "@/components/ui/card";
import { LEAVE_BUCKETS, LEAVE_BUCKET_LABELS, days, ledgerBucket } from "@/lib/leave-ledger";
import { LeaveMonthGrid } from "@/components/leaves/leave-month-grid";
import type { LeaveLedger } from "@/lib/leave-ledger";
import type { LeaveBucket } from "@/types";

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
export function LeaveMonthlyStrip({ ledger }: { ledger: LeaveLedger }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Month by month</h3>
          <span className="text-xs text-slate-500">
            {days(ledger.totalDays)} leave day(s) · {days(ledger.onDuty.total)} OD in {ledger.year}
          </span>
        </div>
        <LeaveMonthGrid ledger={ledger} />
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
 * The headline an admin reads first when they open a staff member: how much
 * leave this person took, what is left in each bucket, and how much overtime
 * and week-off duty they put in to earn flexible leave.
 */
export function LeaveSummaryLine({ ledger }: { ledger: LeaveLedger }) {
  const { overtime, flSources, sundays } = ledger;
  const items = [
    { label: "Leave taken", value: `${days(ledger.totalDays)} day(s)` },
    { label: "On duty", value: `${days(ledger.onDuty.total)} day(s)` },
    { label: "Overtime", value: `${overtime.count} approved · ${days(overtime.hours)}h` },
    { label: "Earned as flexible leave", value: `${days(overtime.daysEarned)} day(s)` },
    { label: "Week-offs worked", value: `${sundays.worked} (${sundays.converted} converted)` },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
