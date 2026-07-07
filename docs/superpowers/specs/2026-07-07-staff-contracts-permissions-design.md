# Staff Contracts, Job Description & Wizard Permissions — Design

## Context

Staff Management (`src/app/(dashboard)/dashboard/staff/`) has a 2-step Add/Edit
wizard and a feature-based RBAC system already live on the staff detail page's
"Access & Features" tab (`src/lib/permissions.ts`: `FEATURES`, `roleHasFeature`,
`grantedFeatures` override array). This design adds job description and
contract duration/expiry tracking (with an extension history log), surfaces
the existing permission picker as a 3rd wizard step at creation time, and
trims the wizard's required fields down to the ones actually needed.

## 1. Data model — `src/types/index.ts`

```ts
export type ContractType =
  | "3-months" | "6-months" | "12-months" | "24-months" | "36-months"
  | "permanent" | "custom";
```

`Staff` gains:
- `jobDescription?: string`
- `contractType?: ContractType`
- `contractEndDate?: Timestamp | null`

New interface:

```ts
export interface ContractHistory extends BaseDocument {
  previousEndDate: Timestamp | null;
  newEndDate: Timestamp | null;
  contractType: ContractType;
  reason: string;
  extendedOn: Timestamp;
}
```

Sub-collection path: `staff/{staffId}/contractHistory` — same pattern as the
existing `salaryHistory` / `statusHistory` sub-collections.

## 2. `src/lib/contract-utils.ts` (new)

Pure functions, no side effects — same style as `src/lib/asset-availability.ts`.

- `CONTRACT_DURATIONS: { value: ContractType; label: string; months: number | null }[]`
  — presets for 3/6/12/24/36 months, `permanent` (months: `null`), `custom`
  (months: `null`)
- `addMonths(date: Date, months: number): Date`
- `computeContractEndDate(start: Date, type: ContractType, customEnd?: Date): Date | null`
  — `null` for `permanent`; `customEnd` passthrough for `custom`; `start + months`
  otherwise
- `CONTRACT_WARNING_DAYS = 30`
- `getDaysRemaining(end: Date | null | undefined, today?: Date): number | null`
- `getContractStatus(end: Date | null | undefined, today?: Date): "none" | "active" | "expiring-soon" | "expired"`
  — `none` = no end date (permanent/unset), `expired` = daysRemaining < 0,
  `expiring-soon` = 0–30 days remaining, else `active`

Paired `src/lib/contract-utils.test.ts` (vitest, mirrors
`asset-availability.test.ts`) covering: permanent → `none`, custom end date
passthrough, preset month math, expiring-soon boundary at day 30/31, expired.

## 3. Add/Edit Staff wizard — `src/app/(dashboard)/dashboard/staff/page.tsx`

**Step tabs:** "1. Personal Info" → "2. Work & Address" → "3. Permissions" (new).

**Required-field trim (steps 1/2):** only Employee Code, Role, First Name,
Last Name, Mobile keep the `required` prop — these are the staff-login
credentials (`src/app/api/auth/staff-login/route.ts:22-44` authenticates on
employee code + last 4 digits of mobile) plus core identity/role. Email, Date
of Birth, Gender, Date of Joining, Company, Department, Designation, and Base
Salary become optional (drop `required`, keep existing defaults/prefills).

**Employee Code:** remove the `disabled` prop — becomes an editable `Input`
in both create and edit, still prefilled via `generateEmployeeCode()` on
create. No new uniqueness check is added (none exists today for the
auto-generated code either).

**Step 2 additions** (below Designation/Base Salary, above the Address
section):
- Job Description — `Textarea`, optional
- Contract Duration — `Select` sourced from `CONTRACT_DURATIONS`
- Contract End Date — `DatePicker`, `min={form.dateOfJoining}` (native
  guard against an end date before the join date). Recomputed via
  `computeContractEndDate(dateOfJoining, contractType)` **only when
  `contractType` changes** — never on a `dateOfJoining` edit alone, so
  editing an existing staff member's join date months later can't silently
  shift an already-set contract end date. This recompute also fires for
  `permanent` (clears the end date to `null`, so switching to Permanent
  can't leave a stale date behind) and for `custom` (clears to `null` for
  manual entry, since there's nothing to compute). Stays manually editable
  after the recompute; the field is hidden when `contractType === "permanent"`.
  Trade-off: if an admin changes DOJ *during initial creation*, after
  already picking a duration, the end date won't auto-adjust — they can
  re-pick the duration (or edit the date directly) to refresh it. Accepted
  to avoid a second start-date field.

**Step 3 (new) — Permissions:** same checkbox grid as the detail page's
Access & Features tab (`FEATURES` + `roleHasFeature`), bound to a new
`form.grantedFeatures: string[]`. Role-default features render checked and
disabled with a "Role default" tag; extras are toggleable. Step 1's "Next"
still goes to step 2; step 2 gets Back/Next; step 3 gets Back/Cancel/Submit
(replacing step 2's current Cancel/Submit row).

**`handleSave`:** persists `jobDescription`, `contractType`,
`contractEndDate` (`Timestamp` or `null` for permanent), and
`grantedFeatures` on the staff doc.

**`handleOpen`:** populates all four from the existing record on edit;
defaults to `contractType: "permanent"` and `grantedFeatures: []` on create.

## 4. Staff table warning — same file, list view

Compute `getContractStatus(...)` per row client-side (the page already loads
10 rows — no new Firestore index needed). If `expiring-soon` or `expired`,
render a small badge under the Status badge: amber "Contract: Nd left" / red
"Contract expired".

## 5. Staff detail page — `src/app/(dashboard)/dashboard/staff/[id]/page.tsx`

- **Overview tab:** new sidebar card "Contract" (type label, end date,
  days-remaining or "Permanent"/"Expired Nd ago", color-coded by status),
  placed under the "Current Salary" card. Job Description renders as a text
  block inside the existing Personal Information card.
- **Header actions:** new "Contract" button next to Salary/Status, opening an
  Extend Contract dialog. Shows the current contract (type + end date,
  read-only) same as the existing Salary dialog shows current salary before
  asking for the new one, then: contract type select + conditional custom
  end date (`min` = today) + reason. Submitting writes a `contractHistory`
  sub-doc and updates `staff.contractType` / `staff.contractEndDate`.
- **"Salary & Status" tab:** gains a third card, "Contract History", listing
  `contractHistory` sub-docs with the same list styling as Status History
  (previous → new end date, reason, extendedOn date).
- `fetchData()` fetches `contractHistory` alongside `salaryHistory` /
  `statusHistory`.

## Out of scope (skipped, lean by design)

- Firestore composite index on `contractEndDate` — not needed at current
  scale; client-side compute over the already-loaded page is enough. Add if
  a dedicated "expiring contracts" report/query shows up later.
- Employee Code uniqueness validation — none exists today for the
  auto-generated code either; add if collisions become a real problem.
- Contract expiry notifications/emails — the table badge is the only alert
  channel requested.
