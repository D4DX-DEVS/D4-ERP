"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getDocument } from "@/lib/firestore";
import { LeaveRequest } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { formatDate, getStatusColor } from "@/lib/utils";
import { ArrowLeft, CalendarRange, CircleDashed, MessageSquare, ShieldCheck } from "lucide-react";

const typeLabels: Record<string, string> = {
  leave: "Leave",
  wfh: "Work From Home",
  overtime: "Overtime",
  "on-duty": "On Duty",
};

export default function MyLeaveDetailPage() {
  const params = useParams();
  const leaveId = params.id as string;

  const [leave, setLeave] = useState<(LeaveRequest & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadLeave() {
      try {
        const leaveData = await getDocument<LeaveRequest>("leaveRequests", leaveId);
        if (!isMounted) return;
        setLeave(leaveData);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadLeave();

    return () => {
      isMounted = false;
    };
  }, [leaveId]);

  if (loading) return <PageLoader />;
  if (!leave) return null;

  const start = leave.startDate?.seconds ? formatDate(new Date(leave.startDate.seconds * 1000)) : "—";
  const end = leave.endDate?.seconds ? formatDate(new Date(leave.endDate.seconds * 1000)) : "—";

  return (
    <div className="space-y-6">
      <ListingHeader
        title={typeLabels[leave.type]}
        description="Detailed breakdown of the request period, status, and approval remarks."
        action={
          <Link href="/staff-portal/my-leaves">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to leaves
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<CalendarRange className="h-5 w-5" />} label="Start Date" value={start} toneClassName="bg-slate-100 text-slate-700" meta="Request start" />
        <ListingStatCard icon={<CalendarRange className="h-5 w-5" />} label="End Date" value={end} toneClassName="bg-sky-50 text-sky-700" meta="Request end" />
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Status" value={leave.status} toneClassName="bg-amber-50 text-amber-700" meta="Current approval state" />
        <ListingStatCard icon={<ShieldCheck className="h-5 w-5" />} label="Leave Type" value={leave.leaveType || typeLabels[leave.type]} toneClassName="bg-emerald-50 text-emerald-700" meta="Request category" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Request Summary" description="Timeline and approval context for this leave request.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Request Type" value={typeLabels[leave.type]} />
            <DetailField label="Status" value={<Badge variant={getStatusColor(leave.status)}>{leave.status}</Badge>} />
            <DetailField label="Start Date" value={start} />
            <DetailField label="End Date" value={end} />
            <DetailField
              label="Duration"
              value={
                leave.isHalfDay
                  ? `Half Day (${leave.session === "first-half" ? "First Half / Morning" : "Second Half / Afternoon"})`
                  : "Full Day"
              }
            />
            <DetailField label="Start Time" value={leave.startTime || "—"} />
            <DetailField label="End Time" value={leave.endTime || "—"} />
            <div className="md:col-span-2">
              <DetailField label="Reason" value={leave.reason} />
            </div>
          </div>
        </ListingPanel>

        <ListingPanel title="Review Notes" description="Approval details and administrative remarks.">
          <div className="space-y-4">
            <DetailField label="Approval Date" value={leave.approvalDate?.seconds ? formatDate(new Date(leave.approvalDate.seconds * 1000)) : "—"} />
            <DetailField label="Approved By" value={leave.approvedBy || "—"} />
            <DetailField label="Remarks" value={leave.remarks || "No remarks added"} />
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
              <div className="flex items-center gap-2 text-slate-700">
                <MessageSquare className="h-4 w-4" />
                Review history remains attached to the request for future reference.
              </div>
            </div>
          </div>
        </ListingPanel>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-2 text-sm text-slate-700">{value}</div>
    </div>
  );
}