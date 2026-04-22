"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getDocument, getDocuments, Timestamp, where } from "@/lib/firestore";
import { Attendance, Staff } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { ArrowLeft, Clock3, MapPin, ShieldAlert, TimerReset, UserRound } from "lucide-react";

export default function AttendanceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const staffId = params.id as string;
  const selectedDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [staff, setStaff] = useState<(Staff & { id: string }) | null>(null);
  const [record, setRecord] = useState<(Attendance & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const date = new Date(selectedDate);
        date.setHours(0, 0, 0, 0);

        const [staffData, records] = await Promise.all([
          getDocument<Staff>("staff", staffId),
          getDocuments<Attendance>("attendance", [
            where("staffId", "==", staffId),
            where("date", "==", Timestamp.fromDate(date)),
          ]),
        ]);

        setStaff(staffData);
        setRecord(records[0] || null);
      } finally {
        setLoading(false);
      }
    }

    fetchDetail();
  }, [selectedDate, staffId]);

  const timeStr = (ts: { seconds: number } | undefined) =>
    ts ? new Date(ts.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  if (loading) return <PageLoader />;
  if (!staff) return null;

  return (
    <div className="space-y-6">
      <ListingHeader
        title={`${staff.firstName} ${staff.lastName}`}
        description={`Attendance detail for ${selectedDate}.`}
        action={
          <Link href={`/dashboard/attendance?date=${selectedDate}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to attendance
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<UserRound className="h-5 w-5" />} label="Role" value={staff.role.replace("-", " ")} toneClassName="bg-sky-50 text-sky-700" meta={staff.designation || "Staff member"} />
        <ListingStatCard icon={<Clock3 className="h-5 w-5" />} label="Check In" value={timeStr(record?.checkIn as { seconds: number } | undefined)} toneClassName="bg-emerald-50 text-emerald-700" meta="First recorded punch" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="Check Out" value={timeStr(record?.checkOut as { seconds: number } | undefined)} toneClassName="bg-indigo-50 text-indigo-700" meta="Last recorded punch" />
        <ListingStatCard icon={<ShieldAlert className="h-5 w-5" />} label="Flags" value={`${record?.isLate ? 1 : 0 + (record?.isEarlyDeparture ? 1 : 0)}`}
          toneClassName="bg-amber-50 text-amber-700" meta={record ? `${record.isLate ? "Late" : "On time"}${record.isEarlyDeparture ? " · Early departure" : ""}` : "No record"} />
      </ListingStatGrid>

      <ListingPanel title="Day Summary" description="Detailed attendance snapshot for the selected date.">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/70 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Status</p>
              <div className="mt-2">
                <Badge variant={record ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                  {record?.status || "absent"}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Working Hours</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{record?.workingHours ? `${record.workingHours.toFixed(1)} hours` : "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Flags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {record?.isLate ? <Badge variant="bg-amber-100 text-amber-700">Late arrival</Badge> : null}
                {record?.isEarlyDeparture ? <Badge variant="bg-yellow-100 text-yellow-700">Early departure</Badge> : null}
                {!record?.isLate && !record?.isEarlyDeparture ? <span className="text-sm text-slate-500">No flags for this day.</span> : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/70 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Check In Location</p>
              <p className="mt-2 text-sm text-slate-600">
                {record?.checkInLocation ? `${record.checkInLocation.lat}, ${record.checkInLocation.lng}` : "Location not captured"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Check Out Location</p>
              <p className="mt-2 text-sm text-slate-600">
                {record?.checkOutLocation ? `${record.checkOutLocation.lat}, ${record.checkOutLocation.lng}` : "Location not captured"}
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-[20px] bg-slate-50/90 p-4 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
              <span>Geo tags are shown when location access was granted during check-in or check-out.</span>
            </div>
          </div>
        </div>
      </ListingPanel>
    </div>
  );
}