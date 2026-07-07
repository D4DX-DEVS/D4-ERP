# Staff Contracts, Job Description & Wizard Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add job description + contract duration/expiry tracking (with an extension history log) to Staff Management, surface the existing feature-permission picker as a 3rd Add Staff wizard step, and trim the wizard's required fields to the login-critical ones.

**Architecture:** New pure-function module `src/lib/contract-utils.ts` (no DB access, same shape as `src/lib/asset-availability.ts`) computes contract end dates and expiry status; both the staff list table and staff detail page consume it. A new `contractHistory` Firestore-compat sub-collection (same pattern as `salaryHistory`/`statusHistory`) logs every extension. The wizard's existing 2-step form gains a 3rd step that reuses the feature-checkbox UI already built for the detail page's Access & Features tab.

**Tech Stack:** Next.js (App Router), TypeScript, MongoDB via the Firestore-compat client (`src/lib/firestore.ts`), Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-staff-contracts-permissions-design.md`

## Global Constraints

- Data layer is MongoDB behind a Firestore-compatible API (`src/lib/firestore.ts`) — use `Timestamp.fromDate`/`Timestamp.now`, `createDocument`/`updateDocument`/`getDocument`/`getSubDocuments`/`createSubDocument`. Never touch Mongo directly from page components.
- No new npm dependencies. No new UI primitives — reuse `Input`, `Textarea`, `Select`, `DatePicker`, `Dialog`/`DialogHeader`/`DialogTitle`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Badge`, `Button`, `Label` exactly as already used in `staff/page.tsx` and `staff/[id]/page.tsx`.
- `CONTRACT_WARNING_DAYS = 30` (table/detail-page "expiring soon" threshold).
- Required fields in the Add/Edit Staff wizard, after this plan: Employee Code, Role, First Name, Last Name, Mobile only. Employee Code becomes editable (no longer `disabled`).
- Contract end date auto-recompute in the wizard fires **only when `contractType` changes**, never on a `dateOfJoining` edit alone (prevents silently shifting an already-set end date when HR edits an existing staff member's join date). It fires for every type including `permanent` (clears to `null`) and `custom` (clears to `null` for manual entry).
- Extending a contract (detail page) always computes the new end date from **today**, not from the old end date — "extend by 1 year" means 1 year from the extension date.
- This repo has no component/page test files anywhere (only pure-logic files under `src/lib/*.test.ts` are tested, e.g. `asset-availability.test.ts`). Follow that precedent: `src/lib/contract-utils.ts` gets full TDD with vitest; page-component tasks are verified via `npm run build` (typecheck) plus a manual click-through, not a new testing-library setup.
- Run `npm run build` after every task that touches a `.tsx`/`.ts` file — it's this repo's only compile-correctness gate.

---

### Task 1: Data model — contract & job description fields

**Files:**
- Modify: `src/types/index.ts:41-95`

**Interfaces:**
- Produces: `ContractType` union, `Staff.jobDescription?`, `Staff.contractType?`, `Staff.contractEndDate?`, `ContractHistory` interface — consumed by every later task.

- [ ] **Step 1: Add `ContractType` and extend `Staff`**

In `src/types/index.ts`, right after the existing `Gender` type (line 43) add:

```ts
export type ContractType =
  | "3-months"
  | "6-months"
  | "12-months"
  | "24-months"
  | "36-months"
  | "permanent"
  | "custom";
```

Then inside the `Staff` interface (currently lines 45-78), add these three fields right after `shiftId?: string;` (line 69) and before the `grantedFeatures` comment/field:

```ts
  jobDescription?: string;
  contractType?: ContractType;
  contractEndDate?: Timestamp | null;
```

- [ ] **Step 2: Add `ContractHistory`**

Right after the existing `StatusHistory` interface (ends at line 95), add:

```ts
export interface ContractHistory extends BaseDocument {
  previousEndDate: Timestamp | null;
  newEndDate: Timestamp | null;
  contractType: ContractType;
  reason: string;
  extendedOn: Timestamp;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: succeeds (these are additive, optional fields — nothing else references them yet).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add contract and job description fields to Staff type"
```

---

### Task 2: `src/lib/contract-utils.ts` — pure contract helpers (TDD)

**Files:**
- Create: `src/lib/contract-utils.ts`
- Test: `src/lib/contract-utils.test.ts`

**Interfaces:**
- Consumes: `ContractType` from `@/types` (Task 1).
- Produces: `CONTRACT_DURATIONS`, `CONTRACT_WARNING_DAYS`, `addMonths(date, months)`, `computeContractEndDate(start, type, customEnd?)`, `getDaysRemaining(end, today?)`, `getContractStatus(end, today?): ContractStatus`, `type ContractStatus`. All later tasks import from here — do not reimplement this math anywhere else.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/contract-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addMonths,
  computeContractEndDate,
  getDaysRemaining,
  getContractStatus,
  CONTRACT_DURATIONS,
} from "@/lib/contract-utils";

describe("addMonths", () => {
  it("adds months across a year boundary", () => {
    expect(addMonths(new Date(2026, 10, 15), 3)).toEqual(new Date(2027, 1, 15));
  });
});

describe("computeContractEndDate", () => {
  const start = new Date(2026, 0, 1); // Jan 1 2026

  it("permanent has no end date", () => {
    expect(computeContractEndDate(start, "permanent")).toBeNull();
  });

  it("custom uses the given date", () => {
    const custom = new Date(2027, 5, 1);
    expect(computeContractEndDate(start, "custom", custom)).toEqual(custom);
  });

  it("custom with no date given is null", () => {
    expect(computeContractEndDate(start, "custom")).toBeNull();
  });

  it("12-months preset adds a year", () => {
    expect(computeContractEndDate(start, "12-months")).toEqual(new Date(2027, 0, 1));
  });

  it("3-months preset adds 3 months", () => {
    expect(computeContractEndDate(start, "3-months")).toEqual(new Date(2026, 3, 1));
  });
});

describe("getDaysRemaining", () => {
  const today = new Date(2026, 6, 7); // Jul 7 2026

  it("null when no end date", () => {
    expect(getDaysRemaining(null, today)).toBeNull();
  });

  it("positive when end date is in the future", () => {
    expect(getDaysRemaining(new Date(2026, 6, 17), today)).toBe(10);
  });

  it("negative when end date is in the past", () => {
    expect(getDaysRemaining(new Date(2026, 6, 1), today)).toBe(-6);
  });

  it("zero on the end date itself", () => {
    expect(getDaysRemaining(new Date(2026, 6, 7), today)).toBe(0);
  });
});

describe("getContractStatus", () => {
  const today = new Date(2026, 6, 7); // Jul 7 2026

  it("none when no end date", () => {
    expect(getContractStatus(null, today)).toBe("none");
  });

  it("active when more than 30 days remain", () => {
    expect(getContractStatus(new Date(2026, 8, 1), today)).toBe("active");
  });

  it("expiring-soon at exactly 30 days remaining", () => {
    expect(getContractStatus(new Date(2026, 7, 6), today)).toBe("expiring-soon");
  });

  it("active at 31 days remaining (boundary)", () => {
    expect(getContractStatus(new Date(2026, 7, 7), today)).toBe("active");
  });

  it("expired when end date has passed", () => {
    expect(getContractStatus(new Date(2026, 6, 1), today)).toBe("expired");
  });
});

describe("CONTRACT_DURATIONS", () => {
  it("includes all 7 preset values in UI order", () => {
    const values = CONTRACT_DURATIONS.map((d) => d.value);
    expect(values).toEqual([
      "3-months", "6-months", "12-months", "24-months", "36-months", "permanent", "custom",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contract-utils.test.ts`
Expected: FAIL — `Cannot find module '@/lib/contract-utils'`.

- [ ] **Step 3: Implement `src/lib/contract-utils.ts`**

```ts
// ==================== Contract duration & expiry (pure helpers) ====================
// No DB access. Given a staff record's contract type and end date, compute
// the preset end date, days remaining, and warning status. Same shape as
// src/lib/asset-availability.ts.

import type { ContractType } from "@/types";

export const CONTRACT_WARNING_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export interface ContractDuration {
  value: ContractType;
  label: string;
  months: number | null;
}

/** Listed in the order shown in the UI. */
export const CONTRACT_DURATIONS: ContractDuration[] = [
  { value: "3-months", label: "3 Months", months: 3 },
  { value: "6-months", label: "6 Months", months: 6 },
  { value: "12-months", label: "1 Year", months: 12 },
  { value: "24-months", label: "2 Years", months: 24 },
  { value: "36-months", label: "3 Years", months: 36 },
  { value: "permanent", label: "Permanent", months: null },
  { value: "custom", label: "Custom End Date", months: null },
];

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** null = no end date (permanent, or custom with no date chosen yet). */
export function computeContractEndDate(
  start: Date,
  type: ContractType,
  customEnd?: Date
): Date | null {
  if (type === "permanent") return null;
  if (type === "custom") return customEnd ?? null;
  const preset = CONTRACT_DURATIONS.find((d) => d.value === type);
  return preset?.months ? addMonths(start, preset.months) : null;
}

/** Whole days between today and `end`, ignoring time-of-day. Negative = past. */
export function getDaysRemaining(end: Date | null | undefined, today: Date = new Date()): number | null {
  if (!end) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((startOfEnd.getTime() - startOfToday.getTime()) / MS_PER_DAY);
}

export type ContractStatus = "none" | "active" | "expiring-soon" | "expired";

export function getContractStatus(end: Date | null | undefined, today: Date = new Date()): ContractStatus {
  const daysLeft = getDaysRemaining(end, today);
  if (daysLeft == null) return "none";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= CONTRACT_WARNING_DAYS) return "expiring-soon";
  return "active";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contract-utils.test.ts`
Expected: PASS, all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract-utils.ts src/lib/contract-utils.test.ts
git commit -m "feat: add contract-utils pure helpers for contract expiry math"
```

---

### Task 3: Wizard — trim required fields, make Employee Code editable

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/page.tsx:393-522`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure UI/validation change) — later tasks are unaffected by this one.

- [ ] **Step 1: Make Employee Code editable**

In `src/app/(dashboard)/dashboard/staff/page.tsx`, replace (around line 393-396):

```tsx
                <div className="space-y-2">
                  <Label>Employee Code</Label>
                  <Input value={form.employeeCode} disabled className="bg-gray-50 font-mono" />
                </div>
```

with:

```tsx
                <div className="space-y-2">
                  <Label>Employee Code *</Label>
                  <Input
                    value={form.employeeCode}
                    onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                    className="font-mono"
                    required
                  />
                </div>
```

- [ ] **Step 2: Drop `required` from Email; keep Mobile required**

Replace (around line 424-433):

```tsx
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Mobile *</Label>
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
                </div>
```

with:

```tsx
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mobile *</Label>
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
                </div>
```

- [ ] **Step 3: Drop `required` from Date of Birth, Gender, Date of Joining**

Replace (around line 435-457):

```tsx
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth *</Label>
                  <DatePicker value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Gender *</Label>
                  <Select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as Staff["gender"] })}
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "Other", label: "Other" },
                    ]}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Joining *</Label>
                  <DatePicker value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} required />
                </div>
              </div>
```

with:

```tsx
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <DatePicker value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as Staff["gender"] })}
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "Other", label: "Other" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Joining</Label>
                  <DatePicker value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
                </div>
              </div>
```

- [ ] **Step 4: Drop `required` from Company and Department**

Replace (around line 470-491):

```tsx
                <div className="space-y-2">
                  <Label>Company *</Label>
                  <Select
                    value={form.companyId}
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select company"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    placeholder="Select department"
                    required
                  />
                </div>
```

with:

```tsx
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select
                    value={form.companyId}
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select company"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    placeholder="Select department"
                  />
                </div>
```

- [ ] **Step 5: Drop `required` from Designation and Base Salary**

Replace (around line 493-502):

```tsx
                <div className="space-y-2">
                  <Label>Designation *</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Base Salary *</Label>
                  <Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value), currentSalary: Number(e.target.value) })} required />
                </div>
```

with:

```tsx
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Base Salary</Label>
                  <Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value), currentSalary: Number(e.target.value) })} />
                </div>
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual verify**

Run: `npm run dev`, open Staff → Add Staff. Confirm: Employee Code is a plain (non-greyed-out) editable input; you can submit Step 1 → Step 2 → "Add Staff" leaving Email/DOB/Gender/DOJ/Company/Department/Designation/Base Salary blank, and only get blocked if Employee Code, Role, First Name, Last Name, or Mobile are empty.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/page.tsx"
git commit -m "feat: trim required staff fields, make employee code editable"
```

---

### Task 4: Wizard Step 2 — Job Description + Contract fields

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/page.tsx`

**Interfaces:**
- Consumes: `ContractType` (Task 1), `CONTRACT_DURATIONS`, `computeContractEndDate` (Task 2).
- Produces: `form.jobDescription`, `form.contractType`, `form.contractEndDate` on the wizard's form state — Task 6/7/8 read the persisted `staff.jobDescription`/`staff.contractType`/`staff.contractEndDate` this task writes.

- [ ] **Step 1: Add imports**

At the top of `src/app/(dashboard)/dashboard/staff/page.tsx`, add:

```tsx
import { Textarea } from "@/components/ui/textarea";
```

and change:

```tsx
import { Staff, Company, Department, Shift } from "@/types";
```

to:

```tsx
import { Staff, Company, Department, Shift, ContractType } from "@/types";
```

and change:

```tsx
import { getStatusColor, formatCurrency, generateEmployeeCode } from "@/lib/utils";
```

to add a new import line right after it:

```tsx
import { getStatusColor, formatCurrency, generateEmployeeCode } from "@/lib/utils";
import { CONTRACT_DURATIONS, computeContractEndDate, getContractStatus, getDaysRemaining } from "@/lib/contract-utils";
```

(`getContractStatus`/`getDaysRemaining` are unused until Task 6 — that's fine, Task 6 lands in the same file shortly after; if you're running a strict no-unused-vars lint between tasks, only add `CONTRACT_DURATIONS`/`computeContractEndDate` now and add the other two import names in Task 6 instead.)

- [ ] **Step 2: Extend form state**

Replace the form state block (around line 70-89):

```tsx
  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    address: { street: "", city: "", state: "", pincode: "" },
    dateOfBirth: "",
    gender: "Male" as "Male" | "Female" | "Other",
    dateOfJoining: "",
    departmentId: "",
    companyId: "",
    designation: "",
    baseSalary: 0,
    currentSalary: 0,
    role: "staff" as "admin" | "department-head" | "accounts" | "staff",
    status: "active" as "active" | "suspended" | "terminated" | "on-leave",
    shiftId: "",
    isActive: true,
  });
```

with:

```tsx
  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    address: { street: "", city: "", state: "", pincode: "" },
    dateOfBirth: "",
    gender: "Male" as "Male" | "Female" | "Other",
    dateOfJoining: "",
    departmentId: "",
    companyId: "",
    designation: "",
    baseSalary: 0,
    currentSalary: 0,
    role: "staff" as "admin" | "department-head" | "accounts" | "staff",
    status: "active" as "active" | "suspended" | "terminated" | "on-leave",
    shiftId: "",
    isActive: true,
    jobDescription: "",
    contractType: "permanent" as ContractType,
    contractEndDate: "",
    grantedFeatures: [] as string[],
  });
```

(`grantedFeatures` is added here too since it lives on the same form object — Task 5 wires its UI.)

- [ ] **Step 3: Add the contract-type change handler**

Right after the `form` state declaration, add:

```tsx
  const setContractType = (type: ContractType) => {
    const start = form.dateOfJoining ? new Date(form.dateOfJoining) : new Date();
    const computed = computeContractEndDate(start, type);
    setForm((f) => ({
      ...f,
      contractType: type,
      contractEndDate: computed ? computed.toISOString().split("T")[0] : "",
    }));
  };
```

- [ ] **Step 4: Populate on edit/create in `handleOpen`**

In `handleOpen`, the edit branch currently ends with `shiftId: staff.shiftId || "", isActive: staff.isActive,` (around line 142-144). Replace:

```tsx
        shiftId: staff.shiftId || "",
        isActive: staff.isActive,
      });
    } else {
```

with:

```tsx
        shiftId: staff.shiftId || "",
        isActive: staff.isActive,
        jobDescription: staff.jobDescription || "",
        contractType: staff.contractType || "permanent",
        contractEndDate: staff.contractEndDate ? new Date(staff.contractEndDate.seconds * 1000).toISOString().split("T")[0] : "",
        grantedFeatures: staff.grantedFeatures || [],
      });
    } else {
```

And the create branch currently ends with `shiftId: "", isActive: true,` (around line 165-166). Replace:

```tsx
        shiftId: "",
        isActive: true,
      });
    }
```

with:

```tsx
        shiftId: "",
        isActive: true,
        jobDescription: "",
        contractType: "permanent",
        contractEndDate: "",
        grantedFeatures: [],
      });
    }
```

- [ ] **Step 5: Persist in `handleSave`**

Replace (around line 176-181):

```tsx
      const data = {
        ...form,
        dateOfBirth: Timestamp.fromDate(new Date(form.dateOfBirth)),
        dateOfJoining: Timestamp.fromDate(new Date(form.dateOfJoining)),
        currentSalary: form.currentSalary || form.baseSalary,
      };
```

with:

```tsx
      const data = {
        ...form,
        dateOfBirth: form.dateOfBirth ? Timestamp.fromDate(new Date(form.dateOfBirth)) : null,
        dateOfJoining: form.dateOfJoining ? Timestamp.fromDate(new Date(form.dateOfJoining)) : null,
        currentSalary: form.currentSalary || form.baseSalary,
        contractEndDate: form.contractEndDate ? Timestamp.fromDate(new Date(form.contractEndDate)) : null,
      };
```

(`dateOfBirth`/`dateOfJoining` become conditional too since Task 3 made them optional — an empty string passed to `new Date("")` produces an Invalid Date, which is why these need the same null-guard as `contractEndDate`.)

- [ ] **Step 6: Add the Job Description + Contract UI to Step 2**

Insert directly after the Designation/Base Salary grid and before the `<div className="border-t pt-4">` Address section (around line 502-505):

```tsx
              <div className="space-y-2">
                <Label>Job Description</Label>
                <Textarea
                  value={form.jobDescription}
                  onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                  placeholder="Key responsibilities for this role..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Duration</Label>
                  <Select
                    value={form.contractType}
                    onChange={(e) => setContractType(e.target.value as ContractType)}
                    options={CONTRACT_DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>
                {form.contractType !== "permanent" && (
                  <div className="space-y-2">
                    <Label>Contract End Date</Label>
                    <DatePicker
                      value={form.contractEndDate}
                      onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                      min={form.dateOfJoining || undefined}
                    />
                  </div>
                )}
              </div>
```

- [ ] **Step 7: Typecheck**

Run: `npm run build`
Expected: succeeds. (If Step 1's lint note applies, `getContractStatus`/`getDaysRemaining` unused-import errors are resolved by Task 6, not this one.)

- [ ] **Step 8: Manual verify**

`npm run dev` → Add Staff → Step 2: pick "1 Year" from Contract Duration, confirm the End Date field appears and auto-fills to one year after Date of Joining (or today, if DOJ is blank) and stays editable; pick "Permanent" and confirm the End Date field disappears; save a staff member with a job description and confirm no crash.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/page.tsx"
git commit -m "feat: add job description and contract duration fields to staff wizard"
```

---

### Task 5: Wizard Step 3 — Permissions tab

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/page.tsx`

**Interfaces:**
- Consumes: `FEATURES`, `roleHasFeature` from `src/lib/permissions.ts`; `form.grantedFeatures` (Task 4).
- Produces: persisted `staff.grantedFeatures` on create (previously only settable after creation, from the detail page).

- [ ] **Step 1: Add imports**

Add:

```tsx
import { FEATURES, roleHasFeature } from "@/lib/permissions";
```

and add `Shield` to the existing lucide-react import line:

```tsx
import { Users, Plus, Pencil, Trash2, Loader2, Eye, Search, Shield } from "lucide-react";
```

- [ ] **Step 2: Add the toggle helper**

Right after the `setContractType` function added in Task 4, add:

```tsx
  const toggleGrantedFeature = (key: string) => {
    setForm((f) => ({
      ...f,
      grantedFeatures: f.grantedFeatures.includes(key)
        ? f.grantedFeatures.filter((k) => k !== key)
        : [...f.grantedFeatures, key],
    }));
  };
```

- [ ] **Step 3: Persist in `handleSave`**

`grantedFeatures` is already spread onto `data` via `...form` (Task 4's `handleSave` edit) — no further change needed here.

- [ ] **Step 4: Add the 3rd step tab button**

Replace the step-tabs block (around line 371-386):

```tsx
        <div className="flex border-b mb-4">
          <button
            type="button"
            onClick={() => setFormStep(1)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 1 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            1. Personal Info
          </button>
          <button
            type="button"
            onClick={() => setFormStep(2)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 2 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            2. Work & Address
          </button>
        </div>
```

with:

```tsx
        <div className="flex border-b mb-4">
          <button
            type="button"
            onClick={() => setFormStep(1)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 1 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            1. Personal Info
          </button>
          <button
            type="button"
            onClick={() => setFormStep(2)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 2 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            2. Work & Address
          </button>
          <button
            type="button"
            onClick={() => setFormStep(3)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 3 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            3. Permissions
          </button>
        </div>
```

- [ ] **Step 5: Split Step 2's footer and add Step 3**

Replace the Step 2 footer + closing tags (around line 527-542):

```tsx
              <div className="flex justify-between pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setFormStep(1)}>
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {editingId ? "Update" : "Add"} Staff
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </Dialog>
```

with:

```tsx
              <div className="flex justify-between pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setFormStep(1)}>
                  Back
                </Button>
                <Button type="button" onClick={() => setFormStep(3)}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Permissions */}
          {formStep === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Features granted by the <span className="font-semibold">{form.role}</span> role are enabled automatically. Grant extra features below.
              </p>
              {form.role === "admin" ? (
                <div className="text-center py-8">
                  <Shield className="h-8 w-8 text-teal-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Admins have access to all features</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto">
                  {FEATURES.map((f) => {
                    const auto = roleHasFeature(form.role, f.key);
                    const granted = form.grantedFeatures.includes(f.key);
                    return (
                      <label
                        key={f.key}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          auto ? "bg-teal-50/50 border-teal-200" : granted ? "border-teal-500 bg-teal-50/30" : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={auto || granted}
                          disabled={auto}
                          onChange={() => toggleGrantedFeature(f.key)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <div>
                          <p className="text-sm font-medium">
                            {f.label}
                            {auto && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded">
                                Role default
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{f.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setFormStep(2)}>
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {editingId ? "Update" : "Add"} Staff
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </Dialog>
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual verify**

`npm run dev` → Add Staff → step through to "3. Permissions". Confirm role-default features show checked + disabled with a "Role default" tag, extra features are toggleable, switching Role in Step 1 and returning to Step 3 updates which features show as defaults, and submitting creates a staff doc whose `grantedFeatures` match what was checked (verify on the new staff's detail page → Access & Features tab).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/page.tsx"
git commit -m "feat: add permissions step to add staff wizard"
```

---

### Task 6: Staff table — contract expiry warning badge

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/page.tsx`

**Interfaces:**
- Consumes: `getContractStatus`, `getDaysRemaining` (Task 2), `staff.contractEndDate` (Task 1/4).

- [ ] **Step 1: Ensure the imports from Task 4 Step 1 are present**

Confirm this line exists (added in Task 4, Step 1):

```tsx
import { CONTRACT_DURATIONS, computeContractEndDate, getContractStatus, getDaysRemaining } from "@/lib/contract-utils";
```

If Task 4 was done with the deferred-import note, add `getContractStatus, getDaysRemaining` to that import now.

- [ ] **Step 2: Compute per-row contract status**

Replace (around line 301-304):

```tsx
                {staffList.map((staff) => {
                  const detailHref = `/dashboard/staff/${staff.id}`;

                  return (
```

with:

```tsx
                {staffList.map((staff) => {
                  const detailHref = `/dashboard/staff/${staff.id}`;
                  const contractEnd = staff.contractEndDate ? new Date(staff.contractEndDate.seconds * 1000) : null;
                  const contractStatus = getContractStatus(contractEnd);
                  const contractDays = getDaysRemaining(contractEnd);

                  return (
```

- [ ] **Step 3: Render the badge under Status**

Replace (around line 328-332):

```tsx
                    <TableCell>
                      <Badge variant={getStatusColor(staff.status)}>
                        {staff.status}
                      </Badge>
                    </TableCell>
```

with:

```tsx
                    <TableCell>
                      <Badge variant={getStatusColor(staff.status)}>
                        {staff.status}
                      </Badge>
                      {contractStatus === "expiring-soon" && (
                        <p className="text-[11px] text-amber-600 font-medium mt-1">Contract: {contractDays}d left</p>
                      )}
                      {contractStatus === "expired" && (
                        <p className="text-[11px] text-red-600 font-medium mt-1">Contract expired</p>
                      )}
                    </TableCell>
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verify**

Edit a staff member (via Task 4's fields) to set Contract Duration to a preset whose end date lands within 30 days (e.g. pick "Custom End Date" and pick a date 10 days out). Confirm the Staff Management table shows the amber "Contract: 10d left" line under that row's Status badge; set a past date and confirm the red "Contract expired" line.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/page.tsx"
git commit -m "feat: show contract expiry warning badge in staff table"
```

---

### Task 7: Detail page Overview — Contract card + Job Description

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/[id]/page.tsx`

**Interfaces:**
- Consumes: `getContractStatus`, `getDaysRemaining`, `CONTRACT_DURATIONS`, `type ContractStatus` (Task 2); `staff.jobDescription`, `staff.contractType`, `staff.contractEndDate` (Task 1/4).
- Produces: `contractEndDate`, `contractStatus`, `contractDaysRemaining`, `contractTypeLabel` local consts — consumed by Task 8's Extend dialog preview.

- [ ] **Step 1: Add import**

Add:

```tsx
import { getContractStatus, getDaysRemaining, CONTRACT_DURATIONS, type ContractStatus } from "@/lib/contract-utils";
```

- [ ] **Step 2: Compute contract display values**

Right after `const canEditFeatures = currentUser?.role === "admin";` (around line 200), add:

```tsx
  const contractEndDate = staff.contractEndDate ? new Date(staff.contractEndDate.seconds * 1000) : null;
  const contractStatus = getContractStatus(contractEndDate);
  const contractDaysRemaining = getDaysRemaining(contractEndDate);
  const contractTypeLabel = CONTRACT_DURATIONS.find((d) => d.value === staff.contractType)?.label || "Permanent";
  const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
    none: "bg-gray-50 text-gray-700",
    active: "bg-green-50 text-green-700",
    "expiring-soon": "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
  };
```

- [ ] **Step 3: Insert the Contract card**

Insert directly after the "Current Salary" `</Card>` and before the Role/Company/Department `<Card>` (around line 344-345):

```tsx
            <Card>
              <CardContent className={`pt-6 rounded-b-lg ${CONTRACT_STATUS_COLORS[contractStatus]}`}>
                <p className="text-xs uppercase tracking-wider opacity-70 mb-1">Contract</p>
                <p className="text-lg font-bold">{contractTypeLabel}</p>
                {contractEndDate ? (
                  <>
                    <p className="text-sm mt-1">Ends {formatDate(contractEndDate)}</p>
                    <p className="text-xs mt-0.5 font-medium">
                      {contractStatus === "expired"
                        ? `Expired ${Math.abs(contractDaysRemaining ?? 0)}d ago`
                        : `${contractDaysRemaining}d remaining`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm mt-1">No end date</p>
                )}
              </CardContent>
            </Card>
```

- [ ] **Step 4: Insert the Job Description block**

Inside the Personal Information `<Card>`, insert right after the `InfoItem` grid's closing `</div>` and before `</CardContent>` (around line 331-332):

```tsx
              {staff.jobDescription && (
                <div className="mt-5 pt-5 border-t">
                  <p className="text-xs text-gray-500 mb-1">Job Description</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{staff.jobDescription}</p>
                </div>
              )}
```

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verify**

Open a staff member with a contract end date set. Confirm the Overview tab's sidebar shows a color-coded Contract card with type, end date, and days remaining, and the Personal Information card shows the job description text when set (and hides the block when empty).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/[id]/page.tsx"
git commit -m "feat: show contract status and job description on staff overview"
```

---

### Task 8: Detail page — Extend Contract dialog + contractHistory

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/[id]/page.tsx`

**Interfaces:**
- Consumes: `ContractHistory` (Task 1), `computeContractEndDate` (Task 2), `contractTypeLabel`/`contractEndDate` (Task 7).
- Produces: `contractHistory` state — consumed by Task 9's history card.

- [ ] **Step 1: Add imports**

Change:

```tsx
import { Staff, Department, Company, SalaryHistory, StatusHistory } from "@/types";
```

to:

```tsx
import { Staff, Department, Company, SalaryHistory, StatusHistory, ContractHistory, ContractType } from "@/types";
```

Change:

```tsx
import { getContractStatus, getDaysRemaining, CONTRACT_DURATIONS, type ContractStatus } from "@/lib/contract-utils";
```

to:

```tsx
import { getContractStatus, getDaysRemaining, computeContractEndDate, CONTRACT_DURATIONS, type ContractStatus } from "@/lib/contract-utils";
```

Add `CalendarClock` to the lucide-react import list (around line 22-38):

```tsx
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Building2,
  Briefcase,
  CreditCard,
  Shield,
  FileText,
  History,
  User,
  CalendarClock,
} from "lucide-react";
```

- [ ] **Step 2: Add state**

Right after the `statusForm` state (around line 73-78), add:

```tsx
  const [contractHistory, setContractHistory] = useState<(ContractHistory & { id: string })[]>([]);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    contractType: "permanent" as ContractType,
    customEndDate: "",
    reason: "",
  });
```

- [ ] **Step 3: Fetch contract history**

Replace (around line 92-102):

```tsx
      const [dept, comp, salHist, statHist] = await Promise.all([
        staffData.departmentId ? getDocument<Department>("departments", staffData.departmentId) : null,
        staffData.companyId ? getDocument<Company>("companies", staffData.companyId) : null,
        getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<StatusHistory>("staff", staffId, "statusHistory", [orderBy("createdAt", "desc")]),
      ]);

      setDepartment(dept);
      setCompany(comp);
      setSalaryHistory(salHist);
      setStatusHistory(statHist);
```

with:

```tsx
      const [dept, comp, salHist, statHist, conHist] = await Promise.all([
        staffData.departmentId ? getDocument<Department>("departments", staffData.departmentId) : null,
        staffData.companyId ? getDocument<Company>("companies", staffData.companyId) : null,
        getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<StatusHistory>("staff", staffId, "statusHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<ContractHistory>("staff", staffId, "contractHistory", [orderBy("createdAt", "desc")]),
      ]);

      setDepartment(dept);
      setCompany(comp);
      setSalaryHistory(salHist);
      setStatusHistory(statHist);
      setContractHistory(conHist);
```

- [ ] **Step 4: Add `handleExtendContract`**

Right after `handleStatusChange` (ends around line 175), add:

```tsx
  const handleExtendContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setSaving(true);
    try {
      const customEnd = contractForm.customEndDate ? new Date(contractForm.customEndDate) : undefined;
      const newEnd = computeContractEndDate(new Date(), contractForm.contractType, customEnd);

      await createSubDocument("staff", staffId, "contractHistory", {
        previousEndDate: staff.contractEndDate || null,
        newEndDate: newEnd ? Timestamp.fromDate(newEnd) : null,
        contractType: contractForm.contractType,
        reason: contractForm.reason,
        extendedOn: Timestamp.now(),
      });

      await updateDocument("staff", staffId, {
        contractType: contractForm.contractType,
        contractEndDate: newEnd ? Timestamp.fromDate(newEnd) : null,
      });

      setContractDialogOpen(false);
      toast("success", "Contract updated");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update contract");
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 5: Add the header "Contract" button**

Insert right after the Status button and before the `{canEditFeatures && (` block (around line 267-271):

```tsx
          <Button variant="outline" size="sm" onClick={() => {
            setContractForm({ contractType: staff.contractType || "permanent", customEndDate: "", reason: "" });
            setContractDialogOpen(true);
          }}>
            <CalendarClock className="h-4 w-4 mr-1.5" />
            Contract
          </Button>
```

- [ ] **Step 6: Add the Extend Contract dialog**

Insert after the Status Change Dialog's closing `</Dialog>` and before the component's closing `</div>` / `);` (around line 634-635):

```tsx
      {/* ───── Extend Contract Dialog ───── */}
      <Dialog open={contractDialogOpen} onClose={() => setContractDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>Extend Contract</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleExtendContract} className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-gray-500">Current</p>
            <p className="font-medium">
              {contractTypeLabel}
              {contractEndDate ? ` — ends ${formatDate(contractEndDate)}` : ""}
            </p>
          </div>
          <div className="space-y-2">
            <Label>New Contract Duration *</Label>
            <Select
              value={contractForm.contractType}
              onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value as ContractType })}
              options={CONTRACT_DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
          </div>
          {contractForm.contractType === "custom" && (
            <div className="space-y-2">
              <Label>New End Date *</Label>
              <DatePicker
                value={contractForm.customEndDate}
                onChange={(e) => setContractForm({ ...contractForm, customEndDate: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={contractForm.reason}
              onChange={(e) => setContractForm({ ...contractForm, reason: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setContractDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Contract
            </Button>
          </div>
        </form>
      </Dialog>
```

- [ ] **Step 7: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Manual verify**

Open a staff member, click "Contract" in the header, confirm the "Current" preview line shows the existing type/end date, pick "1 Year" and submit — confirm the Overview tab's Contract card now shows an end date ~1 year from today, and `staff/{id}/contractHistory` (checkable by refreshing and re-opening the dialog, or via Task 9's card) recorded the change.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/[id]/page.tsx"
git commit -m "feat: add extend contract dialog and contract history logging"
```

---

### Task 9: Detail page — Contract History card

**Files:**
- Modify: `src/app/(dashboard)/dashboard/staff/[id]/page.tsx`

**Interfaces:**
- Consumes: `contractHistory` state, `contractForm`/`setContractDialogOpen` (Task 8), `CONTRACT_DURATIONS` (Task 2).

- [ ] **Step 1: Add the Contract History card**

Insert right after the Status History `</Card>` and before the closing `</div>` of the "salary" tab (around line 451-452):

```tsx
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contract History</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                setContractForm({ contractType: staff.contractType || "permanent", customEndDate: "", reason: "" });
                setContractDialogOpen(true);
              }}>
                <CalendarClock className="h-4 w-4 mr-1.5" />
                Extend
              </Button>
            </CardHeader>
            <CardContent>
              {contractHistory.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarClock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No contract changes recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contractHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          {CONTRACT_DURATIONS.find((d) => d.value === h.contractType)?.label || h.contractType}
                        </p>
                        <p className="text-xs text-gray-500">{h.reason}</p>
                        <p className="text-xs text-gray-400">
                          {h.extendedOn ? formatDate(new Date(h.extendedOn.seconds * 1000)) : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>{h.previousEndDate ? formatDate(new Date(h.previousEndDate.seconds * 1000)) : "—"}</p>
                        <p>→ {h.newEndDate ? formatDate(new Date(h.newEndDate.seconds * 1000)) : "Permanent"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verify**

Open the "Salary & Status" tab for a staff member who's had a contract extended (Task 8's manual step). Confirm the new "Contract History" card lists the extension with previous → new end date, reason, and date, and that its own "Extend" button opens the same dialog as the header button.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/staff/[id]/page.tsx"
git commit -m "feat: add contract history card to staff detail page"
```

---

## Final Verification

- [ ] Run `npm run build` clean from repo root.
- [ ] Run `npx vitest run` — all existing tests plus `contract-utils.test.ts` pass.
- [ ] Full manual walkthrough: create a staff member through all 3 wizard steps (contract + permissions + minimal required fields only), confirm it appears correctly in the table (with/without a near-expiry contract), open its detail page and confirm Overview/Salary & Status tabs render, extend its contract, confirm the history logs it.
