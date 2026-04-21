"use client";

import { useEffect, useState } from "react";
import { getDocuments, where, Timestamp } from "@/lib/firestore";
import { Attendance, Staff } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { Users, UserCheck, UserX, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function AttendancePage() {
  const [records, setRecords] = useState<(Attendance & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const date = new Date(selectedDate);
      date.setHours(0, 0, 0, 0);

      const [att, staff] = await Promise.all([
        getDocuments<Attendance>("attendance", [
          where("date", "==", Timestamp.fromDate(date)),
        ]),
        getDocuments<Staff>("staff"),
      ]);

      setRecords(att);
      setStaffList(staff.filter((s) => s.status === "active"));
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load attendance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedDate]);

  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s]));
  const presentIds = new Set(records.map((r) => r.staffId));
  const present = records.length;
  const absent = staffList.length - present;
  const late = records.filter((r) => r.isLate).length;
  const earlyDep = records.filter((r) => r.isEarlyDeparture).length;

  const timeStr = (ts: { seconds: number } | undefined) =>
    ts ? new Date(ts.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={<Users className="h-5 w-5 text-blue-500" />} label="Total Staff" value={staffList.length} />
        <SummaryCard icon={<UserCheck className="h-5 w-5 text-green-500" />} label="Present" value={present} />
        <SummaryCard icon={<UserX className="h-5 w-5 text-red-500" />} label="Absent" value={absent} />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5 text-orange-500" />} label="Late" value={late} />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>Attendance Records</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Staff</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Check In</th>
                    <th className="pb-2 font-medium">Check Out</th>
                    <th className="pb-2 font-medium">Hours</th>
                    <th className="pb-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((staff) => {
                    const rec = records.find((r) => r.staffId === staff.id);
                    return (
                      <tr key={staff.id} className="border-b last:border-0">
                        <td className="py-2">{staff.firstName} {staff.lastName}</td>
                        <td>
                          <Badge variant={rec ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                            {rec ? "Present" : "Absent"}
                          </Badge>
                        </td>
                        <td>{rec ? timeStr(rec.checkIn as { seconds: number }) : "—"}</td>
                        <td>{rec ? timeStr(rec.checkOut as { seconds: number }) : "—"}</td>
                        <td>{rec?.workingHours ? `${rec.workingHours.toFixed(1)}h` : "—"}</td>
                        <td className="flex gap-1">
                          {rec?.isLate && <Badge variant="bg-orange-100 text-orange-700">Late</Badge>}
                          {rec?.isEarlyDeparture && <Badge variant="bg-yellow-100 text-yellow-700">Early</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
