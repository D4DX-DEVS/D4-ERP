"use client";

import { useEffect, useMemo, useState } from "react";
import { LeaveRequest, Staff, Department, AttendanceStatus, StaffRequest } from "@/types";
import { countDocuments, createDocument, getDocuments, updateDocument, where, Timestamp } from "@/lib/firestore";
import { getAppSettings, isNonWorkingDay } from "@/lib/settings";
import { decideRequest, REQUEST_TYPE_LABELS, isLegacyRequest } from "@/lib/requests";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { CommentsSection } from "@/components/ui/comments-section";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, Check, X, Search, FilterX, CheckCheck, XCircle, Clock, CheckCircle2, XCircleIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { StatCard, StatGrid } from "@/components/ui/stat-card";

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

  // Remarks dialog
  const [remarksRequestId, setRemarksRequestId] = useState<string | null>(null);
  const [remarksStep, setRemarksStep] = useState<"deptHead" | "admin" | null>(null);
  const [remarksDecision, setRemarksDecision] = useState<"approved" | "rejected" | null>(null);
  const [remarksText, setRemarksText] = useState("");

  // Expanded details
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  } = usePagination<StaffRequest>("leaveRequests", {
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

  const handleAction = async (id: string, step: "deptHead" | "admin", decision: "approved" | "rejected", remarks?: string) => {
    try {
      const request = requests.find((r) => r.id === id);
      if (!request) return;

      // Use decideRequest for proper 2-step handling
      const { decideRequest } = await import("@/lib/requests");
      await decideRequest({ request, step, decision, remarks }, user!);

      const status = decision === "approved" && step === "admin" ? "approved" : decision === "rejected" ? "rejected" : "pending";
      if (status === "approved" || status === "rejected") {
        await syncLeaveToAttendance(request, status);
      }
      toast("success", `Request ${decision} successfully`);
      await refreshLeaves();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : `Failed to ${decision} request`);
    }
  };

  const handleBulkAction = async (decision: "approved" | "rejected") => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;
    for (const id of selectedIds) {
      try {
        const req = requests.find((r) => r.id === id) as StaffRequest & { id: string };
        if (!req) continue;

        const isLegacy = isLegacyRequest(req);
        if (isLegacy) {
          // Legacy: single-step
          await updateDocument("leaveRequests", id, {
            status: decision,
            approvedBy: user?.staffId,
            approvalDate: Timestamp.now(),
          });
          await syncLeaveToAttendance(req as LeaveRequest, decision);
        } else {
          // 2-step: determine which step(s) to act on
          const step: "deptHead" | "admin" = user?.role === "admin" ? "admin" : "deptHead";
          await decideRequest({ request: req, step, decision }, user!);
          const finalStatus = decision === "approved" && step === "admin" ? "approved" : decision === "rejected" ? "rejected" : "pending";
          if (finalStatus === "approved" || finalStatus === "rejected") {
            await syncLeaveToAttendance(req as LeaveRequest, finalStatus);
          }
        }
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkProcessing(false);
    if (successCount > 0) toast("success", `${successCount} request(s) ${decision}`);
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
  const syncLeaveToAttendance = async (leave: LeaveRequest | StaffRequest, status: "approved" | "rejected") => {
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

      {/* Stats Cards (act as status filters) */}
      <StatGrid cols={4}>
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={Clock}
          color="text-amber-600"
          bg="bg-amber-50"
          onClick={() => setFilterStatus(filterStatus === "pending" ? "" : "pending")}
          active={filterStatus === "pending"}
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          color="text-emerald-600"
          bg="bg-emerald-50"
          onClick={() => setFilterStatus(filterStatus === "approved" ? "" : "approved")}
          active={filterStatus === "approved"}
        />
        <StatCard
          title="Rejected"
          value={stats.rejected}
          icon={XCircleIcon}
          color="text-red-600"
          bg="bg-red-50"
          onClick={() => setFilterStatus(filterStatus === "rejected" ? "" : "rejected")}
          active={filterStatus === "rejected"}
        />
        <StatCard
          title="Cancelled"
          value={stats.cancelled}
          icon={XCircle}
          color="text-slate-600"
          bg="bg-slate-50"
          onClick={() => setFilterStatus(filterStatus === "cancelled" ? "" : "cancelled")}
          active={filterStatus === "cancelled"}
        />
      </StatGrid>

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
                ...Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label })),
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
              description="No requests match your filters"
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {filteredRequests.map((req) => {
              const isExpanded = expandedId === req.id;
              const isLegacy = isLegacyRequest(req);
              const staffDept = staffMap[req.staffId]?.departmentId;
              const deptName = departments.find((d) => d.id === staffDept)?.name || "—";
              const start = req.startDate ? formatDate(new Date(req.startDate.seconds * 1000)) : "—";
              const end = req.endDate && req.endDate.seconds !== req.startDate?.seconds
                ? formatDate(new Date(req.endDate.seconds * 1000))
                : null;
              const canActDeptHead = user?.role === "department-head" && user?.departmentId === req.departmentId && !isLegacy && req.deptHead?.status === "pending";
              const canActAdmin = user?.role === "admin" && !isLegacy;
              const canActLegacy = user?.role === "admin" && isLegacy && req.status === "pending";

              return (
                <Card key={req.id} className="overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full text-left"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {req.status === "pending" && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(req.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleSelect(req.id);
                              }}
                              className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-medium text-slate-900">{req.staffName || getStaffName(req.staffId)}</p>
                              <Badge variant="outline" className="text-xs">{deptName}</Badge>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-sm">
                              <Badge>{REQUEST_TYPE_LABELS[req.type]}</Badge>
                              {req.leaveType && <Badge variant="bg-slate-100 text-slate-700">{req.leaveType}</Badge>}
                              {req.isHalfDay && <Badge variant="bg-amber-100 text-amber-700">Half Day {req.session === "first-half" ? "(AM)" : "(PM)"}</Badge>}
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{end ? `${start} – ${end}` : start}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            {!isLegacy && (
                              <div className="flex gap-1 text-xs mb-1">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.deptHead?.status === "approved" ? "bg-green-100 text-green-700" : req.deptHead?.status === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                                  {req.deptHead?.status || "—"}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.admin?.status === "approved" ? "bg-green-100 text-green-700" : req.admin?.status === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                                  {req.admin?.status || "—"}
                                </span>
                              </div>
                            )}
                            <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                      {/* Approval Timeline (non-legacy) */}
                      {!isLegacy && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-medium text-slate-700 uppercase">Approval Timeline</h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white border-2" style={{
                                borderColor: req.deptHead?.status === "approved" ? "#10b981" : req.deptHead?.status === "rejected" ? "#ef4444" : "#d1d5db"
                              }}>
                                {req.deptHead?.status === "approved" && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                                {req.deptHead?.status === "rejected" && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-slate-700">Department Head</p>
                                {req.deptHead?.status === "pending" && <p className="text-slate-500">Pending</p>}
                                {req.deptHead?.status === "approved" && (
                                  <p className="text-emerald-600">Approved by {req.deptHead.byName} on {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}</p>
                                )}
                                {req.deptHead?.status === "rejected" && (
                                  <div>
                                    <p className="text-red-600">Rejected by {req.deptHead.byName} on {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}</p>
                                    {req.deptHead.remarks && <p className="text-red-600 text-xs mt-0.5">Remarks: {req.deptHead.remarks}</p>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white border-2" style={{
                                borderColor: req.admin?.status === "approved" ? "#10b981" : req.admin?.status === "rejected" ? "#ef4444" : "#d1d5db"
                              }}>
                                {req.admin?.status === "approved" && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                                {req.admin?.status === "rejected" && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-slate-700">Admin {req.adminOverride && <span className="text-xs text-amber-600">(override)</span>}</p>
                                {req.admin?.status === "pending" && <p className="text-slate-500">Pending</p>}
                                {req.admin?.status === "approved" && (
                                  <p className="text-emerald-600">Approved by {req.admin.byName} on {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}</p>
                                )}
                                {req.admin?.status === "rejected" && (
                                  <div>
                                    <p className="text-red-600">Rejected by {req.admin.byName} on {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}</p>
                                    {req.admin.remarks && <p className="text-red-600 text-xs mt-0.5">Remarks: {req.admin.remarks}</p>}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Details */}
                      <div className="space-y-2 text-xs text-slate-600 border-t border-slate-200 pt-4">
                        <p><span className="font-medium text-slate-700">Reason:</span> {req.reason}</p>
                        {req.attachments && req.attachments.length > 0 && (
                          <div>
                            <p className="font-medium text-slate-700 mb-1">Attachments:</p>
                            <div className="flex flex-wrap gap-2">
                              {req.attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs hover:text-blue-800">
                                  {att.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {(canActDeptHead || canActAdmin || canActLegacy) && (
                        <div className="border-t border-slate-200 pt-4 space-y-3">
                          {canActDeptHead && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-700">Department Head Action</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setRemarksRequestId(req.id);
                                    setRemarksStep("deptHead");
                                    setRemarksDecision("approved");
                                    setRemarksText("");
                                  }}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setRemarksRequestId(req.id);
                                    setRemarksStep("deptHead");
                                    setRemarksDecision("rejected");
                                    setRemarksText("");
                                  }}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}

                          {canActAdmin && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-700">Admin Action</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setRemarksRequestId(req.id);
                                    setRemarksStep("admin");
                                    setRemarksDecision("approved");
                                    setRemarksText("");
                                  }}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setRemarksRequestId(req.id);
                                    setRemarksStep("admin");
                                    setRemarksDecision("rejected");
                                    setRemarksText("");
                                  }}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}

                          {canActLegacy && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-700">Admin Action (Legacy)</p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleAction(req.id, "admin", "approved")}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleAction(req.id, "admin", "rejected")}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      <div className="border-t border-slate-200 pt-4">
                        <CommentsSection entityType="staff_request" entityId={req.id} />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={15} />

          {/* Remarks Dialog */}
          {remarksRequestId && remarksDecision && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-sm">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-medium text-lg">
                    {remarksDecision === "approved" ? "Approve Request" : "Reject Request"}
                  </h3>
                  <div>
                    <Label className="text-xs">Remarks (Optional)</Label>
                    <Textarea
                      value={remarksText}
                      onChange={(e) => setRemarksText(e.target.value)}
                      placeholder="Add remarks..."
                      className="mt-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setRemarksRequestId(null)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!remarksStep) return;
                        const req = requests.find((r) => r.id === remarksRequestId) as StaffRequest & { id: string };
                        if (!req) return;
                        try {
                          await handleAction(req.id, remarksStep, remarksDecision, remarksText);
                          setRemarksRequestId(null);
                        } catch (error) {
                          toast("error", "Failed to process request");
                        }
                      }}
                      className={remarksDecision === "approved" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                    >
                      Confirm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
