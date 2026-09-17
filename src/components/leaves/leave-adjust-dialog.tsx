"use client";

// Admin edit surface for one staff member's leave numbers. Two distinct moves,
// deliberately kept apart: setting the annual quota (the sheet's CURRENT
// column) rewrites the entitlement, while an adjustment posts a dated,
// reasoned row that the balance history can explain later.
//
// The adjustment form asks the two questions in the order a person thinks them:
// does the balance go up or down, and why. The direction owns the sign — the
// kind is only ever a description, which is why a "correction" can be either.

import { useMemo, useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2, Minus, Plus } from "lucide-react";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  createLeaveAdjustment,
  deleteLeaveAdjustment,
  saveLeaveQuotaOverride,
} from "@/lib/leave-adjustments";
import {
  LEAVE_BUCKETS,
  LEAVE_BUCKET_LABELS,
  MONTH_LABELS,
  days as fmtDays,
  monthStartDateKey,
} from "@/lib/leave-ledger";
import { leaveMonthSources, type LeaveMonthSource } from "@/lib/leave-month-sources";
import { LeaveCellSources } from "@/components/leaves/leave-cell-sources";
import type {
  AuthUser,
  LeaveAdjustment,
  LeaveAdjustmentKind,
  LeaveBucket,
  LeaveQuota,
  Staff,
  StaffRequest,
} from "@/types";

export type LeaveEditMode = "quota" | "adjust";

/** Up or down. The sign lives here, not on the kind. */
type Direction = "credit" | "debit";

interface LeaveAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LeaveEditMode;
  staff: Staff;
  year: number;
  /** Quota currently in force, shown as the starting values. */
  quota: LeaveQuota;
  /**
   * Opens the adjust form already pointed at one bucket and month, for the
   * month-wise grid. A month cell counts days taken, so this path only ever
   * posts debits — a credit is annual and would show in no month column at all.
   */
  prefill?: { bucket: LeaveBucket; month: number; current: number };
  /**
   * The rows behind the month cell, so the form can show what makes it up and
   * delete the one that is wrong. Passed whole rather than pre-filtered: the
   * leave type can still be changed inside the dialog.
   */
  ledgerRows?: { requests: StaffRequest[]; adjustments: LeaveAdjustment[] };
  user: AuthUser | null;
  onSaved: () => void;
}

const BUCKET_OPTIONS = LEAVE_BUCKETS.map((b) => ({
  value: b,
  label: `${LEAVE_BUCKET_LABELS[b]} (${b})`,
}));

function reasonOptions(direction: Direction) {
  return ADJUSTMENT_REASONS[direction].map((k) => ({
    value: k,
    label: ADJUSTMENT_REASON_LABELS[k],
  }));
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LeaveAdjustDialog({
  open,
  onOpenChange,
  mode,
  staff,
  year,
  quota,
  prefill,
  ledgerRows,
  user,
  onSaved,
}: LeaveAdjustDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [quotaForm, setQuotaForm] = useState({
    casualLeave: String(staff.leaveQuota?.casualLeave ?? quota.casualLeave ?? 0),
    sickLeave: String(staff.leaveQuota?.sickLeave ?? quota.sickLeave ?? 0),
    earnedLeave: String(staff.leaveQuota?.earnedLeave ?? quota.earnedLeave ?? 0),
  });

  const [adjustForm, setAdjustForm] = useState({
    bucket: prefill?.bucket ?? ("CL" as LeaveBucket),
    // A month cell is a count of days taken, so a click on one can only ever
    // grow by a debit; the open-ended Adjust button starts on a credit instead.
    direction: (prefill ? "debit" : "credit") as Direction,
    kind: (prefill ? "deduction" : "grant") as LeaveAdjustmentKind,
    days: "1",
    date: prefill ? monthStartDateKey(year, prefill.month) : todayKey(),
    reason: "",
  });

  const isDebit = adjustForm.direction === "debit";

  /** Recomputed as the leave type changes, so the breakdown always matches it. */
  const cell = useMemo(() => {
    if (!prefill || !ledgerRows) return null;
    const sameBucket = adjustForm.bucket === prefill.bucket;
    const result = leaveMonthSources({
      requests: ledgerRows.requests,
      adjustments: ledgerRows.adjustments,
      bucket: adjustForm.bucket,
      month: prefill.month,
      year,
    });
    return {
      ...result,
      // The cell figure the grid rendered is only known for the clicked bucket;
      // for any other the breakdown's own total is the honest number to show.
      cellDays: sameBucket ? prefill.current : result.accountedDays,
    };
  }, [prefill, ledgerRows, adjustForm.bucket, year]);

  /** Switching direction keeps the kind only when it still belongs there. */
  const setDirection = (direction: Direction) => {
    setAdjustForm((f) => ({
      ...f,
      direction,
      kind: ADJUSTMENT_REASONS[direction].includes(f.kind)
        ? f.kind
        : ADJUSTMENT_REASONS[direction][0],
    }));
  };

  const handleSaveQuota = async (clear: boolean) => {
    setSaving(true);
    try {
      await saveLeaveQuotaOverride(
        staff,
        clear
          ? {}
          : {
              casualLeave: Number(quotaForm.casualLeave),
              sickLeave: Number(quotaForm.sickLeave),
              earnedLeave: Number(quotaForm.earnedLeave),
            },
        user
      );
      toast("success", clear ? "Quota override cleared" : "Leave quota saved");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to save quota");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSource = async (source: LeaveMonthSource) => {
    if (!source.adjustment) return;
    setRemovingId(source.id);
    try {
      await deleteLeaveAdjustment(source.adjustment, user);
      toast("success", `Removed ${fmtDays(source.days)} ${adjustForm.bucket} day(s)`);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not remove this entry");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSaveAdjustment = async () => {
    const magnitude = Number(adjustForm.days);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      toast(
        "error",
        // Zero used to be the obvious way to ask for "make this cell empty", so
        // the message now says where that actually happens.
        cell && cell.cellDays > 0
          ? "This box adds days. To clear days already there, remove them from the list above."
          : "Enter how many days to add, e.g. 1 or 0.5"
      );
      return;
    }
    if (!adjustForm.reason.trim()) {
      toast("error", "Add a note so this change can be explained later");
      return;
    }
    setSaving(true);
    try {
      await createLeaveAdjustment(
        {
          staff,
          year,
          bucket: adjustForm.bucket,
          kind: adjustForm.kind,
          days: isDebit ? -magnitude : magnitude,
          date: adjustForm.date,
          reason: adjustForm.reason,
        },
        user
      );
      toast("success", `${isDebit ? "Took off" : "Added"} ${magnitude} ${adjustForm.bucket} day(s)`);
      setAdjustForm((f) => ({ ...f, days: "1", reason: "" }));
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const monthLabel = prefill ? MONTH_LABELS[prefill.month] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{mode === "quota" ? "Leave quota" : "Adjust leave balance"}</DialogTitle>
        <DialogDescription>
          {mode === "quota"
            ? `Annual allowance for ${staff.firstName} ${staff.lastName}. Overrides the quota their employment category gets.`
            : prefill
              ? // Follows the leave type actually selected, not the cell that was
                // clicked — the type can be changed from inside this dialog.
                `${monthLabel} ${year} · ${LEAVE_BUCKET_LABELS[adjustForm.bucket]}. This column counts days taken, so a day here is cleared by removing the entry that logged it — not by typing a smaller number.`
              : `Posts a dated entry on ${staff.firstName} ${staff.lastName}'s ${year} ledger. The employee sees the new balance immediately.`}
        </DialogDescription>
      </DialogHeader>

      {mode === "quota" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="quota-cl">Casual Leave (CL)</Label>
              <Input
                id="quota-cl"
                type="number"
                min={0}
                step="0.5"
                value={quotaForm.casualLeave}
                onChange={(e) => setQuotaForm({ ...quotaForm, casualLeave: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quota-ml">Medical Leave (ML)</Label>
              <Input
                id="quota-ml"
                type="number"
                min={0}
                step="0.5"
                value={quotaForm.sickLeave}
                onChange={(e) => setQuotaForm({ ...quotaForm, sickLeave: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quota-el">Earned Leave (EL)</Label>
              <Input
                id="quota-el"
                type="number"
                min={0}
                step="0.5"
                value={quotaForm.earnedLeave}
                onChange={(e) => setQuotaForm({ ...quotaForm, earnedLeave: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Flexible Leave has no quota — it is earned from week-off duty and approved overtime.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {staff.leaveQuota && (
              <Button variant="outline" onClick={() => void handleSaveQuota(true)} disabled={saving}>
                Use category default
              </Button>
            )}
            <Button onClick={() => void handleSaveQuota(false)} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save quota
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ───── What the clicked cell is made of ───── */}
          {prefill && cell && (
            <>
              <LeaveCellSources
                bucket={adjustForm.bucket}
                month={prefill.month}
                year={year}
                sources={cell.sources}
                cellDays={cell.cellDays}
                accountedDays={cell.accountedDays}
                onRemove={(s) => void handleRemoveSource(s)}
                busyId={removingId}
              />
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Or add days to {monthLabel}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-bucket">Leave type</Label>
              <Select
                id="adjust-bucket"
                options={BUCKET_OPTIONS}
                value={adjustForm.bucket}
                onChange={(e) =>
                  setAdjustForm({ ...adjustForm, bucket: e.target.value as LeaveBucket })
                }
              />
            </div>

            {/* The old "Entry type" select mixed direction with description, so
                the balance moved a way the label never stated. Direction first,
                on a control that shows both choices at once. */}
            <div className="space-y-2">
              <Label htmlFor="adjust-direction-credit">What are you doing?</Label>
              {prefill ? (
                <p className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  Adding days taken in {monthLabel}
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Does this add days or take them off?"
                  className="flex rounded-xl border border-slate-200 p-1"
                >
                  <button
                    id="adjust-direction-credit"
                    type="button"
                    onClick={() => setDirection("credit")}
                    aria-pressed={!isDebit}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors ${
                      !isDebit ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                    Add days
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection("debit")}
                    aria-pressed={isDebit}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors ${
                      isDebit ? "bg-rose-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Minus className="h-4 w-4" />
                    Take days off
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-kind">Why?</Label>
              <Select
                id="adjust-kind"
                options={reasonOptions(adjustForm.direction)}
                value={adjustForm.kind}
                onChange={(e) =>
                  setAdjustForm({ ...adjustForm, kind: e.target.value as LeaveAdjustmentKind })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-days">How many days?</Label>
              <Input
                id="adjust-days"
                type="number"
                min={0.5}
                step="0.5"
                value={adjustForm.days}
                onChange={(e) => setAdjustForm({ ...adjustForm, days: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Effective date</Label>
              <DatePicker
                value={adjustForm.date}
                onChange={(e) => setAdjustForm({ ...adjustForm, date: e.target.value })}
              />
              {prefill && (
                <p className="text-xs text-slate-500">
                  Decides which month column the days land in.
                </p>
              )}
            </div>
          </div>

          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              isDebit ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {isDebit
              ? `Records ${adjustForm.days || 0} more ${adjustForm.bucket} day(s) as taken${
                  monthLabel ? ` in ${monthLabel}` : ""
                }, leaving that much less balance.`
              : `Gives ${adjustForm.days || 0} extra ${adjustForm.bucket} day(s) for the year.`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Note</Label>
            <Textarea
              id="adjust-reason"
              rows={3}
              placeholder="e.g. Opening balance carried from the 2025 sheet"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              Shown in the balance history, so this is explainable later.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveAdjustment()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save entry
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
