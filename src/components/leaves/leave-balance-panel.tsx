"use client";

// One staff member's leave ledger, whole. Admins mount it with canEdit so they
// can fix a quota, post an adjustment, or turn a worked Sunday into flexible
// leave; the employee's portal mounts the same component read-only, which is
// what guarantees an admin edit shows up on the employee's screen.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  ADJUSTMENT_KIND_LABELS,
  convertSundayDuty,
  deleteLeaveAdjustment,
  detectSundayDuties,
  loadStaffLedger,
  rejectSundayDuty,
  reopenSundayDuty,
  type StaffLedgerBundle,
} from "@/lib/leave-adjustments";
import { LEAVE_BUCKET_LABELS } from "@/lib/leave-ledger";
import { LeaveAdjustDialog, type LeaveEditMode } from "@/components/leaves/leave-adjust-dialog";
import {
  LeaveBalanceCards,
  LeaveMonthlyStrip,
  LeaveSummaryLine,
  SundaySummaryCards,
  days,
} from "@/components/leaves/leave-balance-cards";
import { CalendarPlus, CalendarSearch, Loader2, Pencil, RotateCcw, Trash2, X, Check } from "lucide-react";
import type { AuthUser, LeaveAdjustment, Staff, SundayDuty } from "@/types";

interface LeaveBalancePanelProps {
  staff: Staff;
  year: number;
  /** Admin controls: quota, adjustments, week-off conversion. */
  canEdit: boolean;
  user: AuthUser | null;
  /** Year picker for pages that let the admin look back at a previous year. */
  onYearChange?: (year: number) => void;
}

function dutyDate(duty: SundayDuty): Date {
  return new Date((duty.date?.seconds ?? 0) * 1000);
}

function sortByDateDesc<T extends { date?: { seconds: number } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.date?.seconds ?? 0) - (a.date?.seconds ?? 0));
}

export function LeaveBalancePanel({ staff, year, canEdit, user, onYearChange }: LeaveBalancePanelProps) {
  const { toast } = useToast();
  const [bundle, setBundle] = useState<StaffLedgerBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [dialog, setDialog] = useState<LeaveEditMode | null>(null);

  const staffId = staff.id;

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      setBundle(await loadStaffLedger(staffId, year, { staff }));
    } catch {
      toast("error", "Failed to load leave balance");
    } finally {
      setLoading(false);
    }
    // `staff` is refetched by the parent after an edit; depending on its id
    // keeps this from re-running on every unrelated parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await detectSundayDuties({ staffList: [staff], year, staffId }, user);
      toast(
        "success",
        result.created > 0
          ? `Found ${result.created} new week-off duty day(s)`
          : "No new week-off duty days found"
      );
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleConvert = async (duty: SundayDuty, creditDays: number) => {
    setBusyId(duty.id ?? null);
    try {
      await convertSundayDuty({ duty, staff, creditDays }, user);
      toast("success", `Credited ${days(creditDays)} flexible leave day(s)`);
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Conversion failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (duty: SundayDuty) => {
    setBusyId(duty.id ?? null);
    try {
      await rejectSundayDuty({ duty }, user);
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not reject this day");
    } finally {
      setBusyId(null);
    }
  };

  const handleReopen = async (duty: SundayDuty) => {
    setBusyId(duty.id ?? null);
    try {
      await reopenSundayDuty(duty, user);
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not reopen this day");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAdjustment = async (adjustment: LeaveAdjustment) => {
    setBusyId(adjustment.id ?? null);
    try {
      await deleteLeaveAdjustment(adjustment, user);
      toast("success", "Entry removed");
      await load();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not remove this entry");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !bundle) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading leave balance…
      </div>
    );
  }
  if (!bundle) {
    return <EmptyState title="No leave data" description="This staff member has no leave records yet." />;
  }

  const { ledger, quota, adjustments, sundayDuties } = bundle;
  const thisYear = new Date().getFullYear();
  const yearOptions = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Leave balance {ledger.year}</h2>
          <p className="text-sm text-slate-500">
            Quota {quota.casualLeave} CL · {quota.sickLeave} ML · {quota.earnedLeave} EL
            {staff.leaveQuota ? " (custom)" : ""}
            {ledger.allowNegative ? " · deficit allowed" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onYearChange && (
            <div className="flex rounded-full border border-slate-200 p-0.5">
              {yearOptions.map((y) => (
                <button
                  key={y}
                  onClick={() => onYearChange(y)}
                  className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                    y === year ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog("quota")}>
                <Pencil className="mr-2 h-4 w-4" />
                Quota
              </Button>
              <Button size="sm" onClick={() => setDialog("adjust")}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Adjust
              </Button>
            </>
          )}
        </div>
      </div>

      <LeaveSummaryLine ledger={ledger} />
      <LeaveBalanceCards ledger={ledger} />
      {(ledger.hd > 0 || ledger.lop > 0) && (
        <p className="text-sm text-slate-500">
          Also this year: {days(ledger.hd)} half day(s), {days(ledger.lop)} loss-of-pay day(s).
        </p>
      )}

      <LeaveMonthlyStrip ledger={ledger} />

      {/* ───── Week-off duty ───── */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Week-off duty</h3>
              <p className="text-xs text-slate-500">
                Sundays and holidays worked. Converting one credits flexible leave.
              </p>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => void handleScan()} disabled={scanning}>
                {scanning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarSearch className="mr-2 h-4 w-4" />
                )}
                Scan attendance
              </Button>
            )}
          </div>

          <SundaySummaryCards ledger={ledger} />

          {sundayDuties.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No week-off duty recorded for {ledger.year}.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sortByDateDesc(sundayDuties).map((duty) => {
                const busy = busyId === duty.id;
                return (
                  <li key={duty.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{formatDate(dutyDate(duty))}</p>
                      <p className="text-xs text-slate-500">
                        {duty.source === "manual" ? "Added by admin" : "From attendance"}
                        {duty.workingHours ? ` · ${duty.workingHours}h` : ""}
                        {duty.status === "converted" ? ` · ${days(duty.creditDays ?? 1)} FL credited` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        duty.status === "converted"
                          ? "bg-emerald-100 text-emerald-700"
                          : duty.status === "rejected"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-amber-100 text-amber-700"
                      }
                    >
                      {duty.status}
                    </Badge>
                    {canEdit && duty.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void handleConvert(duty, 1)}>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Full day
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleConvert(duty, 0.5)}
                        >
                          Half
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Reject this week-off day"
                          disabled={busy}
                          onClick={() => void handleReject(duty)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {canEdit && duty.status === "rejected" && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleReopen(duty)}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reopen
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ───── Adjustment history ───── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Balance adjustments</h3>
          {adjustments.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No manual adjustments. Every balance here comes from approved requests.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sortByDateDesc(adjustments).map((a) => {
                const credit = a.days > 0;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        credit ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {credit ? "+" : "−"}
                      {days(Math.abs(a.days))} {a.bucket}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{a.reason}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(new Date((a.date?.seconds ?? 0) * 1000))} ·{" "}
                        {ADJUSTMENT_KIND_LABELS[a.kind] ?? a.kind}
                        {a.createdByName ? ` · ${a.createdByName}` : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${LEAVE_BUCKET_LABELS[a.bucket]} adjustment`}
                        disabled={busyId === a.id}
                        onClick={() => void handleDeleteAdjustment(a)}
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit && dialog && (
        <LeaveAdjustDialog
          open
          mode={dialog}
          onOpenChange={(open) => !open && setDialog(null)}
          staff={staff}
          year={year}
          quota={quota}
          user={user}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
