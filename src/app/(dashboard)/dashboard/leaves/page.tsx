"use client";

import { useEffect, useMemo, useState } from "react";
import { LeaveRequest, Staff, Department, AttendanceStatus, StaffRequest } from "@/types";
import { countDocuments, createDocument, getDocuments, updateDocument, where, Timestamp } from "@/lib/firestore";
import { getAppSettings, isNonWorkingDay } from "@/lib/settings";
import { decideRequest, REQUEST_TYPE_LABELS, LEAVE_TYPE_LABELS, LEAVE_TYPE_CODES, computeLeaveBalances, type StaffLeaveBalances, isLegacyRequest } from "@/lib/requests";
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
import { CalendarDays, Check, X, Search, Filter, FilterX, CheckCheck, XCircle, Clock, CheckCircle2, XCircleIcon, ChevronDown, ChevronUp } from "lucide-react";
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  // Per-staff leave balances — derived on the fly from approved requests (current year)
  const [balances, setBalances] = useState<Record<string, StaffLeaveBalances> | null>(null);
  const [zeroBalance, setZeroBalance] = useState<StaffLeaveBalances | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const loadBalances = async () => {
    if (balances || balancesLoading) return;
    setBalancesLoading(true);
    try {
      const [settings, approved] = await Promise.all([
        getAppSettings(),
        getDocuments<StaffRequest>("leaveRequests", [where("status", "==", "approved")]),
      ]);
      const year = new Date().getFullYear();
      const byStaff = new Map<string, StaffRequest[]>();
      for (const r of approved) {
        if (!byStaff.has(r.staffId)) byStaff.set(r.staffId, []);
        byStaff.get(r.staffId)!.push(r);
      }
      const map: Record<string, StaffLeaveBalances> = {};
      for (const [sid, reqs] of byStaff) map[sid] = computeLeaveBalances(reqs, settings.leavePolicy, year);
      setZeroBalance(computeLeaveBalances([], settings.leavePolicy, year));
      setBalances(map);
    } catch {
      toast("error", "Failed to load leave balances");
    } finally {
      setBalancesLoading(false);
    }
  };

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


  // Map an approved request onto a stored attendance status. Legacy code wrote
  // "leave", which normalizeAttendanceStatus folds to "absent" — staff then saw
  // approved leave days as A. Map the actual leave type instead.
  const leaveStatusFor = (req: LeaveRequest | StaffRequest): AttendanceStatus | null => {
    switch (req.type) {
      case "leave":
      case "long-leave":
        switch (req.leaveType) {
          case "CL": return "casual-leave";
          case "SL": return "medical-leave"; // stored SL = Medical Leave (ML)
          case "EL": return "earned-leave";
          case "CO": return "full-leave"; // Flexible Leave (FL)
          case "HD": return "half-day";
          default: return "full-leave"; // LOP / legacy blank
        }
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
    const baseStatus = leaveStatusFor(leave);
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
          notes: `${leave.type === "wfh" ? "WFH" : leave.type === "on-duty" ? "On duty" : "Leave"} approved`,
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
          <h1 className="text-xl font-bold sm:text-2xl text-gray-900">Leave Requests</h1>
          <p className="text-sm text-gray-500 mt-1">Manage leave, WFH, overtime & on-duty requests</p>
        </div>
      </div>

      {/* Stats Cards (act as status filters) */}
      <StatGrid cols={4} mobileCols={4}>
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

      {/* Leave Balances — collapsed by default, loads on first open */}
      <Card>
        <details
          className="group"
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open) void loadBalances();
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
            <span className="text-base font-semibold text-slate-900">Leave Balances ({new Date().getFullYear()})</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <CardContent className="pt-0">
            {balancesLoading || !zeroBalance ? (
              <p className="py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>CL (used/total)</TableHead>
                      <TableHead>ML (used/total)</TableHead>
                      <TableHead>EL (used/total)</TableHead>
                      <TableHead>FL (available)</TableHead>
                      <TableHead>Half Days</TableHead>
                      <TableHead>LOP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(staffMap)
                      .filter((s) => s.isActive)
                      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                      .map((s) => {
                        const b = balances?.[s.id!] ?? zeroBalance;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.firstName} {s.lastName}</TableCell>
                            <TableCell>{b.cl.used} / {b.cl.total}</TableCell>
                            <TableCell>{b.ml.used} / {b.ml.total}</TableCell>
                            <TableCell>{b.el.used} / {b.el.total}</TableCell>
                            <TableCell>
                              <b>{b.fl.available}</b>
                              <span className="text-xs text-slate-500"> (earned {b.fl.earned}, used {b.fl.used})</span>
                            </TableCell>
                            <TableCell>{b.hd}</TableCell>
                            <TableCell>{b.lop}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </details>
      </Card>

      {/* Search + Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Row 1: Search + filter toggle + Clear */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search staff name or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Button
              variant={filtersOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltersOpen((o) => !o)}
              className="relative shrink-0"
            >
              <Filter className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-indigo-600 sm:static sm:ml-1 sm:h-1.5 sm:w-1.5" />
              )}
              {filtersOpen ? <ChevronUp className="hidden h-4 w-4 sm:ml-1 sm:inline" /> : <ChevronDown className="hidden h-4 w-4 sm:ml-1 sm:inline" />}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="shrink-0 text-slate-500 hover:text-slate-700">
                <FilterX className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Clear Filters</span>
              </Button>
            )}
          </div>

          {filtersOpen && (
            <>
              {/* Row 2: Filter dropdowns — 3-up on phones so 6 filters fit in 2 rows, not 3 */}
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-6 sm:gap-3">
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
                    ...Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
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
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Date Range</span>
                <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:gap-3">
                  <DatePicker
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    placeholder="From date"
                    className="h-10 w-full sm:w-[160px]"
                  />
                  <DatePicker
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    placeholder="To date"
                    className="h-10 w-full sm:w-[160px]"
                  />
                </div>
              </div>
            </>
          )}
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
              const start = req.startDate?.seconds ? formatDate(new Date(req.startDate.seconds * 1000)) : "—";
              const end = req.endDate?.seconds && req.endDate.seconds !== req.startDate?.seconds
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
                    <CardContent className="px-4 py-2.5">
                      {/* Single compact row — step chips only shown once a step is decided, so
                          "pending / pending / PENDING" collapses to one PENDING badge */}
                      <div className="flex items-center gap-3">
                        {req.status === "pending" && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(req.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(req.id);
                            }}
                            className="h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
                          />
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                          <p className="font-medium text-slate-900 truncate">{req.staffName || getStaffName(req.staffId)}</p>
                          <Badge variant="outline" className="text-xs">{deptName}</Badge>
                          <Badge>{REQUEST_TYPE_LABELS[req.type]}</Badge>
                          {req.leaveType && <Badge variant="bg-slate-100 text-slate-700">{LEAVE_TYPE_CODES[req.leaveType] ?? req.leaveType}</Badge>}
                          {req.isHalfDay && <Badge variant="bg-amber-100 text-amber-700">½ {req.session === "first-half" ? "AM" : "PM"}</Badge>}
                          <span className="text-xs text-slate-600">{end ? `${start} – ${end}` : start}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isLegacy && req.deptHead?.status && req.deptHead.status !== "pending" && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.deptHead.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              DH {req.deptHead.status}
                            </span>
                          )}
                          {!isLegacy && req.admin?.status && req.admin.status !== "pending" && req.admin.status !== req.status && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.admin.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              Admin {req.admin.status}
                            </span>
                          )}
                          <Badge variant={getStatusColor(req.status)}>{req.status}</Badge>
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
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-2.5">
                      {/* Approval steps — one inline line, details only where decided */}
                      {!isLegacy && (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                          <span className="font-medium text-slate-700 uppercase">Approval</span>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${req.deptHead?.status === "approved" ? "bg-green-500" : req.deptHead?.status === "rejected" ? "bg-red-500" : "bg-slate-300"}`} />
                            <span className="font-medium text-slate-700">Dept Head:</span>
                            {req.deptHead?.status === "pending" && (
                              <span className="text-slate-500">{req.adminOverride ? `covered by admin (${req.admin?.byName || "admin"})` : "pending"}</span>
                            )}
                            {req.deptHead?.status === "approved" && (
                              <span className="text-emerald-600">approved · {req.deptHead.byName} · {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}</span>
                            )}
                            {req.deptHead?.status === "rejected" && (
                              <span className="text-red-600">rejected · {req.deptHead.byName} · {req.deptHead.at ? formatDate(new Date(req.deptHead.at.seconds * 1000)) : "—"}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${req.admin?.status === "approved" ? "bg-green-500" : req.admin?.status === "rejected" ? "bg-red-500" : "bg-slate-300"}`} />
                            <span className="font-medium text-slate-700">Admin{req.adminOverride ? " (override)" : ""}:</span>
                            {req.admin?.status === "pending" && <span className="text-slate-500">pending</span>}
                            {req.admin?.status === "approved" && (
                              <span className="text-emerald-600">approved · {req.admin.byName} · {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}</span>
                            )}
                            {req.admin?.status === "rejected" && (
                              <span className="text-red-600">rejected · {req.admin.byName} · {req.admin.at ? formatDate(new Date(req.admin.at.seconds * 1000)) : "—"}</span>
                            )}
                          </span>
                          {req.deptHead?.status === "rejected" && req.deptHead.remarks && (
                            <span className="w-full text-red-600">DH remarks: {req.deptHead.remarks}</span>
                          )}
                          {req.admin?.status === "rejected" && req.admin.remarks && (
                            <span className="w-full text-red-600">Admin remarks: {req.admin.remarks}</span>
                          )}
                        </div>
                      )}

                      {/* Details */}
                      <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200 pt-2">
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
                        <div className="border-t border-slate-200 pt-2 space-y-1.5">
                          {canActDeptHead && (
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-medium text-slate-700">Dept Head Action</p>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setRemarksRequestId(req.id);
                                  setRemarksStep("deptHead");
                                  setRemarksDecision("approved");
                                  setRemarksText("");
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-4"
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
                                className="bg-red-600 hover:bg-red-700 text-white px-4"
                              >
                                Reject
                              </Button>
                            </div>
                          )}

                          {canActAdmin && (
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-medium text-slate-700">Admin Action</p>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setRemarksRequestId(req.id);
                                  setRemarksStep("admin");
                                  setRemarksDecision("approved");
                                  setRemarksText("");
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-4"
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
                                className="bg-red-600 hover:bg-red-700 text-white px-4"
                              >
                                Reject
                              </Button>
                            </div>
                          )}

                          {canActLegacy && (
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-medium text-slate-700">Admin Action (Legacy)</p>
                              <Button
                                size="sm"
                                onClick={() => handleAction(req.id, "admin", "approved")}
                                className="bg-green-600 hover:bg-green-700 text-white px-4"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleAction(req.id, "admin", "rejected")}
                                className="bg-red-600 hover:bg-red-700 text-white px-4"
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      <div className="border-t border-slate-200 pt-2">
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
