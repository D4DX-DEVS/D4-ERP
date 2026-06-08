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
import { Clock, LogIn, LogOut } from "lucide-react";

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

  const handleCheckIn = async () => {
    if (!user || !settings) return;
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

  const handleCheckOut = async () => {
    if (!todayRecord || !settings) return;
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

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const todaySchedule = settings ? getDaySchedule(settings, now) : null;
  const todayHoliday = settings ? getHoliday(settings, now, user?.companyId) : null;

  return (
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
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleCheckIn} disabled={!settings || working}>
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
                <Button className="w-full" variant="destructive" onClick={handleCheckOut} disabled={working}>
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
  );
}
