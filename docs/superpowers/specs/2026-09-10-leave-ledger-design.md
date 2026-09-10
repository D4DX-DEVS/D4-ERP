# Leave Ledger — automatic balances, week-off duty, admin visibility & editing

Date: 2026-09-10
Status: approved (verbal, 2026-09-10)

## Problem

The org still keeps leave balances in a Google Sheet ("00. D4 ATTENDANCE SHEET
2026"). That sheet holds, per staff member: a per-person CL/EL/ML quota, days
USED per bucket, the resulting BALANCE (negative allowed for permanent staff),
a month-wise JAN..DEC breakdown, and an FL column fed by Sundays worked.

The ERP already derives balances on the fly from approved requests
(`computeLeaveBalances` in `src/lib/requests.ts`) and shows them to staff on the
request form. What it cannot do:

1. **No admin drill-down.** One collapsed org-wide table exists on the Leave
   Requests page. No per-staff view, no month-wise breakdown, no Sunday count,
   nothing on the staff profile page.
2. **No admin editing.** Balance is a pure function of approved requests plus a
   single global quota. An admin cannot grant extra days, correct a wrong count,
   or seed an opening balance without fabricating a leave request.
3. **No per-category quota.** Permanent, contract and intern staff all share one
   global quota. The sheet gives permanent staff a different (often negative)
   position from contract staff on a flat 15/0/15.
4. **No week-off duty tracking.** FL is earned only when a staff member files an
   overtime request and it is approved. Sundays worked (visible in imported
   biometric attendance) are neither counted nor convertible to FL.
5. **Edits must reflect for staff.** Whatever admin changes has to be the same
   number the staff member sees, immediately.

## Approach

A **ledger** model. Balance stops being a pure function of requests and becomes:

```
entitled = quota + sum(credit-type adjustments)
used     = approved leave requests + sum(debit-type adjustments)
balance  = entitled - used        (clamped at 0 unless negative is allowed)
```

Three sources feed the ledger, one collection each:

- `leaveRequests` (existing) — approved leave consumes days, approved overtime
  earns FL.
- `leave_adjustments` (new) — every manual admin change, the opening balance,
  and the FL credit produced by converting a week-off duty. Append-style rows
  with a reason and an author, so the sheet-style corrections stay traceable.
- `sunday_duties` (new) — one row per week-off day a staff member actually
  worked, detected from attendance, with a status of pending / converted /
  rejected.

Quota comes from `resolveQuota()`: per-staff override on the staff document,
falling back to a per-employment-type quota in settings, falling back to the
existing flat policy. Every layer keeps the old fields, so existing data reads
unchanged.

Alternatives rejected:

- *Stored balance documents updated on every approval.* Fastest reads, but two
  writers (approval flow and admin edits) racing on one number, and no history.
- *Adjustments only, no quota override.* Admin wants to type "15" into a CL
  quota cell, not compute a delta.

## Components

### `src/lib/leave-ledger.ts` (pure, unit-tested)

Owns every number. No I/O, no framework imports.

- `LEAVE_BUCKETS`, `bucketForLeaveType()` — maps stored codes (`SL`→ML, `CO`→FL).
- `requestLeaveDays()`, `overtimeCompOffDays()` — moved here from `requests.ts`,
  which re-exports them so existing imports keep working.
- `resolveQuota(staff, policy)` — per-staff override → employment-type quota →
  flat policy.
- `computeLeaveLedger({ requests, adjustments, sundayDuties, quota, year,
  allowNegative })` → `LeaveLedger`: four buckets (`cl`, `ml`, `el`, `fl`), plus
  half-day and LOP counters, a Sunday summary (worked / converted / pending), and
  a month-wise `number[12]` per bucket for the sheet view.
- `splitRequestDaysByMonth()` — a leave spanning a month boundary lands in the
  right columns.

### `src/lib/leave-adjustments.ts` (client data access)

Thin wrappers over the generic DB proxy: list/create/delete adjustments, list
week-off duties, `detectSundayDuties()` (scan attendance for work on a
non-working day, idempotent by staff + date), `convertSundayDuty()` (creates the
FL credit adjustment and links it), `rejectSundayDuty()`, and
`loadStaffLedger()` / `loadOrgLedgers()` which assemble the inputs and call the
pure computation. Every mutation writes an `audit_logs` entry.

### UI

- **`/dashboard/leaves/balances`** — the sheet, on screen. Rows grouped
  PERMANENT / CONTRACT, columns for each bucket's entitled / used / balance,
  Sundays worked and converted, and JAN..DEC + TOTAL. Year selector, search,
  CSV export, and a row click that opens the per-staff panel.
- **`src/components/leaves/leave-balance-panel.tsx`** — one staff member's
  ledger: bucket cards, month-wise strip, week-off duty list, adjustment
  history. Takes `canEdit`; read-only renders the same numbers.
- **`src/components/leaves/leave-adjust-dialog.tsx`** — set a quota override, or
  add a signed adjustment with a reason.
- **Staff profile → Leave tab** — the panel with `canEdit`, so an admin edits a
  person's leave from the same page they manage salary and contract on.
- **`/staff-portal/my-leave-balance`** — the same panel, read-only, for the
  staff member. Because both read one ledger, an admin edit shows up for staff
  on their next load.

### Authorization

`leave_adjustments` and `sunday_duties`: writes admin-only
(`WRITE_ROLES`), reads scoped like the other HR collections — a `staff` user
sees only their own rows (`OWN_SCOPED_FOR_STAFF`), a department head only their
department's members (`DEPT_SCOPED_BY_STAFF`).

## Data flow

1. Staff files a leave request → approved → attendance sync (unchanged).
2. Biometric import writes attendance rows (unchanged).
3. Admin opens the balances page and runs *Scan week-off duty* → attendance rows
   on a non-working day with present/half-day/overtime become pending
   `sunday_duties`.
4. Admin converts one → a `leave_adjustments` row credits FL (1 day, 0.5 for a
   half day) and the duty flips to `converted`.
5. Admin edits a quota or adds an adjustment from the panel → the next ledger
   read reflects it, for admin and staff alike.

## Error handling

- Pure layer never throws: bad dates count as zero days, unknown leave codes are
  ignored rather than mis-bucketed.
- Detection is idempotent: re-running the scan never duplicates a duty row.
- Conversion is guarded: a duty already `converted` is refused, so a double click
  cannot double-credit.
- Audit logging failures never block the operation (existing `logAudit`
  behaviour).

## Testing

`src/lib/leave-ledger.test.ts` covers the quota resolution ladder, bucket
mapping including the legacy `SL`/`CO` codes, half-day arithmetic, adjustment
credits and debits, negative-balance clamping for both staff categories,
month-splitting across a boundary, and the Sunday summary. The existing
`requests.test.ts` continues to cover the re-exported helpers.
