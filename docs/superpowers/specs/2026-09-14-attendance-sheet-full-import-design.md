# Full attendance-sheet import — January to August 2026

## Why

The team keeps attendance in "00. D4 ATTENDANCE SHEET 2026": eight monthly grids of
day codes, plus a CL/EL/ML tab carrying each person's entitlement, usage and
balance. The ERP is meant to replace that sheet, but today it holds almost none of
the year — January through June are missing outright, and the balance numbers staff
read in the app come from nowhere.

Two problems make a straight copy of the sheet the wrong answer:

1. **The balance tab is a month behind.** Its JAN..JUL month cells are filled;
   AUG..DEC are empty. The August grid, meanwhile, is complete — 16 CL, 11 ML and
   19 FL days across the matched staff. Copying the balance tab imports August as
   zero leave taken.

2. **The balance tab disagrees with its own grids for Jan–Jul.** Roughly half the
   rows reconcile exactly; the rest do not, and always in the same direction — the
   grid shows more leave than the USED column admits.

   | Staff | Bucket | Balance tab USED | Grid Jan–Jul |
   |---|---|---|---|
   | Muhammad Rashid A P | CL | 3 | 8 |
   | Ahmed Jasim | CL | 3 | 7 |
   | Muhammed Shamil M P | CL | 1 | 8 |
   | Faheem P T | CL | 11 | 16 |
   | Shahid Ameen | CL / ML / FL | 0 / 0 / 0 | 2 / 2 / 2 |
   | Irfan Kavanur | CL / ML / FL | 0 / 0 / 0 | 4 / 5 / 1 |

   The USED column is hand-maintained. The grids are the raw record, marked day by
   day as the month runs.

There is also a collision waiting in the code as it stands. `reconcileAttendanceLeave`
(the Reconcile button on Leave Balances) posts one ledger debit per leave day found on
the attendance register. The import's balance phase posts its own month-total
deductions. Run the import and then press Reconcile and every leave day is deducted
twice.

## Decisions

**The daily grid is the source of truth for leave taken.** The balance tab supplies
entitlement only. This resolves the double-count, imports August without special
handling, and keeps the ERP correct for September onward without anybody editing the
sheet again.

The cost is honest and worth naming: for the staff above, the ERP will show more leave
used than the printed sheet does. That is the grids talking. The run prints a variance
report so the team can see every row where the two disagree and by how much.

**Flexible leave is credited from the balance tab, not derived.** FL is earned by
working a holiday or week-off (`HW` on the grid), and the ERP models that as a pending
week-off duty an admin converts. But `HW` stops appearing on the sheet after May —
from June the team marks those days `OD` or `OT` instead — so deriving FL from the grid
would credit 101 days for Jan–May and nothing for Jun–Aug. The sheet's own
`USED FL + BALANCE FL` is the only complete statement of what each person earned.

**Former staff are imported, not skipped.** Eleven people appear on the sheet with no
ERP record. Their days are real history and belong in the register.

## Scope

January 1 – August 31 2026. All eight monthly tabs, the CL/EL/ML tab, all 34 people.

## Design

### 1. Former staff become relieved records

Eleven sheet people have no ERP staff record:

| Name | Sheet code | Months | Days | Band |
|---|---|---|---|---|
| Shameer Babu | D4A-100 | Jan–Aug | 218 | Contract |
| Adil Fayas | D4E-102 | Jan–Aug | 228 | Contract |
| Aslam Ali S | D4D-100 | Jan–Aug | 189 | Contract |
| Badeeu Zaman | D4P-102 | Jan–Aug | 238 | Contract |
| Bilal M Shareef | D4A-101 | Jan–Aug | 144 | Contract |
| Jumail P P | D4O-101 | Jan–Aug | 236 | Contract |
| Shafeeh K | D4O-103 | Jan–Aug | 205 | Permanent |
| Muhammad Hisham | D4P-104 | Jan–May | 148 | Contract |
| Muhammed Thabsheer | D4P-106 | Feb–Apr | 61 | Contract |
| Ahammad Arshad | INT-100 | Jan–Apr | 103 | Interns |
| Al Ameen | INT-104 | Jan–Mar | 67 | Interns |

Each becomes a `staff` document with `status: "relieved"`, `isActive: false`,
`isDeleted: true` and `deletedAt` set to the last day their sheet row carries a mark.
Soft-deleted is what keeps them out of every roster, dropdown and payroll listing while
leaving their attendance and leave history readable — the convention already used
across the app.

Fields: `designation` and `section` from the balance tab where the person has a row;
`employmentType` from the sheet band (PERMANENT → permanent, CONTRACT → staff,
INTERNS → intern); `dateOfJoining` = the first day of the first month they appear,
which is an approximation and is reported as one; `role: "staff"`; no email, no mobile,
salary 0. They cannot sign in.

**Employee codes.** Two codes were handed on to somebody still working here. The live
holder keeps the code; the former holder takes a suffixed one:

- `D4A-101` stays Shahid Ameen's. Bilal M Shareef is created as `D4A-101-EX`.
- `D4P-104` stays Raheef M's. Muhammad Hisham is created as `D4P-104-EX`.

The other nine keep their sheet code unchanged.

### 2. Attendance

Every person, every day January 1 to August 31. Code mapping is unchanged from the
existing importer: `P` present, `WO` week-off, `OD` on-duty, `H` public holiday (the
sheet's `H` is a holiday, not the ERP's half-day), `HW` present with a
"Holiday / week-off worked" remark, `CL`/`ML`/`EL`/`FL` the four leave statuses, `OT`
overtime, `L` absent with a "Long leave" remark, `O` skipped.

Rows carry `source: "sheet"` and an import batch tag so the whole run can be rolled
back. Upsert on staff + day: the sheet wins on any day the ERP already holds, but only
for what the sheet actually asserts — an existing biometric row keeps its punch times,
working hours and lateness flags.

### 3. Entitlement, and only entitlement

The balance phase writes:

- a per-staff `leaveQuota` override from the sheet's CURRENT block (CL, EL, ML), so
  permanent staff keep the sheet's zero allocation instead of inheriting the flat
  policy default;
- one FL opening credit per person of `USED FL + BALANCE FL`, dated January 1;
- `leavePolicy.negativeEmploymentTypes` gains `permanent`, without which the sheet's
  deficits (Rashid at CL −3) would floor at zero.

It no longer writes month-by-month deduction rows. That is the change that makes the
grid the single source of usage.

### 4. Usage comes from the register

After the import, `reconcileAttendanceLeave` runs for 2026. Every CL/EL/ML/FL day on
the register that no approved request accounts for gets one debit carrying its
`sourceAttendanceId`. Re-running produces nothing new, an edited day corrects its own
debit, and a day that stops being leave takes its debit with it. August needs no
special case — its grid is complete, so its days are simply there.

### 5. Week-off duties start in September

`HW` days import as attendance, but the week-off duty scan is given a start date of
September 1. Jan–Aug FL is already credited from the balance tab; raising 101 pending
duties for the same period would credit it twice once an admin converted them. From
September the ERP earns FL the normal way.

### 6. Variance report

The run ends by printing, per staff and per bucket: the sheet's BALANCE, the balance
the ERP now computes, and the difference — with the sheet's USED next to the grid's day
count so the cause of each gap is visible. Nothing is corrected automatically; the
report is for the team to read.

## Order of operations

1. Dry run. Read the variance report. Nothing is written.
2. Create the eleven relieved staff records.
3. Import attendance, January to August.
4. Write entitlement (quota overrides, FL openings, negative-balance policy).
5. Reconcile 2026.
6. Re-read the variance report against the committed numbers.

Every step is idempotent; the whole run can be repeated.

## What is deliberately not done

- **Nothing before January 2026.** The sheet is a 2026 sheet.
- **No correction of the sheet.** Where the balance tab and its grids disagree, the
  grid wins and the gap is reported. Deciding which is right is the team's call.
- **No back-filled EL entitlement.** Every person's EL entitlement on the sheet is
  zero, so the two EL days marked in January land as a deficit. That is what the sheet
  says.

## Testing

`scripts/lib/sheet-import.mjs` stays pure and is covered by
`src/lib/leave-sheet-import.test.ts`; the new rules get tests there:

- a balance row produces the quota and the FL opening, and no month deductions;
- a former-staff row produces a relieved, soft-deleted record with the right code,
  including the two suffixed collisions;
- the variance calculation, against a row where the sheet and the grid disagree.

The IO half stays in `scripts/import-attendance-sheet.mjs` and is exercised by the dry
run.
