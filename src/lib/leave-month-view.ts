// ==================== Month-scoped view of a leave ledger (pure) ====================
// The balances page reads a year at a time. This narrows one ledger to a single
// month and answers the two questions an admin asks about it: what did this
// person take in March, and what were they left with when March closed.
//
//   taken     = the month's own figure
//   remaining = entitled - everything used from January through this month
//
// Entitlement is annual and available across the calendar year, so credits
// (opening balance, week-off conversions, grants) count from January whatever
// month they were posted in — the same reading the yearly table already takes.
//
// The defining property, asserted in the tests: in December, `remaining` is the
// yearly balance. It holds only because the ledger now files every debit into
// some month, so the month-wise split always adds up to `used`.
//
// Kept separate from leave-ledger.ts, and pure, so it can be tested directly —
// the repo has no React testing library, and this arithmetic is the part that
// has to be right.

import { LEAVE_BUCKETS, ledgerBucket, type LeaveLedger } from "@/lib/leave-ledger";
import type { LeaveBucket } from "@/types";

/** One bucket's position within a single month. */
export interface MonthBucketView {
  /** Days of this bucket taken during the month. */
  taken: number;
  /** Days left when the month closed. Floored at 0 unless the ledger allows a deficit. */
  remaining: number;
}

/** One staff member's row in the month-scoped table. */
export interface MonthViewRow {
  /** The month this row describes, 0 = January. */
  month: number;
  buckets: Record<LeaveBucket, MonthBucketView>;
  /** On-duty days in the month, counted from attendance. */
  onDuty: number;
  /** Week-off days worked in the month, whether or not they were converted yet. */
  weekOffWorked: number;
  /** Leave days taken in the month across every bucket. */
  total: number;
}

/** Rounds to the ledger's 0.01 precision, so summing halves never shows 8.999999. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Keeps a month index inside January..December. The pill row cannot produce an
 * out-of-range month, but a stale URL or a caller counting from 1 can, and a
 * silently undefined column reads as "nothing taken" — which is a lie, not a
 * blank.
 */
export function clampMonth(month: number): number {
  if (!Number.isFinite(month)) return 0;
  return Math.min(11, Math.max(0, Math.trunc(month)));
}

export function monthViewRow(ledger: LeaveLedger, month: number): MonthViewRow {
  const m = clampMonth(month);
  const buckets = {} as Record<LeaveBucket, MonthBucketView>;

  for (const code of LEAVE_BUCKETS) {
    const bucket = ledgerBucket(ledger, code);
    let consumed = 0;
    for (let i = 0; i <= m; i++) consumed += bucket.monthly[i] ?? 0;
    const raw = round(bucket.entitled - consumed);
    buckets[code] = {
      taken: bucket.monthly[m] ?? 0,
      remaining: ledger.allowNegative ? raw : Math.max(0, raw),
    };
  }

  return {
    month: m,
    buckets,
    onDuty: ledger.onDuty.monthly[m] ?? 0,
    weekOffWorked: ledger.sundays.monthlyWorked[m] ?? 0,
    total: ledger.monthly[m] ?? 0,
  };
}
