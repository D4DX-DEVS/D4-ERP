"use client";

import { useEffect, useState } from "react";
import { LeaveRequest, Staff, AttendanceStatus } from "@/types";
import { countDocuments, createDocument, getDocuments, updateDocument, where, Timestamp } from "@/lib/firestore";
import { getAppSettings, isNonWorkingDay } from "@/lib/settings";
import { createNotification } from "@/lib/notifications";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

export default function LeavesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [staffMap, setStaffMap] = useState<Record<string, Staff>>({});
  const [stats, setStats] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterType, setFilterType] = useState("");
  const {
    data: requests,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<LeaveRequest>("leaveRequests", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints: [
      ...(filterStatus ? [where("status", "==", filterStatus)] : []),
      ...(filterType ? [where("type", "==", filterType)] : []),
    ],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLookupsAndStats() {
      try {
        const [staffList, pending, approved, rejected, cancelled] = await Promise.all([
          getDocuments<Staff>("staff"),
          countDocuments("leaveRequests", [where("status", "==", "pending")]),
          countDocuments("leaveRequests", [where("status", "==", "approved")]),
          countDocuments("leaveRequests", [where("status", "==", "rejected")]),
          countDocuments("leaveRequests", [where("status", "==", "cancelled")]),
        ]);

        if (!isMounted) return;

        const map: Record<string, Staff> = {};
        staffList.forEach((s) => { map[s.id] = s; });
        setStaffMap(map);
        setStats({ pending, approved, rejected, cancelled });
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) {
          setLookupsLoading(false);
        }
      }
    }

    void loadLookupsAndStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshLeaves = async () => {
    const [pending, approved, rejected, cancelled] = await Promise.all([
      countDocuments("leaveRequests", [where("status", "==", "pending")]),
      countDocuments("leaveRequests", [where("status", "==", "approved")]),
      countDocuments("leaveRequests", [where("status", "==", "rejected")]),
      countDocuments("leaveRequests", [where("status", "==", "cancelled")]),
    ]);
    setStats({ pending, approved, rejected, cancelled });
    refresh();
  };

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateDocument("leaveRequests", id, {
        status,
        approvedBy: user?.staffId,
        approvalDate: Timestamp.now(),
      });
      const request = requests.find((r) => r.id === id);
      if (request) {
        await syncLeaveToAttendance(request, status);
        await notifyStaffOfDecision(request, status);
      }
      toast("success", `Request ${status} successfully`);
      await refreshLeaves();
    } catch (error) {
      console.error("Error:", error);
      toast("error", `Failed to ${status} request`);
    }
  };

  // Notify the requesting staff member that their request was decided.
  const notifyStaffOfDecision = async (leave: LeaveRequest, status: "approved" | "rejected") => {
    const labels: Record<string, string> = {
      leave: "Leave",
      wfh: "Work From Home",
      overtime: "Overtime",
      "on-duty": "On Duty",
    };
    const label = labels[leave.type] ?? "Request";
    const sameDay = leave.endDate && leave.startDate && leave.endDate.seconds === leave.startDate.seconds;
    const range = leave.startDate
      ? `${formatDate(new Date(leave.startDate.seconds * 1000))}${!sameDay && leave.endDate ? ` – ${formatDate(new Date(leave.endDate.seconds * 1000))}` : ""}`
      : "";
    await createNotification({
      recipientId: leave.staffId,
      type: "leave",
      title: `${label} request ${status}`,
      message: `Your ${label.toLowerCase()} request${range ? ` for ${range}` : ""} has been ${status}.`,
      link: "/staff-portal/my-leaves",
      entityId: leave.id,
      entityType: "leaveRequest",
      senderName: user ? `${user.firstName} ${user.lastName}` : "Admin",
    });
  };

  // Map a leave-type request onto attendance status. Overtime requests do not
  // generate attendance days.
  const leaveStatusFor = (type: string): AttendanceStatus | null => {
    switch (type) {
      case "leave":
        return "leave";
      case "wfh":
        return "wfh";
      case "on-duty":
        return "on-duty";
      default:
        return null;
    }
  };

  // On approval, mark each working day in the range with the leave status.
  // On rejection of a request, remove any leave-sourced attendance it created.
  const syncLeaveToAttendance = async (leave: LeaveRequest, status: "approved" | "rejected") => {
    const baseStatus = leaveStatusFor(leave.type);
    if (!baseStatus || !leave.startDate || !leave.endDate) return;

    const settings = await getAppSettings();
    const start = new Date(leave.startDate.seconds * 1000);
    start.setHours(0, 0, 0, 0);
    const end = new Date(leave.endDate.seconds * 1000);
    end.setHours(0, 0, 0, 0);

    const sameDay = start.getTime() === end.getTime();
    const isHalfDay = leave.isHalfDay || (sameDay && !!leave.startTime && !!leave.endTime);
    const dayStatus: AttendanceStatus = isHalfDay ? "half-day" : baseStatus;
    const staffCompanyId = staffMap[leave.staffId]?.companyId;

    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);

      // Leave should not consume scheduled off days or holidays.
      if (isNonWorkingDay(settings, day, staffCompanyId)) continue;

      const existing = await getDocuments<{ id: string; source?: string }>("attendance", [
        where("staffId", "==", leave.staffId),
        where("date", "==", Timestamp.fromDate(day)),
      ]);

      if (status === "approved") {
        const data: Record<string, unknown> = {
          staffId: leave.staffId,
          date: Timestamp.fromDate(day),
          status: dayStatus,
          source: "leave",
          leaveId: leave.id,
          notes: `${leave.type === "leave" ? "Leave" : leave.type === "wfh" ? "WFH" : "On duty"} approved`,
          isDeleted: false,
        };
        if (existing[0]) {
          await updateDocument("attendance", existing[0].id, data);
        } else {
          await createDocument("attendance", data);
        }
      } else {
        // Reverse: only remove records this leave created.
        const created = existing.find((rec) => rec.source === "leave");
        if (created) {
          await updateDocument("attendance", created.id, {
            isDeleted: true,
            deletedBy: "Leave rejected",
            deletedAt: Timestamp.now(),
          });
        }
      }
    }
  };

  const getStaffName = (staffId: string) => {
    const s = staffMap[staffId];
    return s ? `${s.firstName} ${s.lastName}` : staffId;
  };

  const typeLabels: Record<string, string> = {
    leave: "Leave",
    wfh: "Work From Home",
    overtime: "Overtime",
    "on-duty": "On Duty",
  };

  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage leave, WFH, overtime & on-duty requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {(["pending", "approved", "rejected", "cancelled"] as const).map((status) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all ${filterStatus === status ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
          >
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats[status]}</p>
              <p className="text-sm text-gray-500 capitalize">{status}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "leave", label: "Leave" },
            { value: "wfh", label: "Work From Home" },
            { value: "overtime", label: "Overtime" },
            { value: "on-duty", label: "On Duty" },
          ]}
          className="w-[200px]"
        />
      </div>

      {totalCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<CalendarDays className="h-12 w-12" />}
              title="No requests found"
              description="No leave requests match your filters"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.staffName || getStaffName(req.staffId)}</TableCell>
                    <TableCell>
                      <Badge>{typeLabels[req.type] || req.type}</Badge>
                    </TableCell>
                    <TableCell>{req.leaveType || "—"}</TableCell>
                    <TableCell>
                      {req.isHalfDay ? (
                        <Badge variant="bg-amber-100 text-amber-700">
                          Half Day{req.session === "first-half" ? " (AM)" : req.session === "second-half" ? " (PM)" : ""}
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-500">Full Day</span>
                      )}
                    </TableCell>
                    <TableCell>{req.startDate ? formatDate(new Date(req.startDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell>{req.endDate ? formatDate(new Date(req.endDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.reason}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleAction(req.id, "approved")}>
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleAction(req.id, "rejected")}>
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
