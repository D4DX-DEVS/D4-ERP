"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument, Timestamp } from "@/lib/firestore";
import { createStaffRequest, getStaffLeaveLedger, LEAVE_TYPE_LABELS, REQUEST_TYPE_LABELS } from "@/lib/requests";
import { ledgerBucket, type LeaveLedger } from "@/lib/leave-ledger";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Staff, StaffRequest } from "@/types";

const CL_MAX_WITHOUT_APPROVAL = 2;

type FormType = "leave" | "wfh" | "long-leave" | "salary-increment" | "overtime" | "on-duty" | "other";

interface FormState {
  type: FormType;
  leaveType?: string;
  isHalfDay: boolean;
  session?: "first-half" | "second-half";
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  requestedAmount?: number;
  reason: string;
  attachments: Array<{ name: string; url: string; type: string; size?: number }>;
}

export default function NewRequestPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Earned Leave is a permanent-staff benefit; contract staff and interns don't accrue it.
  const [isPermanent, setIsPermanent] = useState(false);
  // Current-year ledger: CL/ML/EL quota and days left, plus FL earned from
  // week-off duty and approved overtime — including any admin adjustment.
  const [balances, setBalances] = useState<LeaveLedger | null>(null);

  useEffect(() => {
    if (!user?.staffId) return;
    getStaffLeaveLedger(user.staffId).then(setBalances).catch(() => {});
  }, [user?.staffId]);

  useEffect(() => {
    if (!user?.staffId) return;
    getDocument<Staff>("staff", user.staffId)
      .then((s) => {
        if (!s) return;
        const type = s.employmentType || (s.contractType && s.contractType !== "permanent" ? "staff" : "permanent");
        setIsPermanent(type === "permanent");
      })
      .catch(() => {});
  }, [user?.staffId]);

  const [form, setForm] = useState<FormState>({
    type: "leave",
    leaveType: "CL",
    isHalfDay: false,
    session: "first-half",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    reason: "",
    attachments: [],
  });

  const requestedDays = (() => {
    if (form.type !== "leave" || !form.startDate) return 0;
    if (form.isHalfDay) return 0.5;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate || form.startDate);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  })();
  const exceedsClCap = form.leaveType === "CL" && requestedDays > CL_MAX_WITHOUT_APPROVAL;
  const isCoLeave = (form.type === "leave" || form.type === "long-leave") && form.leaveType === "CO";
  const exceedsCoBalance = isCoLeave && balances !== null && requestedDays > balances.fl.balance;

  const handleAddAttachment = (url: string, meta?: { name: string; size: number }) => {
    if (!url) return;
    const newAttachment = { name: meta?.name || "file", url, type: "file", size: meta?.size };
    setForm((prev) => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
  };

  const handleRemoveAttachment = (index: number) => {
    setForm((prev) => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // DatePicker is a custom button — no native `required` enforcement, so validate here
    if (!form.startDate || Number.isNaN(new Date(form.startDate).getTime())) {
      toast("error", "Please select a start date");
      return;
    }
    if (exceedsCoBalance) {
      toast("error", `Not enough flexible leave balance (available: ${balances?.fl.balance ?? 0} day(s)).`);
      return;
    }

    setSaving(true);
    try {
      const startDateTs = Timestamp.fromDate(new Date(form.startDate));
      const endDateTs = Timestamp.fromDate(new Date(form.endDate || form.startDate));

      await createStaffRequest(
        {
          type: form.type,
          ...(form.type === "leave" || form.type === "long-leave"
            ? { leaveType: form.leaveType as StaffRequest["leaveType"], isHalfDay: form.isHalfDay, session: form.isHalfDay ? form.session : undefined }
            : {}),
          ...(form.type === "overtime" ? { startTime: form.startTime, endTime: form.endTime } : {}),
          ...(form.type === "salary-increment" ? { requestedAmount: form.requestedAmount } : {}),
          startDate: startDateTs,
          endDate: endDateTs,
          reason: form.reason,
          attachments: form.attachments.length > 0 ? form.attachments : undefined,
        },
        user
      );
      setSubmitted(true);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to submit request");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Request Submitted!</h2>
        <p className="text-sm text-gray-500 mb-6">Your request has been sent for approval.</p>
        <Button onClick={() => { setSubmitted(false); setForm({ type: "leave", leaveType: "CL", isHalfDay: false, session: "first-half", startDate: "", endDate: "", startTime: "", endTime: "", reason: "", attachments: [] }); }}>
          Submit Another
        </Button>
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const typeOptions = Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">New Request</h1>
        <p className="text-sm text-gray-500 mt-1">Submit leave, WFH, overtime, salary increment, or other requests.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Request Type Selector */}
            <div className="space-y-2">
              <Label>Request Type *</Label>
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as FormType })}
                options={typeOptions}
              />
            </div>

            {/* Letter date — auto-generated on submit, not user-editable. */}
            <div className="space-y-2">
              <Label>Request Date</Label>
              <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {todayLabel}
                <span className="ml-2 text-xs text-slate-400">(set automatically)</span>
              </div>
            </div>

            {/* Leave-specific fields */}
            {(form.type === "leave" || form.type === "long-leave") && (
              <>
                <div className="space-y-2">
                  <Label>Leave Type *</Label>
                  <Select
                    value={form.leaveType || ""}
                    onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                    options={[
                      { value: "CL", label: LEAVE_TYPE_LABELS.CL },
                      { value: "SL", label: LEAVE_TYPE_LABELS.SL },
                      ...(isPermanent ? [{ value: "EL", label: LEAVE_TYPE_LABELS.EL }] : []),
                      { value: "CO", label: LEAVE_TYPE_LABELS.CO },
                      { value: "HD", label: LEAVE_TYPE_LABELS.HD },
                      { value: "LOP", label: LEAVE_TYPE_LABELS.LOP },
                    ]}
                  />
                  {isCoLeave && balances !== null && (
                    <p className={`text-xs ${exceedsCoBalance ? "text-rose-600" : "text-slate-600"}`}>
                      Flexible leave available: <b>{balances.fl.balance}</b> day(s) (earned {balances.fl.entitled} from
                      week-off duty and approved overtime, used {balances.fl.used}).
                      {exceedsCoBalance && " Not enough balance for this request."}
                    </p>
                  )}
                  {balances !== null && (form.leaveType === "CL" || form.leaveType === "SL" || form.leaveType === "EL") && (() => {
                    const b = ledgerBucket(balances, form.leaveType === "CL" ? "CL" : form.leaveType === "SL" ? "ML" : "EL");
                    return (
                      <p className={`text-xs ${b.balance < 0 ? "text-rose-600" : "text-slate-600"}`}>
                        Balance: <b>{b.balance}</b> of {b.entitled} day(s) left this year (used {b.used}).
                      </p>
                    );
                  })()}
                  {form.leaveType === "SL" && (
                    <p className="text-xs text-rose-600">Attach a medical report — approved by your coordinator.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={form.isHalfDay}
                        onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked })}
                      />
                      <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-600 peer-checked:after:translate-x-full" />
                    </label>
                    <Label className="cursor-pointer text-sm">Half Day Leave</Label>
                  </div>
                  {form.isHalfDay && (
                    <div className="space-y-2">
                      <Label>Session *</Label>
                      <Select
                        value={form.session || "first-half"}
                        onChange={(e) => setForm({ ...form, session: e.target.value as "first-half" | "second-half" })}
                        options={[
                          { value: "first-half", label: "First Half (Morning)" },
                          { value: "second-half", label: "Second Half (Afternoon)" },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {/* Leave dates: the day(s) you'll actually be away. */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{form.isHalfDay ? "Leave Date *" : "From Date *"}</Label>
                      <DatePicker
                        value={form.startDate}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            startDate: e.target.value,
                            // Half day / backwards range: keep end in sync with start.
                            endDate:
                              form.isHalfDay || !form.endDate || form.endDate < e.target.value
                                ? e.target.value
                                : form.endDate,
                          })
                        }
                        required
                      />
                    </div>
                    {!form.isHalfDay && (
                      <div className="space-y-2">
                        <Label>To Date *</Label>
                        <DatePicker
                          value={form.endDate || form.startDate}
                          min={form.startDate || undefined}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                          required
                        />
                      </div>
                    )}
                  </div>
                  {requestedDays > 0 && (
                    <p className="text-xs text-slate-600">
                      Applying for <b>{requestedDays}</b> day(s).
                    </p>
                  )}
                </div>

                {exceedsClCap && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      You&apos;re requesting <b>{requestedDays} days</b> of Casual Leave. Up to {CL_MAX_WITHOUT_APPROVAL} days
                      is standard — longer CL needs approval. You can still submit; it will be reviewed.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Overtime-specific fields */}
            {form.type === "overtime" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600">Pick any future date for your overtime.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <DatePicker value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value })} required />
                  </div>
                  <div className="space-y-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time *</Label>
                    <TimePicker value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time *</Label>
                    <TimePicker value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
                  </div>
                </div>
              </div>
            )}

            {/* Salary Increment fields */}
            {form.type === "salary-increment" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Requested Amount (₹) *</Label>
                  <input
                    type="number"
                    value={form.requestedAmount || ""}
                    onChange={(e) => setForm({ ...form, requestedAmount: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    placeholder="0"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            )}

            {/* Date range for other types */}
            {(form.type === "wfh" || form.type === "on-duty" || form.type === "other") && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Date *</Label>
                    <DatePicker value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>To Date *</Label>
                    <DatePicker value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                  </div>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Enter your reason..."
                required
              />
            </div>

            {/* Attachments */}
            <div className="space-y-3">
              <Label>Attachments (Optional)</Label>
              <FileUpload
                value=""
                onChange={handleAddAttachment}
                folder="misc"
                accept="*/*"
                preview="document"
              />
              {form.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Attached files ({form.attachments.length})</p>
                  <div className="space-y-1">
                    {form.attachments.map((att, i) => (
                      <div key={i} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate">
                          {att.name}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(i)}
                          className="text-red-600 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full " disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
