"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument, getDocuments, createDocument, updateDocument, where, Timestamp } from "@/lib/firestore";
import { Attendance, Shift, Staff } from "@/types";
import {
  AppSettings,
  getAppSettings,
  getDaySchedule,
  getHoliday,
  evaluateCheckIn,
  evaluateCheckOut,
  resolveAttendanceStatus,
  calculateOvertime,
} from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Clock, LogIn, LogOut, MapPin, AlertTriangle, PartyPopper } from "lucide-react";

/**
 * Self-contained clock in / clock out widget for the staff portal. Reads the
 * current staff session, their shift, and app settings, then lets them check in
 * and out for the day. Holiday and off-day evaluation is scoped to the staff's
 * company.
 */
export function ClockInOutCard() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [todayRecord, setTodayRecord] = useState<(Attendance & { id: string }) | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"in" | "out" | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  // Live ticking clock so the displayed time always stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  const runCheckIn = async () => {
    if (!user || !settings) return;
    setConfirmAction(null);
    setWorking(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { isOff, isLate, holiday } = evaluateCheckIn(settings, new Date(), shift, user.companyId);
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
      return createDocument("attendance", data)
        .then(fetchToday)
        .catch(() => toast("error", "Failed to check in"))
        .finally(() => setWorking(false));
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => void saveWithLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          if (locationRequired) {
            toast("error", "Location access is required to check in. Please enable it and try again.");
            setWorking(false);
            return;
          }
          void saveWithLocation();
        }
      );
    } else if (locationRequired) {
      toast("error", "Location is required to check in, but your device does not support it.");
      setWorking(false);
    } else {
      void saveWithLocation();
    }
  };

  const runCheckOut = async () => {
    if (!todayRecord || !settings) return;
    setConfirmAction(null);
    setWorking(true);
    try {
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
      await fetchToday();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to check out");
    } finally {
      setWorking(false);
    }
  };

  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const todaySchedule = settings ? getDaySchedule(settings, now) : null;
  const todayHoliday = settings ? getHoliday(settings, now, user?.companyId) : null;

  // Late-arrival preview for the check-in confirmation modal.
  const checkInPreview = settings ? evaluateCheckIn(settings, now, shift, user?.companyId) : null;

  // Elapsed time since check-in, shown in the check-out confirmation modal.
  const elapsedLabel = (() => {
    if (!todayRecord?.checkIn?.seconds) return null;
    const ms = now.getTime() - todayRecord.checkIn.seconds * 1000;
    if (ms < 0) return null;
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  })();

  return (
    <>
    <div className="space-y-4">
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
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmAction("in")} disabled={!settings || working}>
                  <LogIn className="h-5 w-5 mr-2" /> {working ? "Checking In…" : "Check In"}
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
                {elapsedLabel && (
                  <p className="text-xs text-gray-500">Working for <span className="font-medium text-gray-700">{elapsedLabel}</span></p>
                )}
                <Button className="w-full" variant="destructive" onClick={() => setConfirmAction("out")} disabled={working}>
                  <LogOut className="h-5 w-5 mr-2" /> {working ? "Checking Out…" : "Check Out"}
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
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[3px]"
            onClick={() => setConfirmAction(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)] animate-slide-up">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <span
                className={cn(
                  "inline-flex h-14 w-14 items-center justify-center rounded-full",
                  confirmAction === "in" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}
              >
                {confirmAction === "in" ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
              </span>
            </div>

            <h3 className="text-center text-lg font-semibold text-slate-900">
              {confirmAction === "in" ? "Confirm Check In" : "Confirm Check Out"}
            </h3>
            <p className="mt-1 text-center text-sm text-slate-500">
              {confirmAction === "in"
                ? "You're about to start your day."
                : "You're about to end your day."}
            </p>

            {/* Live time */}
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-slate-900">{timeStr}</p>
              <p className="mt-0.5 text-xs text-slate-500">{dateStr}</p>
            </div>

            {/* Contextual hints */}
            {confirmAction === "in" && (
              <div className="mt-3 space-y-2">
                {todayHoliday && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    <PartyPopper className="h-4 w-4 shrink-0" />
                    <span>Today is a holiday ({todayHoliday.name}). This will be logged as worked on a holiday.</span>
                  </div>
                )}
                {!todayHoliday && checkInPreview?.isOff && (
                  <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Today is a scheduled off day. This will be logged as worked on an off day.</span>
                  </div>
                )}
                {checkInPreview?.isLate && (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>You&apos;re past your scheduled start time, so this will be marked as a late arrival.</span>
                  </div>
                )}
                {settings?.attendanceRules.locationRequired && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>Your location will be recorded with this check in.</span>
                  </div>
                )}
              </div>
            )}
            {confirmAction === "out" && elapsedLabel && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Clock className="h-4 w-4 shrink-0" />
                <span>You&apos;ve been working for about <span className="font-medium text-slate-800">{elapsedLabel}</span>.</span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmAction(null)} disabled={working}>
                Cancel
              </Button>
              <Button
                className={cn("flex-1", confirmAction === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700")}
                onClick={() => (confirmAction === "in" ? void runCheckIn() : void runCheckOut())}
                disabled={working}
              >
                {confirmAction === "in" ? "Check In" : "Check Out"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
