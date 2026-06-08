"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { createDocument, Timestamp } from "@/lib/firestore";
import { AttendanceStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ClockInOutCard } from "@/components/staff/clock-in-out-card";
import { ClipboardEdit, Send } from "lucide-react";

const CORRECTION_STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "half-day", label: "Half Day" },
  { value: "late", label: "Late" },
  { value: "wfh", label: "Work From Home" },
  { value: "on-duty", label: "On Duty" },
  { value: "leave", label: "Leave" },
];

export default function StaffAttendancePage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    requestedCheckIn: "",
    requestedCheckOut: "",
    requestedStatus: "present" as AttendanceStatus,
    reason: "",
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const handleSubmitCorrection = async () => {
    if (!user) return;
    if (!correctionForm.reason.trim()) {
      toast("error", "Please provide a reason for the correction");
      return;
    }
    setSubmittingCorrection(true);
    try {
      const date = new Date(correctionForm.date);
      date.setHours(0, 0, 0, 0);
      await createDocument("attendance_corrections", {
        staffId: user.staffId,
        staffName: `${user.firstName} ${user.lastName}`,
        date: Timestamp.fromDate(date),
        requestedCheckIn: correctionForm.requestedCheckIn || undefined,
        requestedCheckOut: correctionForm.requestedCheckOut || undefined,
        requestedStatus: correctionForm.requestedStatus,
        reason: correctionForm.reason.trim(),
        status: "pending",
      });
      toast("success", "Correction request submitted");
      setCorrectionForm({
        date: new Date().toISOString().split("T")[0],
        requestedCheckIn: "",
        requestedCheckOut: "",
        requestedStatus: "present",
        reason: "",
      });
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to submit correction request");
    } finally {
      setSubmittingCorrection(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Attendance</h1>

      <ClockInOutCard />

      {/* Request Correction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardEdit className="h-5 w-5 text-sky-500" /> Request Attendance Correction
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            Forgot to punch or need to fix a record? Submit a request for your manager to review.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <DatePicker
                value={correctionForm.date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
              />
            </div>
            <div>
              <Label>Requested Status</Label>
              <Select
                options={CORRECTION_STATUS_OPTIONS}
                value={correctionForm.requestedStatus}
                onChange={(e) => setCorrectionForm({ ...correctionForm, requestedStatus: e.target.value as AttendanceStatus })}
              />
            </div>
            <div>
              <Label>Check In (optional)</Label>
              <TimePicker
                value={correctionForm.requestedCheckIn}
                onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckIn: e.target.value })}
              />
            </div>
            <div>
              <Label>Check Out (optional)</Label>
              <TimePicker
                value={correctionForm.requestedCheckOut}
                onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckOut: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              rows={3}
              value={correctionForm.reason}
              onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
              placeholder="Explain why this correction is needed"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmitCorrection} disabled={submittingCorrection}>
              <Send className="h-4 w-4 mr-2" />
              {submittingCorrection ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
