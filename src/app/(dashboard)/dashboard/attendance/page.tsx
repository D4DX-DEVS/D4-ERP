"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocuments, where, Timestamp } from "@/lib/firestore";
import { Attendance, Staff } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { Users, UserCheck, UserX, Eye, TimerReset } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

export default function AttendancePage() {
  const [records, setRecords] = useState<(Attendance & { id: string })[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const {
    data: staffList,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
  } = usePagination<Staff>("staff", {
    pageSize: 10,
    orderByField: "firstName",
    orderDirection: "asc",
    constraints: [where("status", "==", "active")],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadAttendance() {
      if (isMounted) {
        setRecordsLoading(true);
      }

      try {
        const date = new Date(selectedDate);
        date.setHours(0, 0, 0, 0);

        const att = await getDocuments<Attendance>("attendance", [
          where("date", "==", Timestamp.fromDate(date)),
        ]);

        if (!isMounted) return;

        setRecords(att);
      } catch (error) {
        console.error("Error:", error);
        if (isMounted) {
          toast("error", "Failed to load attendance data");
        }
      } finally {
        if (isMounted) {
          setRecordsLoading(false);
        }
      }
    }

    void loadAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedDate, toast]);

  const present = records.length;
  const absent = totalCount - present;
  const late = records.filter((r) => r.isLate).length;
  const earlyDep = records.filter((r) => r.isEarlyDeparture).length;

  const timeStr = (ts: { seconds: number } | undefined) =>
    ts ? new Date(ts.seconds * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  if (loading || recordsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Attendance"
        description={`Attendance records for ${formatDate(selectedDate)} with a uniform team-wide view.`}
        action={<Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto min-w-[170px]" />}
      />

      <ListingStatGrid>
        <ListingStatCard
          icon={<Users className="h-5 w-5" />}
          label="Total Staff"
          value={totalCount}
          toneClassName="bg-sky-50 text-sky-700"
          meta="Active team members"
        />
        <ListingStatCard
          icon={<UserCheck className="h-5 w-5" />}
          label="Present"
          value={present}
          toneClassName="bg-emerald-50 text-emerald-700"
          meta="Checked in today"
        />
        <ListingStatCard
          icon={<UserX className="h-5 w-5" />}
          label="Absent"
          value={absent}
          toneClassName="bg-rose-50 text-rose-700"
          meta="No attendance marked"
        />
        <ListingStatCard
          icon={<TimerReset className="h-5 w-5" />}
          label="Flags"
          value={late + earlyDep}
          toneClassName="bg-amber-50 text-amber-700"
          meta={`${late} late, ${earlyDep} early departures`}
        />
      </ListingStatGrid>

      <ListingPanel
        title={`Attendance Records (${totalCount})`}
        description="Click any row to open the detailed daily view for that staff member."
        contentClassName="p-0"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffList.map((staff) => {
              const rec = records.find((r) => r.staffId === staff.id);
              const detailHref = `/dashboard/attendance/${staff.id}?date=${selectedDate}`;

              return (
                <TableRow
                  key={staff.id}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(detailHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(detailHref);
                    }
                  }}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-950">{staff.firstName} {staff.lastName}</p>
                      <p className="text-xs text-slate-500">{staff.designation || staff.employeeCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rec ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                      {rec ? rec.status : "absent"}
                    </Badge>
                  </TableCell>
                  <TableCell>{rec ? timeStr(rec.checkIn as { seconds: number }) : "—"}</TableCell>
                  <TableCell>{rec ? timeStr(rec.checkOut as { seconds: number }) : "—"}</TableCell>
                  <TableCell>{rec?.workingHours ? `${rec.workingHours.toFixed(1)}h` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {rec?.isLate ? <Badge variant="bg-amber-100 text-amber-700">Late</Badge> : null}
                      {rec?.isEarlyDeparture ? <Badge variant="bg-yellow-100 text-yellow-700">Early</Badge> : null}
                      {!rec?.isLate && !rec?.isEarlyDeparture ? <span className="text-xs text-slate-400">None</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
      </ListingPanel>
    </div>
  );
}
