"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, createDocument, updateDocument, where, Timestamp } from "@/lib/firestore";
import { Attendance } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";

export default function StaffAttendancePage() {
  const { user } = useAuthStore();
  const [todayRecord, setTodayRecord] = useState<(Attendance & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchToday(); }, [user]);

  const handleCheckIn = async () => {
    if (!user) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data: Record<string, unknown> = {
      staffId: user.staffId,
      date: Timestamp.fromDate(today),
      checkIn: Timestamp.now(),
      status: "present",
      isLate: new Date().getHours() >= 10,
      isEarlyDeparture: false,
    };

    // Try to get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          data.checkInLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          await createDocument("attendance", data);
          fetchToday();
        },
        async () => {
          await createDocument("attendance", data);
          fetchToday();
        }
      );
    } else {
      await createDocument("attendance", data);
      fetchToday();
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;
    const checkOutTime = Timestamp.now();
    const checkInMs = todayRecord.checkIn?.seconds ? todayRecord.checkIn.seconds * 1000 : Date.now();
    const workingHours = (Date.now() - checkInMs) / (1000 * 60 * 60);

    await updateDocument("attendance", todayRecord.id, {
      checkOut: checkOutTime,
      workingHours: Math.round(workingHours * 100) / 100,
      isEarlyDeparture: new Date().getHours() < 17,
    });
    fetchToday();
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Attendance</h1>

      {/* Current Time */}
      <Card>
        <CardContent className="p-6 text-center">
          <Clock className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
          <p className="text-3xl font-bold">{timeStr}</p>
          <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
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
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleCheckIn}>
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
    </div>
  );
}
