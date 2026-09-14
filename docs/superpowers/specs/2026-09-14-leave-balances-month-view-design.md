# Leave Balances — month-scoped view

Date: 2026-09-14
Status: approved (verbal, 2026-09-14)

## Problem

`/dashboard/leaves/balances` answers one question well — "what is this person's
position for the year?" — and cannot answer the question an admin actually asks
more often: "what happened in March?"

Concretely, today:

1. **The page is year-scoped with no way out.** The only time control is a
   four-year pill row (`src/app/(dashboard)/dashboard/leaves/balances/page.tsx`).
   There is no month state anywhere in the page.
2. **Every column is a year aggregate.** The table prints Allocated / Used /
   Remaining crossed with CL·EL·ML·FL, then On duty, Week-off and the year
   total. All twelve numeric columns describe the whole year.
3. **The month-wise data exists but is trapped one row at a time.**
   `LeaveMonthGrid` renders JAN..DEC × CL/EL/ML/FL + OD, but only behind a
   per-row chevron. Answering "who took CL in March?" across a 40-person roster
   means expanding forty rows and reading the same column forty times.
4. **The stat cards and the CSV export are year-only.** The export dumps all 48
   month columns flat; there is no month-scoped export.

Two defects sit underneath the UI gap and would corrupt any month-wise balance
built on top of the ledger as it stands:

5. **Debits can vanish from the month-wise arrays.** In `computeLeaveLedger`, a
   negative adjustment only lands in `bucket.monthly` when `monthOf(a.date)`
   returns a month. A row with a missing `date` is dropped from the monthly
   split while still counting in `used`; a row whose `date` falls in a different
   calendar year than `a.year` is filed into that date's month of the *wrong*
   year. Either way `sum(monthly) !== used`, so a running balance computed from
   `monthly` would never reconcile with the yearly Remaining column.
6. **Week-off duty has no month dimension.** `SundaySummary` carries
   `worked / converted / pending / creditedDays` as year scalars only, so a
   month-scoped week-off stat card cannot be computed.

## Decisions taken

- **Shape:** a month pill row (`Year | Jan … Dec`) beside the existing year
  pills. Selecting a month re-scopes the whole page — table, stat cards and
  export. Selecting `Year` is exactly today's page.
- **Columns in month mode:** per bucket, *days taken in the selected month* and
  *balance remaining at the close of that month*. Eight numeric columns plus On
  duty, Week-off and Total — narrower than the year view's twelve.
- **Leave year is the calendar year, Jan–Dec, with the full annual entitlement
  available across it.** There is no monthly accrual schedule and none is being
  introduced. Credits (opening balance, week-off→FL conversions, manual grants)
  count from the start of the year, matching how the yearly table already reads
  them. Consequence, accepted: a week-off converted to FL in August makes that
  FL day look available in January. The alternative — attributing each credit to
  its own effective month — was considered and rejected as more machinery than
  the org's actual policy needs.

## Approach

### Month math is a pure module

`src/lib/leave-ledger.ts` is already 657 lines. The month-view arithmetic goes
in a new `src/lib/leave-month-view.ts` that imports ledger *types* only:

```
monthViewRow(ledger, month) -> {
  buckets: Record<LeaveBucket, { taken: number; remaining: number }>
  onDuty: number
  weekOffWorked: number
  total: number
}
```

- `taken` = `bucket.monthly[month]`
- `remaining` = `bucket.entitled - sum(bucket.monthly[0..month])`, floored at 0
  unless `ledger.allowNegative` — the same clamp the yearly column applies
- `onDuty` = `ledger.onDuty.monthly[month]`
- `total` = `ledger.monthly[month]`

The defining property: at `month === 11`, `remaining` equals `bucket.balance`
for every bucket. December's close *is* the year's position. That equality is
the invariant the tests assert, and it only holds once defect 5 is fixed.

The repo has no React testing library — vitest only. Keeping this arithmetic in
a pure module, rather than inside the table component, is what makes it
testable at all.

### Two fixes in the ledger

- **Attribute every debit to a month.** Replace the bare `monthOf(a.date)` with
  a guarded fallback: use `a.date` when its calendar year matches the ledger
  year, else `createdAt` under the same guard, else January. Guarantees
  `sum(bucket.monthly) === bucket.used` for every bucket, which is added as a
  standing test.
- **Give week-off duty a month dimension.** Add `monthlyWorked: number[]` to
  `SundaySummary`, filled from `d.date`. `pending` stays a year-wide figure —
  it describes a current status, not something that happened in a month — and
  the card is relabelled in month mode to say so.

### UI

- **`balances/page.tsx`** — new `month: number | null` state (`null` = year).
  A `Year | Jan … Dec` pill row under the year pills. Header copy, the five stat
  cards and the CSV export all read it.
- **`leave-balance-table.tsx`** — optional `month` prop. When set, the three
  `BLOCKS` collapse to two: `TAKEN IN <MON>` and `REMAINING @ <MON> END`, each
  split CL·EL·ML·FL, followed by On duty, Week-off and Total.
- **The row expander is unchanged.** It still opens the full twelve-month
  `LeaveMonthGrid`; in month mode the selected month's column is highlighted, so
  the scoped view and the wide view visibly agree.
- **`leave-balance-cardlist.tsx`** — the same month-aware treatment for mobile.
- **Export** — month mode writes month-scoped columns instead of the 48-column
  dump. Year mode is untouched.

### Tests

`src/lib/leave-month-view.test.ts`, plus additions to `leave-ledger.test.ts`:

- December's remaining equals the yearly balance, for every bucket
- clamping honours `allowNegative` (permanent) vs not (contract, intern)
- a dateless debit still lands in a month, and `sum(monthly) === used`
- a debit dated outside the ledger year does not land in the wrong month
- week-off duty splits by month and `sum(monthlyWorked) === worked`
- an empty ledger reports the quota as remaining in every month

## Out of scope

Month state in the URL; a per-month accrual schedule (ruled out by the calendar
year decision above); month mode inside the staff-portal drawer.
