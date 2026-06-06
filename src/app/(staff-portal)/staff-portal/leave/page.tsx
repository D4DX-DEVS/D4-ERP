"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { createDocument, Timestamp } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";

export default function ApplyLeavePage() {
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    type: "leave" as "leave" | "wfh" | "overtime" | "on-duty",
    leaveType: "CL",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    reason: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      await createDocument("leaveRequests", {
        staffId: user.staffId,
        staffName: `${user.firstName} ${user.lastName}`,
        type: form.type,
        leaveType: form.type === "leave" ? form.leaveType : null,
        startDate: Timestamp.fromDate(new Date(form.startDate)),
        endDate: Timestamp.fromDate(new Date(form.endDate || form.startDate)),
        startTime: form.startTime || null,
        endTime: form.endTime || null,
        reason: form.reason,
        status: "pending",
      });
      setSubmitted(true);
    } catch (error) {
      console.error("Error:", error);
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
        <Button onClick={() => { setSubmitted(false); setForm({ type: "leave", leaveType: "CL", startDate: "", endDate: "", startTime: "", endTime: "", reason: "" }); }}>
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Apply for Leave / WFH / OT / OD</h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Request Type *</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                options={[
                  { value: "leave", label: "Leave" },
                  { value: "wfh", label: "Work From Home" },
                  { value: "overtime", label: "Overtime" },
                  { value: "on-duty", label: "On Duty" },
                ]} />
            </div>

            {form.type === "leave" && (
              <div className="space-y-2">
                <Label>Leave Type *</Label>
                <Select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                  options={[
                    { value: "CL", label: "Casual Leave" },
                    { value: "SL", label: "Sick Leave" },
                    { value: "EL", label: "Earned Leave" },
                    { value: "CO", label: "Compensatory Off" },
                    { value: "HD", label: "Half Day" },
                    { value: "LOP", label: "Loss of Pay" },
                  ]} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{form.type === "overtime" ? "Date *" : "From Date *"}</Label>
                <DatePicker value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
              </div>
              {form.type !== "overtime" && (
                <div className="space-y-2">
                  <Label>To Date *</Label>
                  <DatePicker value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                </div>
              )}
            </div>

            {(form.type === "overtime" || form.leaveType === "HD") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <TimePicker value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <TimePicker value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Enter your reason..." required />
            </div>

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
