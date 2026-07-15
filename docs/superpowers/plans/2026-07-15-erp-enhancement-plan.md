# D4-ERP Enhancement Plan

> **Status:** Draft for review — 2026-07-15
> **Execution:** One phase at a time, in order. Each phase ships independently and is verified (type-check + manual mobile test) before the next starts.
> **Requirements source:** Owner's 20-point list (mobile UX, workflows, roles, payroll, certificates, tasks, calendar).

**Goal:** Turn D4-ERP into a mobile-first ERP with proper multi-step request workflows, role-scoped dynamic dashboards, and complete staff lifecycle (join → assets → requests → payroll → certificates → terminate).

**Architecture:** Next.js App Router + Firestore (client SDK via `src/lib/firestore.ts`). All new features extend existing collections/types in `src/types/index.ts` — no new backend. Approval workflows are status-field state machines on documents; role scoping is query-level `where("departmentId", "==", ...)` filters plus a config-driven sidebar.

**Tech stack:** Existing — Next.js, Tailwind, zustand, lucide, Firestore, DO Spaces uploads. Add: `recharts` (charts), `xlsx` (Excel attendance import). Nothing else.

## Global constraints

- Mobile-first concrete rules (apply to every touched page):
  - Hero/header ≤ 80px tall on mobile; stat cards always 2-col below `lg`; tap targets ≥ 44px.
  - Wide tables collapse to stacked cards below `sm` (or scroll inside their own container — page body never scrolls horizontally).
  - Charts in `w-full` containers with fixed heights; sidebar stays drawer on mobile.
- Service-layer convention: multi-step Firestore mutations live in `src/lib/*.ts` helpers (`requests.ts`, `scope.ts`, `certificates.ts`, …) — pages call helpers, never inline compound writes.
- UI-state convention: every list/detail page handles loading, empty, and error (toast + retry) states.
- New admin config pages live under `/dashboard/settings/*` (navigation, certificate templates, payroll rules) — settings is the single control center.
- All requests follow **2-step approval: dept head → admin. Admin can view at any stage and can approve directly (override) without dept-head approval.**
- Department heads see ONLY their own department's data everywhere. No cross-dept leakage.
- Terminated staff = soft delete: `status: "terminated"`, `isActive: false`, records retained and viewable (never hard delete).
- Roles: `admin | department-head | accounts | staff` (existing `StaffRole`). Feature keys via existing `grantedFeatures` / `hasFeature`.
- Conventional commit format.

---

## Phase 1 — Mobile-first UI pass (items 1, 2, 3, 13)

**Status: partially done** (main dashboard grid + compact hero header shipped 2026-07-15).

### Remaining work

**Files to modify:**
- `src/app/(dashboard)/dashboard/staff/page.tsx` — stat cards → 2-col mobile grid, clickable
- `src/app/(dashboard)/dashboard/attendance/page.tsx` — same
- `src/app/(dashboard)/dashboard/leaves/page.tsx` — same
- `src/app/(dashboard)/dashboard/payroll/page.tsx` — same
- `src/app/(dashboard)/dashboard/tasks/page.tsx` — same
- `src/app/(dashboard)/dashboard/reports/page.tsx` — same
- `src/app/(staff-portal)/staff-portal/page.tsx` — staff home cards same treatment
- `src/components/ui/stat-card.tsx` — **Create**: one shared `<StatCard title value icon color bg href loading />` so the compact-grid pattern lives in one place. Replace inline card markup on the pages above with it.

**Sidebar consolidation (item 13):**
- `src/lib/navigation.ts` — merge low-traffic modules: fold "Organization" into "System" for admin; move "Events" + "Studio" under one "Bookings" module (matches Phase 11 calendar merge). Target: ≤ 7 top-level modules per role.

**Acceptance:**
- 360px viewport: no page requires horizontal scroll; stat sections are 2-col; hero ≤ 64px tall.
- Every stat card navigates somewhere sensible.
- Type-check clean.

---

## Phase 2 — Unified staff request workflow (items 8, 11, 20 + "note")

The core workflow phase. One request engine for: leave, WFH, long-leave, salary-increment, overtime, other. Replaces the single-step `leaveRequests` approval.

### Data model (`src/types/index.ts`)

Extend the existing `leaveRequests` collection (keeps history; old docs read as legacy single-step):

```ts
export type StaffRequestType =
  | "leave" | "wfh" | "long-leave" | "salary-increment" | "overtime" | "on-duty" | "other";

export type ApprovalStepStatus = "pending" | "approved" | "rejected";

export interface ApprovalStep {
  status: ApprovalStepStatus;
  by?: string;          // staffId
  byName?: string;
  at?: Timestamp;
  remarks?: string;
}

export interface StaffRequest extends BaseDocument {
  staffId: string;
  staffName?: string;
  departmentId: string;
  type: StaffRequestType;
  leaveType?: LeaveType;            // for leave/long-leave
  isHalfDay?: boolean;
  session?: HalfDaySession;
  startDate: Timestamp;
  endDate: Timestamp;
  startTime?: string;               // overtime window
  endTime?: string;
  requestedAmount?: number;         // salary-increment
  reason: string;
  attachments?: { name: string; url: string; type: string; size?: number }[];
  deptHead: ApprovalStep;           // step 1
  admin: ApprovalStep;              // step 2
  /** Derived overall: pending | approved | rejected | cancelled */
  status: RequestStatus;
  /** True when admin approved without dept-head approval. */
  adminOverride?: boolean;
}
```

Overall-status rule (single helper `resolveRequestStatus(req)` in `src/lib/requests.ts`):
- admin rejected OR dept head rejected → `rejected`
- admin approved → `approved` (sets `adminOverride: true` if deptHead still pending)
- else → `pending`

State machine (explicit, GPT r2 #5):

```text
created (both steps pending)
  ├─ staff cancels (before any decision) ──────────→ cancelled
  ├─ dept head rejects ────────────────────────────→ rejected
  ├─ dept head approves → admin pending
  │     ├─ admin rejects ──────────────────────────→ rejected
  │     └─ admin approves ─────────────────────────→ approved
  └─ admin approves directly (adminOverride) ──────→ approved
```

Terminal states (`approved`/`rejected`/`cancelled`) are immutable — no further step writes allowed (enforced in helper + Firestore rules).

Comments: reuse existing `Comment` with `entityType: "staff_request"` (add to `CommentEntityType` union) — communication thread per request.

**Activity timeline (GPT #5):** request detail renders a Jira-style vertical timeline derived from existing data — `createdAt` → comments → `deptHead.at` → `admin.at`. No new schema; pure render.

**Audit (GPT #19):** every approve/reject writes an `AuditLog` entry (collection + page already exist) — action `"approve"`/`"reject"`, module `"requests"`, old/new status.

### Files

- **Create** `src/lib/requests.ts` — create/approve/reject/cancel helpers, status resolver, notification fan-out (`AppNotification` to dept head on create, to admin on dept-head approval, to staff on any decision).
- **Modify** `src/app/(staff-portal)/staff-portal/leave/page.tsx` — becomes "New Request": type selector (leave/WFH/long-leave/increment/overtime/other), file attach (existing DO Spaces upload util), overtime asks "which day next month" via date picker.
- **Modify** `src/app/(staff-portal)/staff-portal/my-leaves/page.tsx` → "My Requests": shows both approval steps as a 2-step progress indicator + comment thread.
- **Modify** `src/app/(dashboard)/dashboard/leaves/page.tsx` → "Requests" inbox: dept head sees own-dept pending step-1; admin sees all with both steps; approve/reject with remarks; comment thread.
- **Modify** `src/app/(dashboard)/dashboard/page.tsx` — "Today's Requests" widget (item 11): pending requests created today, filtered by role scope, each row links to the request.

### Overtime specifics (item 20)

On final (admin) approval of an `overtime` request:
1. Create `CalendarEvent` (type `"reminder"`, scope `"personal"`, assignedStaff `[staffId]`) on the requested date → shows in staff calendar.
2. Payroll consolidation reads approved overtime requests for the month → feeds `Payroll.overtimeHours` + `earnings.overtime` (Phase 6 wires the calc).
3. Monthly view: staff portal attendance page lists approved overtime for the month.

**Acceptance:**
- Staff submits increment request w/ PDF attach → dept head sees it same day in inbox + dashboard widget → approves → admin sees it, approves → staff notified, both steps green.
- Admin approves a request the dept head hasn't touched → status approved, `adminOverride` flagged, dept head inbox shows it as decided.
- Dept head of dept A never sees dept B requests.

---

## Phase 3 — Dynamic menus, role page-visibility, dept scoping (items 5, 15, 16)

### 3a. Admin-configurable navigation

Settings doc `settings/navigationConfig`:

```ts
export interface NavigationConfig extends BaseDocument {
  /** role → allowed nav hrefs. Missing role = role defaults from navigation.ts. */
  roleMenus: Partial<Record<StaffRole, string[]>>;
  /** staffId → extra hrefs granted / removed for an individual. */
  staffOverrides?: Record<string, { allow?: string[]; deny?: string[] }>;
  /** role → visible dashboard widget keys, in display order (GPT #2, lite: checkboxes + order, no drag-drop). */
  dashboardWidgets?: Partial<Record<StaffRole, string[]>>;
}
```

Widget keys registered in one map in the dashboard page (`"stats" | "income-expense" | "attendance-trend" | "task-donut" | "todays-requests" | "leave-usage"`); dashboard renders only the role's configured widgets, defaults hardcoded.

- **Create** `src/app/(dashboard)/dashboard/settings/navigation/page.tsx` — admin matrix UI: rows = every nav item from `navigationModules` (module / submenu / item level), columns = roles + per-staff picker. Checkboxes write `navigationConfig`.
- **Modify** `src/components/layout/sidebar.tsx` — `isVisible` consults `navigationConfig` first (fetched once into zustand), falls back to hardcoded `roles` array.
- **Modify** `src/lib/navigation.ts` — export flat list helper `getAllNavItems()` for the matrix UI.

### 3b. Department scoping audit (item 16)

Sweep every dashboard page that lists staff-related data; for `role === "department-head"` add `where("departmentId", "==", user.departmentId)`:
- staff, leaves/requests, attendance (+ reports/corrections), tasks (+ work-logs, daily-updates, performance), calendar dept scope, department reports.

**Create** `src/lib/scope.ts` — `deptScope(user): QueryConstraint[]` helper returning `[]` for admin, `[where("departmentId","==",user.departmentId)]` for dept head. Use it in all the above pages so the rule is one line per page.

### 3c. Server-side enforcement — Firestore security rules (GPT #16, adopted)

Client-side `where()` filters are UI convenience only — a dept head with devtools can query other depts. Enforce in `firestore.rules`:

- `staff`, `leaveRequests`, `attendance`, `tasks`, `workLogs`, `departmentReports`: read allowed when `request.auth.token.role == "admin"` OR (`role == "department-head"` AND `resource.data.departmentId == request.auth.token.departmentId`) OR own-record (`resource.data.staffId == request.auth.uid` mapping via staff doc).
- Requires setting custom claims (`role`, `departmentId`, `staffId`) at login — add a small Firebase callable/Admin-SDK script for claim sync when staff role/department changes.
- Writes: approval-step fields only writable by the matching role.
- Deploy + test with Firestore rules emulator.

**Acceptance:** dept head account sees only own-dept staff/requests/attendance/tasks everywhere; a hand-crafted cross-dept query is DENIED by rules (verified in emulator); admin unchanged; menu matrix changes reflect in sidebar after reload.

---

## Phase 4 — Dashboards with charts, role-dynamic content (items 4, 10b)

Add `recharts`. **Create** `src/components/charts/` — thin wrappers: `AttendanceTrendChart` (line, present/late/absent per day), `TaskStatusChart` (donut), `IncomeExpenseChart` (bar, monthly), `LeaveUsageChart` (stacked bar by type).

- **Modify** `src/app/(dashboard)/dashboard/page.tsx` — role-branched content:
  - **admin:** stat grid (done) + income/expense bar + attendance trend (company) + task donut + today's requests (Phase 2).
  - **department-head:** own-dept stats, dept attendance trend, dept task donut, pending step-1 requests.
  - **accounts:** finance cards, income/expense, invoice aging list.
- **Modify** `src/app/(staff-portal)/staff-portal/page.tsx` — staff dashboard (item 10b): personal attendance graph for current month (responsive — chart container `w-full h-56`), leave balance rings, my open tasks, approved overtime days.
- Monthly income/expense on admin dashboard currently hardcoded ₹0 — wire to `transactions` collection filtered to current month.

**Acceptance:** each role sees distinct dashboard; charts render at 360px without overflow; income/expense shows real transaction sums.

---

## Phase 5 — Staff lifecycle: joining assets, portal detail, terminate (items 7, 17, 18)

### 5a. Company-provided assets on staff (item 7)

Assets + assignments already exist. Work is UI wiring:
- **Modify** staff add/edit form (`src/app/(dashboard)/dashboard/staff/` form component) — "Company Assets Provided" section: multi-select of `assets` where `status == "available"` + free-text rows for consumables (wire, SSD). On save → create `AssetAssignment` per item + set asset `status: "assigned"`, `currentAssigneeId`.
- **Modify** `src/app/(dashboard)/dashboard/staff/[id]/page.tsx` — "Assets" tab listing current + returned assignments.
- **Modify** staff portal profile — read-only "My Assets" list.

### 5b. Staff portal full detail (item 17)

- **Modify** `src/app/(staff-portal)/staff-portal/profile/page.tsx` — tabs: Overview (personal + employment + contract), Salary (current salary, `salaryHistory` timeline, payslip list from `payrolls`), Documents (existing `employeeDocuments` viewer), Assets (5a).

### 5c. Terminate = soft delete (item 18)

Status machinery exists (`StaffStatus`, `StatusHistory`). Add:

- Extend `StaffStatus` with `"notice-period" | "relieved"` (GPT #17) — full lifecycle: active → notice-period → relieved/terminated. Status change = same dialog, writes `StatusHistory`.
- Terminate action on staff detail (admin only): reason dialog → `status: "terminated"`, `isActive: false`, `StatusHistory` entry, return all assigned assets (prompt), revoke login flag, `AuditLog` entry.
- **Modify** `src/app/(dashboard)/dashboard/staff/page.tsx` — filter tabs: Active / Suspended / Terminated. Terminated list opens full read-only record (all tabs incl. payroll dossier — Phase 6).

**Acceptance:** new staff saved with 2 assets → assets show assigned; terminate staff → disappears from active list, full record readable under Terminated tab, assets returned.

---

## Phase 6 — Payroll workflow & history (item 9)

- **Modify** `src/app/(dashboard)/dashboard/payroll/page.tsx` — month generation reads: attendance (present/LOP days), approved leave requests (LOP type → `deductions.lop`), approved overtime requests (Phase 2) → `overtimeHours`/`earnings.overtime`. LOP formula: `dailyRate = currentSalary / workingDays; lop = dailyRate * lopDays`.
- **Expose full salary components in the generation form + payslip (GPT #10):** `Payroll` type already has `earnings.{basic,hra,da,bonus,allowances}` and `deductions.{pf,esi,tds,advance,loanRecovery}` — currently unused fields become editable inputs; payslip shows the full breakdown. Salary revision history = existing `salaryHistory` subcollection rendered in the dossier.
- **Create** `src/app/(dashboard)/dashboard/payroll/staff/[id]/page.tsx` — per-staff payroll dossier: year selector, 12-month table (paid amount, LOP days, overtime, net), totals row, payslip open per month. This same view is the post-termination "soft copy" — linked from terminated staff record.
- Staff portal Salary tab (Phase 5b) reuses the dossier read-only.

**Acceptance:** staff with 2 LOP days + approved 1-day overtime in month → generated payroll shows correct lop deduction + overtime earning; terminated staff dossier shows full year history.

---

## Phase 7 — Attendance: Excel import, editable grid, monthly report (items 10, 19)

- **Modify** `src/app/(dashboard)/dashboard/attendance/import/page.tsx` — add `xlsx` upload path beside existing ESSL PDF: parse rows (biometricId/employeeCode, date, in, out) → same preview → **editable preview grid** (inline edit in/out/status per row) → commit via existing `AttendanceImportBatch` flow (rollback preserved).
- **Modify** `src/app/(dashboard)/dashboard/attendance/page.tsx` — after import, month grid: all staff rows editable inline (admin/dept-head w/ dept scope).
- **Modify** `src/app/(dashboard)/dashboard/attendance/reports/page.tsx` (item 19) — monthly matrix: staff × days with status glyphs, summary cols (present/absent/late/leave/OT hours/LOP), month picker, CSV export; virtualize rows if > 50 staff.

**Acceptance:** upload xlsx of 28 staff × month → preview shows parse, edit one wrong checkout, commit → attendance page reflects; monthly report loads < 2s and exports CSV.

---

## Phase 8 — Certificate generation from templates (item 8, second one)

- **Create** `src/lib/certificates.ts` — HTML template render → PDF (reuse existing invoice PDF approach if present in `src/lib`; else print-CSS page). Templates: Best Employee (Month), Best Employee (Year), Experience Certificate, Relieving Letter, Appointment Letter, Internship Completion. Placeholders: `{{name}} {{designation}} {{department}} {{joinDate}} {{endDate}} {{month}} {{year}} {{companyName}} {{signatoryName}}`.
- **Templates stored in Firestore, admin-editable (GPT #18, lite):** `certificateTemplates` collection — `{ name, bodyHtml, logoUrl?, signatureUrl?, signatoryName }`. Defaults seeded on first load; admin edits body text + uploads logo/signature on the certificates page. Full drag-drop template builder skipped — YAGNI.
- **Create** `src/app/(dashboard)/dashboard/staff/certificates/page.tsx` — pick template → pick staff → live preview → Generate: saves PDF to DO Spaces + `employeeDocuments` (category `"certificate"`/`"experience-letter"`/`"relieving-letter"`) + notification to staff. Staff sees it under portal Documents.

**Acceptance:** generate Best Employee July 2026 for a staff → PDF opens, doc appears in staff portal Documents, notification received.

---

## Phase 9 — Dept-head monthly report submission (item 6)

Extend existing `DepartmentReport` (already has autoMetrics + KPIs):

```ts
// add to DepartmentReport
staffBreakdown?: {
  staffId: string; staffName: string;
  attendance: { present: number; late: number; absent: number; leaves: number };
  tasksCompleted: number; workLogHours: number;
  remarks?: string;
}[];
submittedAt?: Timestamp;   // dept head submit
status: ReportStatus | "submitted";  // draft | submitted | published
```

- **Modify** `src/app/(dashboard)/dashboard/reports/department/page.tsx` — dept head: "Generate monthly report" auto-fills per-staff breakdown from attendance/tasks/work-logs, editable remarks per staff, Submit → notification to admin; admin: submitted reports inbox, per-staff + total view.

**Acceptance:** dept head generates July report → per-staff rows auto-filled → submit → admin sees it under Department Reports with totals.

---

## Phase 10 — ClickUp-style public task board (item 12)

- **Modify** `src/app/(dashboard)/dashboard/tasks/page.tsx` and **Create** `src/app/(staff-portal)/staff-portal/tasks/page.tsx` (all-staff visible board, nav item added):
  - Views: Board (status columns) + List (grouped by assignee). Everyone can VIEW all tasks + assignee + `completionPercentage` + status.
  - Edit rights: assignee updates own status/progress/comments; dept head edits dept tasks; admin all.
  - Task detail drawer: subtasks checklist, progress slider, comments (existing `TaskComment`), activity trail.
- Mobile: board columns horizontal-scroll snap; list default on < `sm`.

**Acceptance:** staff A sees staff B's task and its progress; staff A can comment but not edit B's task; status change updates for dept head.

---

## Phase 11 — One calendar for events + studio (item 14)

- **Modify** `src/app/(dashboard)/dashboard/calendar/page.tsx` — overlay three sources with type filter chips: `calendarEvents`, `managedEvents`, `studioBookings` (distinct colors). Creating: "+" opens type chooser (Event / Studio booking) but both render on the SAME grid; availability conflicts shown inline (studio slot already booked = red).
- Deprecate separate `/dashboard/events/calendar` + `/dashboard/studio/calendar` nav items (routes stay, nav points to unified calendar) — pairs with Phase 1 sidebar consolidation.

**Acceptance:** July grid shows a managed event and a studio booking together; creating a studio booking from unified calendar blocks that slot; no second calendar for cross-checking.

---

## Execution order & dependencies

| # | Phase | Depends on | Size |
|---|-------|-----------|------|
| 1 | Mobile UI pass | — | S (half done) |
| 2 | Request workflow | — | L |
| 3 | Dynamic menus + dept scope | — | M |
| 4 | Dashboards/charts | 2 (widget), 3 (scope) | M |
| 5 | Staff lifecycle | — | M |
| 6 | Payroll | 2 (overtime), 5 (terminate link) | M |
| 7 | Attendance Excel + reports | — | M |
| 8 | Certificates | — | S |
| 9 | Dept monthly reports | 3 (scope) | S |
| 10 | Task board | 3 (scope) | M |
| 11 | Unified calendar | — | M |

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 11 → 8** (8 anytime; independent).

## GPT plan-review reconciliation (2026-07-15)

External review suggestions triaged. Adopted items are folded into the phases above; rejected items listed with reasons so they aren't re-litigated.

**Adopted:**

| # | Suggestion | Where |
| --- | --- | --- |
| 5 | Request activity timeline (Jira-style) | Phase 2 — derived render, no schema |
| 2 | Dashboard widget visibility per role | Phase 3a — `dashboardWidgets` in NavigationConfig, checkbox + order, no drag-drop |
| 16 | Server-side dept isolation | Phase 3c — Firestore security rules + custom claims (the real fix; client filters are UI-only) |
| 10 | Full payroll components (PF/ESI/TDS/advance/loan) | Phase 6 — fields already exist in `Payroll` type, expose in UI |
| 17 | Notice-period / relieved lifecycle states | Phase 5c — enum extension |
| 18 | Admin-editable certificate templates | Phase 8 — Firestore-stored templates, lite editor |
| 19 | Audit logs on critical actions | Phases 2/5/6/8 — `AuditLog` collection + page ALREADY EXIST; wire new actions into it |
| 7 | Extra charts (payroll cost, leave trends) | Phase 4 — added to admin set if time allows |

**Rejected (with reasons):**

| # | Suggestion | Why not |
| --- | --- | --- |
| 4 | "Generic workflow engine" | Phase 2 already IS one engine — one collection, one ApprovalStep pair, forms differ |
| 20 | Approval delegation | Admin override (already in Phase 2) unblocks a stalled step-1; delegation engine for a 28-person org = over-engineering. Revisit if org grows |
| 15 | Report builder (columns/filters/grouping) | Fixed reports + CSV export cover current needs |
| 22 | Per-user dashboard drag/hide personalization | Role-level config (Phase 3a) is enough at this scale |
| 9 | QR/barcode/AMC asset lifecycle | Asset module already has serial, warranty, bill, damage/repair flows; QR = future nice-to-have |
| 11 | Geofence / face recognition | GPS check-in already exists; face-rec out of scope |
| 6 | Email/push/WhatsApp notification channels | In-app `AppNotification` + fan-out ships in Phase 2; other channels = separate future project |
| 21 | Global search | Ctrl+K palette already exists in header; extending it to more entities = post-plan polish, not a phase |
| 8 | Excel + historical comparison reports | CSV export (opens in Excel) in Phase 7; comparisons deferred |

### Round 2 (2026-07-15, plan frozen after this)

Adopted: concrete mobile rules + service-layer + UI-state conventions (Global constraints), request state-machine diagram (Phase 2), settings-as-control-center routing convention, Future roadmap section below.

Rejected: master-data module (departments/asset-categories/expense-categories/leave-policies/shifts collections already exist as editable data), widget registry (already in Phase 3a verbatim), permission CRUD matrix doc (roles + feature keys + nav config cover it at this scale), separate master-settings phase (routing convention suffices), background jobs phase (no server runtime today — listed under Future).

**Plan is FROZEN. No further roadmap expansion before implementation.**

## Future roadmap (not planned, revisit post-launch)

Scheduled jobs via Cloud Functions (leave-balance accrual, contract/document expiry, birthday reminders) · email/push/WhatsApp notification channels · Google/Outlook calendar sync · QR-coded assets · report builder · approval delegation · public API · face-recognition attendance.

## Verification per phase

- `npx tsc --noEmit` clean.
- Manual mobile check at 360px (Chrome devtools) for every touched page.
- Role check: log in as admin / dept-head / staff, confirm scope rules.
- Commit per phase, conventional format (`feat: phase-2 unified staff request workflow`).
