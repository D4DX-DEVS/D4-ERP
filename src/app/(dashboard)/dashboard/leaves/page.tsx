"use client";

import { useEffect, useMemo, useState } from "react";
import { LeaveRequest, Staff, Department, AttendanceStatus } from "@/types";
import { countDocuments, createDocument, getDocuments, updateDocument, where, Timestamp } from "@/lib/firestore";
import { getAppSettings, isNonWorkingDay } from "@/lib/settings";
import { createNotification } from "@/lib/notifications";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, Check, X, Search, FilterX, CheckCheck, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

export default function LeavesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [staffMap, setStaffMap] = useState<Record<string, Staff>>({});
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [lookupsLoading, setLookupsLoading] = useState(true);

  // Filters
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterType, setFilterType] = useState("");
  const [filterStaff, setFilterStaff] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterLeaveType, setFilterLeaveType] = useState("");
  const [filterDuration, setFilterDuration] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Build constraints based on filters
  const constraints = useMemo(() => {
    const c = [];
    if (filterStatus) c.push(where("status", "==", filterStatus));
    if (filterType) c.push(where("type", "==", filterType));
    if (filterStaff) c.push(where("staffId", "==", filterStaff));
    if (filterLeaveType) c.push(where("leaveType", "==", filterLeaveType));
    if (filterDuration === "half-day") c.push(where("isHalfDay", "==", true));
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      c.push(where("startDate", ">=", Timestamp.fromDate(from)));
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      c.push(where("startDate", "<=", Timestamp.fromDate(to)));
    }
    return c;
  }, [filterStatus, filterType, filterStaff, filterLeaveType, filterDuration, filterDateFrom, filterDateTo]);

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
    pageSize: 15,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  // Client-side filters that can't be done in DB queries
  const filteredRequests = useMemo(() => {
    let result = requests;

    // Filter by department (through staffMap)
    if (filterDepartment) {
      result = result.filter((r) => {
        const staff = staffMap[r.staffId];
        return staff?.departmentId === filterDepartment;
      });
    }

    // Filter full-day only (inverse of half-day)
    if (filterDuration === "full-day") {
      result = result.filter((r) => !r.isHalfDay);
    }

    // Search by staff name or reason
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const name = (r.staffName || getStaffName(r.staffId)).toLowerCase();
        const reason = (r.reason || "").toLowerCase();
        return name.includes(q) || reason.includes(q);
      });
    }

    return result;
  }, [requests, filterDepartment, filterDuration, searchQuery, staffMap]);

  const hasActiveFilters = filterType || filterStaff || filterDepartment || filterLeaveType || filterDuration || filterDateFrom || filterDateTo || searchQuery;

  const clearAllFilters = () => {
    setFilterType("");
    setFilterStaff("");
    setFilterDepartment("");
    setFilterLeaveType("");
    setFilterDuration("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
  };

  useEffect(() => {
    let isMounted = true;

    async function loadLookupsAndStats() {
      try {
        const [staffList, deptList, pending, approved, rejected, cancelled] = await Promise.all([
          getDocuments<Staff>("staff"),
          getDocuments<Department>("departments"),
          countDocuments("leaveRequests", [where("status", "==", "pending")]),
          countDocuments("leaveRequests", [where("status", "==", "approved")]),
          countDocuments("leaveRequests", [where("status", "==", "rejected")]),
          countDocuments("leaveRequests", [where("status", "==", "cancelled")]),
        ]);

        if (!isMounted) return;

        const map: Record<string, Staff> = {};
        staffList.forEach((s) => { map[s.id] = s; });
        setStaffMap(map);
        setDepartments(deptList);
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
    setSelectedIds(new Set());
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

  const handleBulkAction = async (status: "approved" | "rejected") => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
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
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkProcessing(false);
    if (successCount > 0) toast("success", `${successCount} request(s) ${status}`);
    if (failCount > 0) toast("error", `${failCount} request(s) failed`);
    await refreshLeaves();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingInView = filteredRequests.filter((r) => r.status === "pending");
    if (selectedIds.size === pendingInView.length && pendingInView.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingInView.map((r) => r.id)));
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

  // Staff options for filter dropdown
  const staffOptions = useMemo(() => {
    const opts = Object.values(staffMap)
      .filter((s) => s.isActive)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
      .map((s) => ({ value: s.id!, label: `${s.firstName} ${s.lastName}` }));
    return [{ value: "", label: "All Staff" }, ...opts];
  }, [staffMap]);

  // Department options
  const departmentOptions = useMemo(() => {
    const opts = departments
      .filter((d) => d.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ value: d.id, label: d.name }));
    return [{ value: "", label: "All Departments" }, ...opts];
  }, [departments]);

  if (loading || lookupsLoading) return <PageLoader />;

  const pendingInView = filteredRequests.filter((r) => r.status === "pending");
  const allPendingSelected = pendingInView.length > 0 && selectedIds.size === pendingInView.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage leave, WFH, overtime & on-duty requests</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      {/* Search + Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Row 1: Search + Clear */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search staff name or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-slate-500 hover:text-slate-700">
                <FilterX className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Row 2: Filter dropdowns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            />
            <Select
              value={filterStaff}
              onChange={(e) => setFilterStaff(e.target.value)}
              options={staffOptions}
            />
            <Select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              options={departmentOptions}
            />
            <Select
              value={filterLeaveType}
              onChange={(e) => setFilterLeaveType(e.target.value)}
              options={[
                { value: "", label: "All Leave Types" },
                { value: "CL", label: "Casual Leave" },
                { value: "SL", label: "Sick Leave" },
                { value: "EL", label: "Earned Leave" },
                { value: "CO", label: "Comp. Off" },
                { value: "LOP", label: "Loss of Pay" },
              ]}
            />
            <Select
              value={filterDuration}
              onChange={(e) => setFilterDuration(e.target.value)}
              options={[
                { value: "", label: "All Durations" },
                { value: "half-day", label: "Half Day" },
                { value: "full-day", label: "Full Day" },
              ]}
            />
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: "", label: "All Statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>

          {/* Row 3: Date range */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Date Range:</span>
            <DatePicker
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              placeholder="From date"
              className="w-[160px] h-10"
            />
            <span className="text-slate-400">→</span>
            <DatePicker
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              placeholder="To date"
              className="w-[160px] h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size} request{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => handleBulkAction("approved")}
            disabled={bulkProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Approve All
          </Button>
          <Button
            size="sm"
            onClick={() => handleBulkAction("rejected")}
            disabled={bulkProcessing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject All
          </Button>
        </div>
      )}

      {filteredRequests.length === 0 ? (
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
                  {filterStatus === "pending" && (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                    </TableHead>
                  )}
                  <TableHead>Staff</TableHead>
                  <TableHead>Department</TableHead>
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
                {filteredRequests.map((req) => {
                  const staffDept = staffMap[req.staffId]?.departmentId;
                  const deptName = departments.find((d) => d.id === staffDept)?.name || "—";
                  return (
                    <TableRow key={req.id} className={selectedIds.has(req.id) ? "bg-blue-50/50" : ""}>
                      {filterStatus === "pending" && (
                        <TableCell>
                          {req.status === "pending" && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(req.id)}
                              onChange={() => toggleSelect(req.id)}
                              className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{req.staffName || getStaffName(req.staffId)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{deptName}</TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={15} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
