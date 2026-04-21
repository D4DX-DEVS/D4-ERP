"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { LeaveRequest } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, getStatusColor } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading";

export default function MyLeavesPage() {
  const { user } = useAuthStore();
  const [leaves, setLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Leave History</h1>

      {leaves.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No leave requests found.</p>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => (
            <Card key={leave.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{typeLabels[leave.type]}</p>
                      {leave.leaveType && <Badge>{leave.leaveType}</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {leave.startDate ? formatDate(new Date(leave.startDate.seconds * 1000)) : ""}
                      {leave.endDate && leave.endDate.seconds !== leave.startDate?.seconds
                        ? ` — ${formatDate(new Date(leave.endDate.seconds * 1000))}`
                        : ""}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{leave.reason}</p>
                    {leave.remarks && <p className="text-xs text-gray-400 italic mt-1">Remarks: {leave.remarks}</p>}
                  </div>
                  <Badge variant={getStatusColor(leave.status)}>{leave.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
