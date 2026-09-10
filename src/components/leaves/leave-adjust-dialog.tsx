"use client";

// Admin edit surface for one staff member's leave numbers. Two distinct moves,
// deliberately kept apart: setting the annual quota (the sheet's CURRENT
// column) rewrites the entitlement, while an adjustment posts a dated,
// reasoned row that the balance history can explain later.

import { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast";
import { Loader2 } from "lucide-react";
import {
  ADJUSTMENT_KIND_LABELS,
  createLeaveAdjustment,
  saveLeaveQuotaOverride,
} from "@/lib/leave-adjustments";
import { LEAVE_BUCKETS, LEAVE_BUCKET_LABELS } from "@/lib/leave-ledger";
import type { AuthUser, LeaveAdjustmentKind, LeaveBucket, LeaveQuota, Staff } from "@/types";

export type LeaveEditMode = "quota" | "adjust";

interface LeaveAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LeaveEditMode;
  staff: Staff;
  year: number;
  /** Quota currently in force, shown as the starting values. */
  quota: LeaveQuota;
  user: AuthUser | null;
  onSaved: () => void;
}

const BUCKET_OPTIONS = LEAVE_BUCKETS.map((b) => ({
  value: b,
  label: `${LEAVE_BUCKET_LABELS[b]} (${b})`,
}));

const KIND_OPTIONS = (Object.keys(ADJUSTMENT_KIND_LABELS) as LeaveAdjustmentKind[]).map((k) => ({
  value: k,
  label: ADJUSTMENT_KIND_LABELS[k],
}));

/** Kinds that consume balance rather than add to it. */
const DEBIT_KINDS = new Set<LeaveAdjustmentKind>(["deduction"]);

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
  user,
  onSaved,
}: LeaveAdjustDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [quotaForm, setQuotaForm] = useState({
    casualLeave: String(staff.leaveQuota?.casualLeave ?? quota.casualLeave ?? 0),
    sickLeave: String(staff.leaveQuota?.sickLeave ?? quota.sickLeave ?? 0),
    earnedLeave: String(staff.leaveQuota?.earnedLeave ?? quota.earnedLeave ?? 0),
  });

  const [adjustForm, setAdjustForm] = useState({
    bucket: "CL" as LeaveBucket,
    kind: "grant" as LeaveAdjustmentKind,
    days: "1",
    date: todayKey(),
    reason: "",
  });

  const isDebit = DEBIT_KINDS.has(adjustForm.kind);

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

  const handleSaveAdjustment = async () => {
    const magnitude = Number(adjustForm.days);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      toast("error", "Enter a number of days greater than zero");
      return;
    }
    if (!adjustForm.reason.trim()) {
      toast("error", "Add a reason so this change can be explained later");
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
      toast("success", `${isDebit ? "Deducted" : "Credited"} ${magnitude} ${adjustForm.bucket} day(s)`);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>
          {mode === "quota" ? "Leave quota" : "Adjust leave balance"}
        </DialogTitle>
        <DialogDescription>
          {mode === "quota"
            ? `Annual allowance for ${staff.firstName} ${staff.lastName}. Overrides the quota their employment category gets.`
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
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-bucket">Leave type</Label>
              <Select
                id="adjust-bucket"
                options={BUCKET_OPTIONS}
                value={adjustForm.bucket}
                onChange={(e) => setAdjustForm({ ...adjustForm, bucket: e.target.value as LeaveBucket })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-kind">Entry type</Label>
              <Select
                id="adjust-kind"
                options={KIND_OPTIONS}
                value={adjustForm.kind}
                onChange={(e) =>
                  setAdjustForm({ ...adjustForm, kind: e.target.value as LeaveAdjustmentKind })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-days">Days</Label>
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
            </div>
          </div>

          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              isDebit ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {isDebit
              ? `Consumes ${adjustForm.days || 0} day(s) of ${adjustForm.bucket} balance.`
              : `Adds ${adjustForm.days || 0} day(s) to the ${adjustForm.bucket} entitlement.`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              rows={3}
              placeholder="e.g. Opening balance carried from the 2025 sheet"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            />
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
