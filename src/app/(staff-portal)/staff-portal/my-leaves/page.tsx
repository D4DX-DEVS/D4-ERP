"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { LeaveRequest } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getStatusColor } from "@/lib/utils";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarRange, CircleDashed, Eye, ShieldCheck, XCircle } from "lucide-react";

export default function MyLeavesPage() {
  const { user } = useAuthStore();
  const [leaves, setLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    async function fetch() {
      try {
        const data = await getDocuments<LeaveRequest>("leaveRequests", [
          where("staffId", "==", user!.staffId),
          orderBy("createdAt", "desc"),
        ]);
        setLeaves(data);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [user]);

  if (loading) return <PageLoader />;

  const typeLabels: Record<string, string> = {
    leave: "Leave", wfh: "Work From Home", overtime: "Overtime", "on-duty": "On Duty",
  };

  const approvedLeaves = leaves.filter((leave) => leave.status === "approved").length;
  const pendingLeaves = leaves.filter((leave) => leave.status === "pending").length;
  const rejectedLeaves = leaves.filter((leave) => leave.status === "rejected").length;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="My Leave History"
        description="Every leave request follows the same listing structure with click-through detail access."
      />

      <ListingStatGrid>
        <ListingStatCard icon={<CalendarRange className="h-5 w-5" />} label="Total Requests" value={leaves.length} toneClassName="bg-slate-100 text-slate-700" meta="All submitted requests" />
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Pending" value={pendingLeaves} toneClassName="bg-amber-50 text-amber-700" meta="Awaiting approval" />
        <ListingStatCard icon={<ShieldCheck className="h-5 w-5" />} label="Approved" value={approvedLeaves} toneClassName="bg-emerald-50 text-emerald-700" meta="Confirmed requests" />
        <ListingStatCard icon={<XCircle className="h-5 w-5" />} label="Rejected" value={rejectedLeaves} toneClassName="bg-rose-50 text-rose-700" meta="Requests not approved" />
      </ListingStatGrid>

      <ListingPanel title="Leave Requests" description="Open any request for a full breakdown of dates, reasoning, and review remarks.">
        {leaves.length === 0 ? (
          <EmptyState title="No leave requests found" description="Submitted leave, WFH, overtime, and on-duty requests will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.map((leave) => {
                const detailHref = `/staff-portal/my-leaves/${leave.id}`;
                const start = leave.startDate ? formatDate(new Date(leave.startDate.seconds * 1000)) : "—";
                const end = leave.endDate && leave.endDate.seconds !== leave.startDate?.seconds
                  ? formatDate(new Date(leave.endDate.seconds * 1000))
                  : null;

                return (
                  <TableRow
                    key={leave.id}
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
                        <p className="font-medium text-slate-950">{typeLabels[leave.type]}</p>
                        {leave.leaveType ? <Badge className="mt-2" variant="bg-slate-100 text-slate-700">{leave.leaveType}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{end ? `${start} - ${end}` : start}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <p className="line-clamp-2 text-sm text-slate-600">{leave.reason}</p>
                    </TableCell>
                    <TableCell><Badge variant={getStatusColor(leave.status)}>{leave.status}</Badge></TableCell>
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
        )}
      </ListingPanel>
    </div>
  );
}
