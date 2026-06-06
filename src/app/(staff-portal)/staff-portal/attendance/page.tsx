"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument, getDocuments, createDocument, updateDocument, where, Timestamp } from "@/lib/firestore";
import { Attendance, AttendanceStatus, Shift, Staff } from "@/types";
import { AppSettings, getAppSettings, getDaySchedule, getHoliday, evaluateCheckIn, evaluateCheckOut, resolveAttendanceStatus, calculateOvertime } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { ClipboardEdit, Clock, LogIn, LogOut, MapPin, Send } from "lucide-react";

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
  const [todayRecord, setTodayRecord] = useState<(Attendance & { id: string }) | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    requestedCheckIn: "",
    requestedCheckOut: "",
    requestedStatus: "present" as AttendanceStatus,
    reason: "",
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const fetchToday = async () => {
    if (!user) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const records = await getDocuments<Attendance>("attendance", [
        where("staffId", "==", user.staffId),
        where("date", "==", Timestamp.fromDate(today)),
      ]);
      setTodayRecord(records.length > 0 ? records[0] : null);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchToday(); }, [user]);

  useEffect(() => {
    getAppSettings()
      .then(setSettings)
      .catch((error) => console.error("Error:", error));
  }, []);

  useEffect(() => {
    if (!user) return;
    getDocument<Staff>("staff", user.staffId)
      .then((staff) => {
        if (staff?.shiftId) {
          return getDocument<Shift>("shifts", staff.shiftId).then((s) => setShift(s));
        }
        setShift(null);
      })
      .catch((error) => console.error("Error:", error));
  }, [user]);

  const handleCheckIn = async () => {
    if (!user || !settings) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { isOff, isLate, holiday } = evaluateCheckIn(settings, new Date(), shift);
    const locationRequired = settings.attendanceRules.locationRequired;

    const data: Record<string, unknown> = {
      staffId: user.staffId,
      date: Timestamp.fromDate(today),
      checkIn: Timestamp.now(),
      status: "present",
      isLate,
      isEarlyDeparture: false,
    };
    if (holiday) data.remarks = `Worked on holiday: ${holiday.name}`;
    else if (isOff) data.remarks = "Worked on a scheduled off day";

    const saveWithLocation = (loc?: { lat: number; lng: number }) => {
      if (loc) data.checkInLocation = loc;
      return createDocument("attendance", data).then(fetchToday);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => saveWithLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          if (locationRequired) {
            alert("Location access is required to check in. Please enable location and try again.");
            return;
          }
          saveWithLocation();
        }
      );
    } else if (locationRequired) {
      alert("Location is required to check in, but your device does not support it.");
    } else {
      saveWithLocation();
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord || !settings) return;
    const checkOutTime = Timestamp.now();
    const checkInMs = todayRecord.checkIn?.seconds ? todayRecord.checkIn.seconds * 1000 : Date.now();
    const workingHours = (Date.now() - checkInMs) / (1000 * 60 * 60);
    const { isEarlyDeparture } = evaluateCheckOut(settings, new Date(), shift);
    const status = resolveAttendanceStatus(settings, workingHours);
    const overtimeHours = calculateOvertime(settings, workingHours);

    await updateDocument("attendance", todayRecord.id, {
      checkOut: checkOutTime,
      workingHours: Math.round(workingHours * 100) / 100,
      overtimeHours,
      isEarlyDeparture,
      status: status === "absent" ? "half-day" : status,
    });
    fetchToday();
  };

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

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const todaySchedule = settings ? getDaySchedule(settings, now) : null;
  const todayHoliday = settings ? getHoliday(settings, now) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Attendance</h1>

      {/* Current Time */}
      <Card>
        <CardContent className="p-6 text-center">
          <Clock className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
          <p className="text-3xl font-bold">{timeStr}</p>
          <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
          {todaySchedule && (
            <div className="mt-3">
              {todayHoliday ? (
                <Badge variant="bg-rose-100 text-rose-700">Holiday: {todayHoliday.name}</Badge>
              ) : todaySchedule.enabled ? (
                <p className="text-xs text-gray-500">
                  Scheduled hours: <span className="font-medium text-gray-700">{todaySchedule.start} – {todaySchedule.end}</span>
                </p>
              ) : (
                <Badge variant="bg-purple-100 text-purple-700">Scheduled Off Day</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            {!todayRecord ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-gray-500">You haven&apos;t checked in today.</p>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleCheckIn} disabled={!settings}>
                  <LogIn className="h-5 w-5 mr-2" /> Check In
                </Button>
              </div>
            ) : !todayRecord.checkOut ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-medium">Checked In</span>
                </div>
                <p className="text-xs text-gray-500">
                  At {todayRecord.checkIn ? new Date(todayRecord.checkIn.seconds * 1000).toLocaleTimeString("en-IN") : "—"}
                </p>
                {todayRecord.isLate && <Badge variant="bg-orange-100 text-orange-700">Late Arrival</Badge>}
                <Button className="w-full" variant="destructive" onClick={handleCheckOut}>
                  <LogOut className="h-5 w-5 mr-2" /> Check Out
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-green-600 font-medium">Day Complete!</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Check In</p>
                    <p className="font-medium">{new Date(todayRecord.checkIn!.seconds * 1000).toLocaleTimeString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Check Out</p>
                    <p className="font-medium">{new Date(todayRecord.checkOut.seconds * 1000).toLocaleTimeString("en-IN")}</p>
                  </div>
                </div>
                {todayRecord.workingHours && (
                  <p className="text-sm">Working Hours: <span className="font-bold">{todayRecord.workingHours.toFixed(1)}h</span></p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
