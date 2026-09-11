"use client";

// The sheet's month-wise block, one staff member at a time: JANUARY..DECEMBER
// crossed with CL / EL / ML / FL, plus the OD row the attendance tabs carry.
// It lives behind a row expander because the flat sheet needs 48 columns to say
// what this says in 13.

import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  MONTH_LABELS,
  days,
  ledgerBucket,
  type LeaveLedger,
} from "@/lib/leave-ledger";
import type { LeaveBucket } from "@/types";

/** One row of the grid: a label, twelve months, and the year total. */
interface MonthRow {
  key: string;
  label: string;
  hint: string;
  monthly: number[];
  total: number;
  tone: string;
}

function bucketRow(ledger: LeaveLedger, code: LeaveBucket): MonthRow {
  const bucket = ledgerBucket(ledger, code);
  return {
    key: code,
    label: code,
    hint: LEAVE_BUCKET_LABELS[code],
    monthly: bucket.monthly,
    total: bucket.used,
    tone: "text-slate-900",
  };
}

export function leaveMonthRows(ledger: LeaveLedger): MonthRow[] {
  return [
    ...LEAVE_BUCKETS.map((code) => bucketRow(ledger, code)),
    {
      key: "OD",
      label: "OD",
      hint: "On duty",
      monthly: ledger.onDuty.monthly,
      total: ledger.onDuty.total,
      tone: "text-violet-700",
    },
  ];
}

interface LeaveMonthGridProps {
  ledger: LeaveLedger;
}

export function LeaveMonthGrid({ ledger }: LeaveMonthGridProps) {
  const rows = leaveMonthRows(ledger);
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[680px] border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Month-wise
            </th>
            {MONTH_LABELS.map((m) => (
              <th key={m} scope="col" className="px-2 py-2 text-center font-medium">
                {m}
              </th>
            ))}
            <th scope="col" className="border-l border-slate-300 px-3 py-2 text-center font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-100">
              <th scope="row" className="px-3 py-2 text-left font-semibold text-slate-700">
                {row.label}
                <span className="ml-1.5 font-normal text-slate-400">{row.hint}</span>
              </th>
              {row.monthly.map((value, i) => (
                <td
                  key={MONTH_LABELS[i]}
                  className={`px-2 py-2 text-center tabular-nums ${
                    value > 0 ? `font-semibold ${row.tone}` : "text-slate-300"
                  }`}
                >
                  {value > 0 ? days(value) : "·"}
                </td>
              ))}
              <td
                className={`border-l border-slate-300 px-3 py-2 text-center font-bold tabular-nums ${
                  row.total > 0 ? row.tone : "text-slate-300"
                }`}
              >
                {days(row.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
