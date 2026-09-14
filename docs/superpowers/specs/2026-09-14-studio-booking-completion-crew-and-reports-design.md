# Studio booking completion crew + reports rebuild

Date: 2026-09-14

## Problem

1. Marking a studio booking **Complete** writes the status immediately. Nobody records who
   actually shot the job or who walked away with the memory card, so footage handover is
   untracked.
2. Clicking a booking row does nothing — the only way to see a booking's full details is the
   Edit form.
3. `/dashboard/studio/reports` is thin: four stat cards and two bar lists, all-time only. It
   also shows a raw Firestore studio id when `studioName` is missing, and its average-duration
   figure divides cancelled-excluded minutes by the *total* booking count.

## Scope

### 1. Completion crew capture

`StudioBooking` gains an optional `completion` block, written only by the Complete action:

```ts
export interface BookingCrewMember {
  /** Absent when the person is external (free-text entry). */
  staffId?: string;
  name: string;
}

completion?: {
  shooters?: BookingCrewMember[];   // many
  cardHolder?: BookingCrewMember;   // one
  completedAt: Timestamp;
  completedBy: string;
  completedByName?: string;
};
```

Nested rather than flat top-level fields: the group is owned by one action, reads and writes as
one field, and leaves no stray keys on bookings that never completed.

Both crew fields are **fully optional** — Complete submits with them empty.

People come from the active `staff` collection; typing a name that matches nothing offers
"Add <name> (external)", stored as `{ name }` with no `staffId`.

### 2. Booking view dialog

Row click opens a read-only dialog: studio, date, slot, duration, type, purpose, client and
contact, reserved items, assigned staff, completion crew, status history, requester and
approver. Edit and Delete live inside it as well. Row action buttons stop propagation.

The bookings table gains a crew sub-line under Purpose for completed bookings.

### 3. Reports rebuild

Out of scope: per-studio operating hours. Bookings are ad-hoc, taken per client at the client's
time, so there is no capacity baseline — utilization % is deliberately **not** computed.

- Date-range filter: this month / last month / last 90 days / all time.
- Stats: total bookings, completed, total booked hours, average duration, cancellation rate.
- Panels: bookings per studio (hours + count), by type, by status, peak hours, busiest day,
  top clients, crew leaderboard (shoots per shooter, sourced from `completion.shooters`).
- Completed-bookings table with CSV export.
- Studio names resolved against the `studios` collection so ids never surface.
- `PageLoader` while loading; empty states instead of zero-width bars.

Fixes: average duration divides by the same set it sums (active bookings only).

## Architecture

Pure logic lives in libs and is unit-tested; pages stay presentational.

| Unit | Responsibility |
|---|---|
| `src/lib/studio-crew.ts` | Normalize / dedupe / format crew members, drop blank entries before write |
| `src/lib/studio-reports.ts` | Range filtering and every report aggregation, plus CSV rows |
| `src/components/studio/staff-picker.tsx` | Searchable staff selection, single or multiple, free-text external entries |
| `src/components/studio/booking-complete-dialog.tsx` | Collects crew, emits one completion payload |
| `src/components/studio/booking-view-dialog.tsx` | Read-only booking detail |

## Error handling

Dialog write failures toast and leave the dialog open so entry is not lost. Crew entries with
blank names are dropped before the write. The existing completion notification to the booking
requester is unchanged.

## Testing

Vitest covers `studio-crew` and `studio-reports` (the repo's `src/**/*.test.ts` suite is
node-environment and does not run component tests). Verification: `vitest run`, `tsc --noEmit`,
`eslint`, `next build`.
