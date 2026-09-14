# Attendance ↔ Leave Balances — two-way sync

Date: 2026-09-14
Status: awaiting approval

## Problem

The Attendance register and Leave Balances describe the same days and do not
agree, in both directions.

**Leave marked on attendance never reaches the ledger.** `loadOrgLedgers` feeds
`computeLeaveLedger` from four sources: approved leave requests, manual
`leave_adjustments`, `sunday_duties`, and attendance filtered to
`status == "on-duty"`. Attendance rows carrying `casual-leave`,
`earned-leave`, `medical-leave` or `full-leave` are read by nothing — yet the
register's own editor offers exactly those statuses. Mark a week of CL on the
Monthly Grid and the grid shows CL while Leave Balances still reads Used 0,
Remaining 12.

**Approved leave never reaches attendance.** Approving a leave request moves the
balance and writes no attendance record, so the biometric import's `absent`
stands for those days. The person reads as absent on one page and as approved
leave on the other. This writeback existed once: `Attendance.leaveRequestId`
and `source: "leave"` are still declared in `src/types/index.ts`, written by
nothing, and `normalizeAttendanceStatus` still carries the comment "Legacy
leave-sync records stored 'leave'".

**Week-off conversion is the one path that works**, and only because someone
presses *Scan week-off duty*. It is also the shape the rest of this should copy.

Out of scope but worth noting as already fixed: the register's counters matched
raw status strings, so "Leave Days" ignored every CL/EL/ML/FL row and "Present
Days" ignored overtime. That moved to `src/lib/attendance-stats.ts` under test.

## The rule

For any (staff, day), exactly one thing owns what that day means for leave:

1. an approved leave request covering it, or
2. a manual attendance mark, or
3. neither — it is a working day, an absence, or a week-off.

The ledger stays the single authority on balances. Attendance stays the single
authority on what happened on a day. Neither is recomputed from the other; each
posts a record into the other's store, and every posted record names its source
so it can be found again, updated, and reversed.

## Direction A — approved request writes attendance

On a request reaching `approved`, upsert one attendance row per covered day:

- `status` from the bucket: CL → `casual-leave`, EL → `earned-leave`,
  SL/ML → `medical-leave`, CO/FL → `full-leave`
- `leaveRequestId` = the request id (the field already exists)
- `source: "leave"` (the enum value already exists)
- a half-day request writes one row with `workingHours` untouched and the day
  counted as 0.5 by the ledger, which already handles `isHalfDay` on the request

Precedence when a row already exists for that day:

| Existing row | Action |
| --- | --- |
| `absent` | overwrite — they were on approved leave, not absent |
| another request's `leaveRequestId` | leave alone, report as a conflict |
| `present`, `on-duty`, `overtime` | leave alone, report as a conflict — they worked despite approved leave, and that is a fact someone must look at, not something to silently erase |
| `week-off`, `public-holiday` | leave alone; the day was never a working day |

When a previously approved request is rejected, cancelled or deleted, the rows
carrying its `leaveRequestId` are removed. Days it overwrote are not restored —
the import is the authority for those and can be re-run.

## Direction B — unbacked attendance marks post an adjustment

An attendance row with a leave status and **no** `leaveRequestId` was marked by
hand or came from an import. It posts one `leave_adjustment`:

- `bucket` from the status, `days: -1` (`-0.5` for a half day), `date` = the day
- `kind: "attendance"` — a new `LeaveAdjustmentKind`
- `sourceAttendanceId` = the attendance document id — a new field

`sourceAttendanceId` is what makes this idempotent: reconciling twice never
double-posts, editing the attendance row updates its adjustment, and deleting
the row deletes it. This is deliberately not "let the ledger read attendance
directly" — an adjustment leaves an audit row and a reversal path, so a
re-import that mis-maps a status can be traced and undone instead of silently
moving every balance on the page.

**The double-count guard** is the pair of them: a day written by direction A
carries `leaveRequestId`, and direction B skips any row that has one. The
request already consumed the day.

## Where it runs

- Direction A: in the approval handler, beside the existing status write.
- Direction B: a *Reconcile attendance leave* action next to *Scan week-off
  duty* on Leave Balances, and again at the end of an attendance import.

Both report what they did and what they could not do — created, updated,
removed, and the conflict list from the table above.

## Schema

```ts
// types/index.ts
LeaveAdjustmentKind |= "attendance"
LeaveAdjustment.sourceAttendanceId?: string
```

`Attendance.leaveRequestId` and `source: "leave"` are reused as-is.

## Import status picker

`STATUS_OPTIONS` on the import page offers the legacy set — `late`, `leave`,
`wfh` — and none of CL/EL/ML/FL. An import therefore cannot mark a real bucket.
It should offer the active statuses, so that direction B has something true to
reconcile.

## Tests

The moving parts are planners, pure and tested directly; the writers are thin.

- `attendanceStatusForBucket` / `bucketForAttendanceStatus` round-trip, including
  the legacy codes
- `planRequestWriteback(request, existingRows)` — upserts per day, each
  precedence row in the table above, a half day, a request spanning a month
  boundary, and removal when the request is withdrawn
- `planAttendanceReconcile(rows, existingAdjustments)` — creates one adjustment
  per unbacked day; skips rows carrying `leaveRequestId`; re-running produces no
  change; an edited row updates rather than duplicates; a deleted row removes
- the invariant: no day is ever counted by both a request and an adjustment

## Out of scope

Backfilling history — the reconcile action covers a chosen year on demand.
Deciding whether an absence should become LOP; absences stay absences.
