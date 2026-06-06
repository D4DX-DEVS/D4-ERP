"use client";

import { useEffect, useMemo, useState } from "react";
import { getDocuments, where, orderBy, Timestamp } from "@/lib/firestore";
import { Attendance, AttendanceStatus, Department, Staff } from "@/types";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/asset-export-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Download, FileSpreadsheet, FileText, Search, X } from "lucide-react";

type Rec = Attendance & { id: string };
type ReportType = "employee" | "daily" | "department";

const REPORT_OPTIONS = [
  { value: "employee", label: "Monthly — Per Employee" },
  { value: "daily", label: "Daily Summary" },
  { value: "department", label: "Department Summary" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "half-day", label: "Half Day" },
  { value: "leave", label: "Leave" },
  { value: "wfh", label: "Work From Home" },
  { value: "on-duty", label: "On Duty" },
  { value: "absent", label: "Absent" },
];

const isPresentLike = (s?: string) => s === "present" || s === "late" || s === "wfh" || s === "on-duty";

export default function AttendanceReportsPage() {
  const { user, authorized, isLoading } = useRoleGuard(["admin", "department-head", "accounts"]);

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [reportType, setReportType] = useState<ReportType>("employee");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus>("all");
  const [search, setSearch] = useState("");

  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, monthNum] = useMemo(() => month.split("-").map(Number), [month]);
  const monthStart = useMemo(() => new Date(year, monthNum - 1, 1, 0, 0, 0, 0), [year, monthNum]);
  const monthEnd = useMemo(() => new Date(year, monthNum, 0, 23, 59, 59, 999), [year, monthNum]);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    (async () => {
      try {
        const [staff, depts] = await Promise.all([
          getDocuments<Staff>("staff", [orderBy("firstName", "asc")]),
          getDocuments<Department>("departments", []),
        ]);
        if (!active) return;
        setStaffList(staff);
        setDepartments(depts);
      } catch (error) {
        console.error("Error:", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const att = await getDocuments<Attendance>("attendance", [
          where("date", ">=", Timestamp.fromDate(monthStart)),
          where("date", "<=", Timestamp.fromDate(monthEnd)),
          orderBy("date", "asc"),
        ]);
        if (!active) return;
        setRecords((att as Rec[]).filter((r) => !r.isDeleted));
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authorized, monthStart, monthEnd]);

  const isDeptHead = user?.role === "department-head";

  const staffMap = useMemo(() => {
    const m = new Map<string, Staff & { id: string }>();
    for (const s of staffList) m.set(s.id, s);
    return m;
  }, [staffList]);

  const deptMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  // Staff visible to the current report (department + search scoping).
  const scopedStaff = useMemo(() => {
    let list = staffList;
    if (isDeptHead && user?.departmentId) list = list.filter((s) => s.departmentId === user.departmentId);
    else if (departmentFilter) list = list.filter((s) => s.departmentId === departmentFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          (s.employeeCode || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [staffList, isDeptHead, user?.departmentId, departmentFilter, search]);

  const scopedStaffIds = useMemo(() => new Set(scopedStaff.map((s) => s.id)), [scopedStaff]);
  const scopedRecords = useMemo(() => {
    let list = records.filter((r) => scopedStaffIds.has(r.staffId));
    if (statusFilter !== "all") {
      list = statusFilter === "late" ? list.filter((r) => r.isLate) : list.filter((r) => r.status === statusFilter);
    }
    return list;
  }, [records, scopedStaffIds, statusFilter]);

  const employeeRows = useMemo(() => {
    return scopedStaff.map((s) => {
      const recs = scopedRecords.filter((r) => r.staffId === s.id);
      const row = {
        Employee: `${s.firstName} ${s.lastName}`,
        Code: s.employeeCode || "",
        Department: deptMap.get(s.departmentId) || "—",
        Present: recs.filter((r) => isPresentLike(r.status)).length,
        Late: recs.filter((r) => r.isLate).length,
        "Half Day": recs.filter((r) => r.status === "half-day").length,
        Leave: recs.filter((r) => r.status === "leave").length,
        WFH: recs.filter((r) => r.status === "wfh").length,
        "On Duty": recs.filter((r) => r.status === "on-duty").length,
        Absent: recs.filter((r) => r.status === "absent").length,
        "Total Hrs": Math.round(recs.reduce((sum, r) => sum + (r.workingHours || 0), 0) * 10) / 10,
        "OT Hrs": Math.round(recs.reduce((sum, r) => sum + (r.overtimeHours || 0), 0) * 10) / 10,
      };
      return row;
    });
  }, [scopedStaff, scopedRecords, deptMap]);

  const dailyRows = useMemo(() => {
    const byDay = new Map<string, Rec[]>();
    for (const r of scopedRecords) {
      const sec = (r.date as { seconds?: number } | undefined)?.seconds ?? 0;
      const key = new Date(sec * 1000).toISOString().split("T")[0];
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, recs]) => ({
        Date: day,
        Present: recs.filter((r) => isPresentLike(r.status)).length,
        Late: recs.filter((r) => r.isLate).length,
        "Half Day": recs.filter((r) => r.status === "half-day").length,
        Leave: recs.filter((r) => r.status === "leave").length,
        WFH: recs.filter((r) => r.status === "wfh").length,
        "On Duty": recs.filter((r) => r.status === "on-duty").length,
        Absent: recs.filter((r) => r.status === "absent").length,
        "OT Hrs": Math.round(recs.reduce((sum, r) => sum + (r.overtimeHours || 0), 0) * 10) / 10,
      }));
  }, [scopedRecords]);

  const departmentRows = useMemo(() => {
    const byDept = new Map<string, { staff: Set<string>; recs: Rec[] }>();
    for (const s of scopedStaff) {
      if (!byDept.has(s.departmentId)) byDept.set(s.departmentId, { staff: new Set(), recs: [] });
      byDept.get(s.departmentId)!.staff.add(s.id);
    }
    for (const r of scopedRecords) {
      const s = staffMap.get(r.staffId);
      if (!s) continue;
      byDept.get(s.departmentId)?.recs.push(r);
    }
    return Array.from(byDept.entries())
      .map(([deptId, { staff, recs }]) => ({
        Department: deptMap.get(deptId) || "—",
        Headcount: staff.size,
        "Present Days": recs.filter((r) => isPresentLike(r.status)).length,
        "Leave Days": recs.filter((r) => r.status === "leave").length,
        "Absent Days": recs.filter((r) => r.status === "absent").length,
        "Late Count": recs.filter((r) => r.isLate).length,
        "OT Hrs": Math.round(recs.reduce((sum, r) => sum + (r.overtimeHours || 0), 0) * 10) / 10,
      }))
      .sort((a, b) => a.Department.localeCompare(b.Department));
  }, [scopedStaff, scopedRecords, staffMap, deptMap]);

  const activeRows = reportType === "employee" ? employeeRows : reportType === "daily" ? dailyRows : departmentRows;
  const columns = activeRows.length ? Object.keys(activeRows[0]) : [];
  const reportLabel = REPORT_OPTIONS.find((r) => r.value === reportType)?.label ?? "Attendance Report";
  const fileBase = `attendance-${reportType}-${month}`;

  const reportTypeLabel = REPORT_OPTIONS.find((r) => r.value === reportType)?.label ?? "";
  const departmentLabel = departmentFilter ? deptMap.get(departmentFilter) ?? "Department" : "All departments";
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label ?? "All statuses";
  const hasActiveFilters = !!search || statusFilter !== "all" || (!isDeptHead && !!departmentFilter);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("");
  };

  if (isLoading || !authorized) return <PageLoader />;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Attendance Reports"
        description="Summaries by employee, day, or department with export."
      />

      <div className="space-y-3 rounded-[20px] border border-slate-100 bg-white/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Month</label>
            <DatePicker mode="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[180px]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Report</label>
            <div className="w-[230px]">
              <SelectRoot value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger>
                  <SelectValue>{reportTypeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {REPORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          {!isDeptHead ? (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Department</label>
              <div className="w-[200px]">
                <SelectRoot value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger>
                    <SelectValue>{departmentLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Status</label>
            <div className="w-[180px]">
              <SelectRoot value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | AttendanceStatus)}>
                <SelectTrigger>
                  <SelectValue>{statusLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportToCSV(activeRows, fileBase)} disabled={!activeRows.length}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(activeRows, fileBase)} disabled={!activeRows.length}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToPDF(activeRows, reportLabel, fileBase)} disabled={!activeRows.length}>
              <FileText className="h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search employee or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(year, monthNum - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </span>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <ListingPanel title={reportLabel} description={`${activeRows.length} rows for ${month}.`} contentClassName="p-0">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c} className={c === "Employee" || c === "Date" || c === "Department" ? "" : "text-center"}>
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={Math.max(1, columns.length)} className="py-10 text-center text-sm text-slate-500">
                      No attendance data for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {columns.map((c) => (
                        <TableCell
                          key={c}
                          className={c === "Employee" || c === "Date" || c === "Department" ? "font-medium text-slate-950" : "text-center"}
                        >
                          {String((row as Record<string, string | number>)[c] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </ListingPanel>
    </div>
  );
}
