# Permission Levels and Scope for Feature Grants

**Date:** 2026-09-05
**Status:** Draft for review (P0 fixes shipped the same day; this spec covers P1 to P3)
**Owner:** D4 ERP

## 1. Problem

Feature grants (`grantedFeatures[]` on a staff document) currently unlock a
portal nav link and write access on one or two collections. Every other gate
in the system keys on role: own-record scoping, department scoping, task and
leave workflow rules, `WRITE_ROLES`, page-level `canManage` checks, dashboard
route maps and hard-coded links. A staff member granted a module therefore gets
a fraction of what the role-default user gets, and the fraction differs per
module.

Audit of 2026-09-05 (role `staff` with one grant):

| Grant | Outcome today |
| --- | --- |
| events, work-logs, items, asset-management | full parity |
| studio-booking, invoices, quotations, clients | near parity, gaps by design |
| accounting | view + add only; delete and categories are role-gated |
| tasks | create only; cannot update others' tasks, approve, or return |
| reports | three of ten tiles link into role-only dashboard pages |
| payroll | read own rows only (fixed in P0 by lifting scope on grant) |

Six modules (studio-manage, calendar, attendance-manage, attendance-import,
leaves-manage, tools-vault) cannot be granted to staff at all because no scope
semantics exist for them.

## 2. Decisions already taken

1. Role picks the workspace shell; grants pick capabilities inside it
   (2026-07-22). Unchanged.
2. A grant must give the full module by default, matching the role-default
   user. Finer control is expressed as an explicit **level** on the grant,
   never by silently giving less.
3. **Scope is a per-module property.** People modules (tasks, work logs,
   attendance, leaves, payroll, staff, department reports) scope to
   *department* by default and may be widened to *company*. Master data,
   bookings and finance (events, studio, assets, clients, invoices,
   quotations, items, accounting, tools) are *company* only; those documents
   carry no department.
4. Presets (levels), not a per-action matrix. The data model leaves room for
   per-action overrides and assignment targets later; neither ships now.
5. One authorization core, `can(user, module, action)`, used by UI, route
   guards, `/api/db` policy and query scoping. Role defaults are expressed as
   grants so there is one code path.

## 3. Model

### 3.1 Storage

```ts
// staff document
grants?: Partial<Record<FeatureKey, { level: GrantLevel; scope?: GrantScope }>>;
grantedFeatures?: string[]; // legacy, read for one release, written no more

type GrantLevel = "view" | "operate" | "manage";
type GrantScope = "department" | "company";
```

Normalisation (`effectiveGrants(user)` on the server, `useGrants()` on the
client): a legacy `grantedFeatures` entry becomes `{ level: "manage" }` with
the module's default scope. `/api/auth/me` returns the normalised map; the
JWT stays identity-only.

### 3.2 Registry capability block

Each `FEATURES[]` entry gains:

```ts
capabilities: {
  actions: Record<GrantLevel, ModuleAction[]>; // cumulative: view ⊂ operate ⊂ manage
  defaultScope: GrantScope;
  scopeable: boolean;                          // department ↔ company selectable
  read: string[];                              // collections readable at "view"
  write: string[];                             // collections writable at "operate"+
  manageWrite?: string[];                      // collections writable at "manage" only
  scopedBy?: Record<string, "departmentId" | "staffMembership">;
  workflow?: "task-review" | "leave-approval" | "attendance-review";
  sensitive?: boolean;                         // grant dialog shows a warning
}
```

`ModuleAction` is a closed union: `view | create | edit | delete | assign |
approve | export | configure`. Modules pick the subset that exists for them.

### 3.3 `can()`

```ts
can(user, module, action): boolean
scopeOf(user, module): GrantScope | null
```

1. `admin` → true.
2. Resolve grant: explicit `grants[module]`, else the role-default grant for
   the module (section 3.4), else none → false.
3. `action` must be in `actions[level]` (levels cumulative).
4. Scope is `grant.scope ?? defaultScope`, clamped to `defaultScope` when the
   module is not scopeable.

`hasFeature(subject, key)` remains as `can(subject, key, "view")` so nothing
breaks during migration.

### 3.4 Role defaults as grants

| Role | Grants |
| --- | --- |
| admin | every module, manage, company |
| department-head | tasks, work-logs, calendar, attendance-manage, attendance-import, leaves-manage, reports: manage @ department. studio-booking, events, asset-management, clients: manage @ company |
| accounts | accounting, invoices, quotations, items, payroll, reports, clients: manage @ company |
| staff | none (self-service pages are not grants) |

An explicit grant replaces the role default for that module, in either
direction (a department-head can be limited to `view` on payroll, a staff
member raised to `manage` on tasks).

### 3.5 Module table

| Module | Default scope | Scopeable | view | operate (adds) | manage (adds) |
| --- | --- | --- | --- | --- | --- |
| tasks | department | yes | read tasks in scope | create; edit and delete own-created; comment; assignee moves | edit, assign, delete any in scope; reviewer moves (approve, return) |
| work-logs | department | yes | read logs | edit logs, daily updates | performance, delete |
| attendance-manage | department | yes | read register | review corrections | edit register |
| attendance-import | company | no | read imports | run import | delete import |
| leaves-manage | department | yes | read requests | decide department step | decide final step (company scope only) |
| payroll | company | yes | read payroll rows and inputs | generate, edit | approve, delete |
| calendar | company | no | read | create, edit own events | edit, delete any |
| reports | company | yes | dashboards, sales, productivity | submit department reports | review reports, manage KPIs |
| events | company | no | read | create, edit, status, assign staff, comment | delete, edit shared role list |
| studio-booking | company | no | read bookings, studios | create, edit, delete own bookings | delete any |
| studio-manage | company | no | read resources | edit resources | delete, settings |
| asset-management | company | no | read | assets, movements, events, persons | categories, delete |
| clients | company | no | read | create, edit | delete |
| accounting | company | no | read | add transactions | delete transactions, categories |
| invoices | company | no | read | create, edit, payments, receipts | delete |
| quotations | company | no | read | create, edit | delete, convert to invoice |
| items | company | no | read | create, edit | delete |
| tools-vault | company | no | read (reveals logins, sensitive) | edit | delete |

Rows are the acceptance list for P2; each cell becomes a `can()` call.

## 4. Server

- `db-authz.ts` derives `FEATURE_READ`, `FEATURE_WRITE`, `WRITE_ROLES`
  equivalents and `FEATURE_UNSCOPES` from the registry. The hand-maintained
  maps are deleted once the derived versions pass the existing test-suite
  unchanged (golden behaviour).
- `scopeFilter()` becomes `scopeFilterFor(user, collection)`: `department`
  → `{ departmentId }` or `{ staffId: { $in: deptStaffIds } }` per
  `scopedBy`; `company` → no filter; no grant → existing own-record rule.
- Workflow guards take capabilities: `canTransitionTask(isReviewer, isAssignee, from, to)`
  where `isReviewer = can(user, "tasks", "approve") && inScope`. Leave and
  attendance-correction guards follow the same shape.
- `/api/db` keeps resolving grants from the staff document per request.
- Dashboard `ROUTE_FEATURES` and `ROUTE_ROLES` collapse into one map derived
  from the registry (`routeModule(pathname)`), covering all 18 modules.

## 5. Client

- `useCan()` hook wraps `can()` with the store user. Every page-level
  `role === "…"` or `canManage = [...].includes(role)` in a module page is
  replaced by a `can()` call; the audit list in section 1 is the checklist.
  Remaining role checks are allowed only for shell decisions and truly
  admin-only system pages, and are enumerated in a test allowlist.
- Portal nav: unchanged mechanism (registry `portal.links`), now emitted for
  every module including the six that were dashboard-only; wrapper routes are
  added where missing.
- Hard-coded `/dashboard/...` links inside module pages become `${base}`
  links; a lint-style test fails on new ones.
- Access & Features card: `Access` toggle, `Level` select (view / operate /
  manage, default manage), `Scope` select shown only when scopeable, a
  one-line summary on the collapsed card ("Manage · Department"). Sensitive
  modules show a warning line. Saving writes `grants` and appends an
  `audit_logs` entry.
- **Bundles mirror the admin sidebar.** Admins think in sidebar modules
  ("give Bookings", "give Finance"), while grants are stored per module key.
  The dialog groups cards under the sidebar module with a header toggle that
  ticks every key in the group at the default level and scope:

  | Bundle | Module keys |
  |---|---|
  | Bookings | events, studio-booking |
  | Assets | asset-management |
  | Work | tasks, work-logs, calendar |
  | People | attendance-manage, attendance-import, leaves-manage, payroll |
  | Finance | accounting, invoices, quotations, items, clients, reports |
  | System | studio-manage, tools-vault |

  Bundles are a UI convenience only; storage, `can()` and the server never
  see them. The bundle definition lives in the registry
  (`FEATURES[].bundle`) so the sidebar, the dialog and a parity test share it.

## 6. Migration and compatibility

- No data migration script. Legacy `grantedFeatures` is read and normalised;
  the dialog rewrites a staff document to `grants` on its next save.
- `hasFeature` keeps its signature and semantics.
- Existing tests (`db-authz.test.ts`, `permissions.test.ts`,
  `portal-nav.test.ts`, `navigation.test.ts`, `task-workflow.test.ts`) are the
  golden suite; P1 must pass them unchanged before any map is deleted.

## 7. Testing

- Unit: `can()` truth tables per module and level; scope clamping; legacy
  normalisation; registry invariants (levels cumulative, scopeable only when
  `scopedBy` is defined, every `read`/`write` collection is a known name).
- Derived-map parity: derived `FEATURE_WRITE`/`FEATURE_READ` equal the
  current literal maps at the time of cut-over.
- Page-gate audit test: greps module pages for role literals and fails on any
  not in the allowlist.
- E2E (Playwright, demo accounts): staff with `tasks` manage @ department can
  approve a review task in their department and not in another; staff with
  `payroll` view sees all rows and cannot generate; admin deep links keep
  working.

## 8. Rollout

| Phase | Scope | Done when |
| --- | --- | --- |
| P0 (shipped 2026-09-05) | payments gate key, task delete gate, `leaveRequests` name, payroll grant lifts own-scope | tests green, verified against the running app |
| P1 | registry block, `can()`, grant normalisation, derived server maps, `useCan()` | golden suite unchanged, new unit tests green, no UI change |
| P2 | replace page gates and workflow guards, route map, portal coverage for all modules, link audit | module table cells all pass, e2e green |
| P3 | card panel UI with level and scope, audit log on change | admin can set level and scope; staff sees exactly the table row |

Deferred, deliberately: per-action overrides, assignment target lists
("can assign to Production"), per-role view-only presets.

## 9. Open questions

1. Should `accounts` gain `view` on tasks and work logs for payroll inputs, or
   is the `payroll` module's own read list enough? Proposal: the latter.
2. `leaves-manage` at company scope duplicates the admin step. Keep it
   admin-only for one more release and revisit with real demand.
