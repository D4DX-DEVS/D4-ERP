"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createDocument, getDocuments, orderBy, where, Timestamp, updateDocument } from "@/lib/firestore";
import { Attendance, AttendanceStatus, Department, Staff } from "@/types";
import { getAppSettings, weeklyOffDayNames, Holiday } from "@/lib/settings";
import { ATTENDANCE_STATUS_CONFIG, attendanceStatusMeta, normalizeAttendanceStatus, type ActiveAttendanceStatus } from "@/lib/attendance-status";
import { pickAttendanceRecord } from "@/lib/attendance-dedupe";
import { resolveDayCell } from "@/lib/attendance-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { exportToCSV } from "@/lib/asset-export-utils";
import { exportAttendanceSheetPDF, groupStaffForSheet, type SheetStaffEntry } from "@/lib/attendance-sheet";
import {
  Users,
  UserCheck,
  CalendarOff,
  TimerReset,
  Download,
  Eye,
  Edit2,
  Search,
  LogIn,
  LogOut,
  ListChecks,
  Rows3,
  Grid3x3,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const LOG_PAGE_SIZE = 10;

// ── View + status configuration ──────────────────────────────────────────────

type ViewMode = "logs" | "daily" | "grid";

const VIEWS: { id: ViewMode; label: string; icon: typeof Rows3 }[] = [
  { id: "logs", label: "Log Stream", icon: ListChecks },
  { id: "daily", label: "Daily Register", icon: Rows3 },
  { id: "grid", label: "Monthly Grid", icon: Grid3x3 },
];

const STATUS_CONFIG = ATTENDANCE_STATUS_CONFIG;


const PRESENT_STATUSES: AttendanceStatus[] = ["present", "late", "half-day", "wfh", "on-duty"];

// ── Helpers ───────────────────────────────────────────────────────────────────

type Rec = Attendance & { id: string };

const secOf = (ts: unknown): number | undefined =>
  ts && typeof ts === "object" && "seconds" in (ts as Record<string, unknown>)
    ? (ts as { seconds: number }).seconds
    : undefined;

const timeStr = (ts: unknown): string => {
  const s = secOf(ts);
  return s ? new Date(s * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
};

// Local-date key (YYYY-MM-DD). Never toISOString here: that shifts IST
// records stored at local midnight onto the previous UTC day.
const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dateKeyFromSec = (s: number): string => localDateKey(new Date(s * 1000));

const fullName = (s?: Staff) => (s ? `${s.firstName} ${s.lastName}` : "Unknown");

export default function AttendanceRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  // The monthly grid is the register the org actually works from — it mirrors
  // the printed attendance sheet — so it opens first, not the raw log stream.
  const [view, setView] = useState<ViewMode>("grid");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ActiveAttendanceStatus>("all");

  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<string[]>(["Sunday"]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  // record === null → creating a new entry for that staff/day (grid cell with no log)
  const [editTarget, setEditTarget] = useState<{ record: Rec | null; staffId: string; staffName: string; date: Date } | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("present");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [saving, setSaving] = useState(false);
  // Expanded per-staff month view (tap a name in the grid — primary mobile affordance)
  const [staffDetail, setStaffDetail] = useState<(Staff & { id: string }) | null>(null);

  // Load staff + attendance settings once
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [staff, settings, depts] = await Promise.all([
          // Removed staff come along so their past months still read back with a
          // name; rowsForGrid drops them unless they have records in the month.
          getDocuments<Staff>("staff", [orderBy("firstName", "asc")], { includeDeleted: true }),
          getAppSettings(),
          getDocuments<Department>("departments"),
        ]);
        if (!active) return;
        setStaffList(staff);
        setDepartments(depts);
        setWeeklyOff(weeklyOffDayNames(settings));
        setHolidays(settings.holidays);
      } catch (error) {
        console.error("Error:", error);
        if (active) toast("error", "Failed to load staff list");
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  // Month boundaries
  const [year, monthNum] = useMemo(() => month.split("-").map(Number), [month]);
  const monthStart = useMemo(() => new Date(year, monthNum - 1, 1, 0, 0, 0, 0), [year, monthNum]);
  const monthEnd = useMemo(() => new Date(year, monthNum, 0, 23, 59, 59, 999), [year, monthNum]);
  const daysInMonth = useMemo(() => new Date(year, monthNum, 0).getDate(), [year, monthNum]);

  function beginEdit(record: Rec | null, staffId: string, date: Date) {
    const s = staffList.find((x) => x.id === staffId);
    setEditTarget({ record, staffId, staffName: fullName(s), date });
    setEditStatus(record ? normalizeAttendanceStatus(record.status) : "present");
    // <input type="time"> needs 24h HH:mm — locale strings like "02:58pm" get rejected,
    // leaving the field blank and silently wiping punches on save.
    const hhmm = (sec?: number) => {
      if (!sec) return "";
      const d = new Date(sec * 1000);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    setEditCheckIn(hhmm(secOf(record?.checkIn)));
    setEditCheckOut(hhmm(secOf(record?.checkOut)));
  }

  function openEditDialog(record: Rec) {
    const sec = secOf(record.date);
    beginEdit(record, record.staffId, sec ? new Date(sec * 1000) : new Date());
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    setSaving(true);
    try {
      const dateObj = new Date(editTarget.date);
      dateObj.setHours(0, 0, 0, 0);

      const inTime = editCheckIn
        ? (() => {
            const [h, m] = editCheckIn.split(":").map(Number);
            const d = new Date(dateObj);
            d.setHours(h, m, 0);
            return Timestamp.fromDate(d);
          })()
        : undefined;
      const outTime = editCheckOut
        ? (() => {
            const [h, m] = editCheckOut.split(":").map(Number);
            const d = new Date(dateObj);
            d.setHours(h, m, 0);
            return Timestamp.fromDate(d);
          })()
        : undefined;

      if (editTarget.record) {
        await updateDocument("attendance", editTarget.record.id, {
          status: editStatus,
          checkIn: inTime,
          checkOut: outTime,
          source: "manual",
          updatedAt: new Date(),
        });
        const targetId = editTarget.record.id;
        setRecords((prev) =>
          prev.map((r) =>
            r.id === targetId
              ? { ...r, status: editStatus, checkIn: inTime || undefined, checkOut: outTime || undefined, source: "manual" as const }
              : r
          )
        );
      } else {
        const newDoc = {
          staffId: editTarget.staffId,
          date: Timestamp.fromDate(dateObj),
          status: editStatus,
          checkIn: inTime,
          checkOut: outTime,
          source: "manual" as const,
          isDeleted: false,
        };
        const id = await createDocument("attendance", newDoc);
        setRecords((prev) => [...prev, { ...newDoc, id } as Rec]);
      }

      toast("success", "Attendance updated");
      setEditTarget(null);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update attendance");
    } finally {
      setSaving(false);
    }
  }

  // Load attendance for the selected month
  useEffect(() => {
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
        setRecords(att.filter((r) => !r.isDeleted));
      } catch (error) {
        console.error("Error:", error);
        if (active) toast("error", "Failed to load attendance data");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [monthStart, monthEnd, toast]);

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff & { id: string }>();
    staffList.forEach((s) => map.set(s.id, s));
    return map;
  }, [staffList]);

  // Rows for the month: the live roster, plus removed staff who actually have
  // records in this month — their history stays visible where it happened
  // instead of vanishing with the staff record.
  const rosterStaff = useMemo(() => {
    const withRecords = new Set(records.map((r) => r.staffId));
    return staffList.filter((s) => !s.isDeleted || withRecords.has(s.id));
  }, [staffList, records]);

  // Staff filtered by the search box
  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rosterStaff;
    return rosterStaff.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.employeeCode ?? ""} ${s.designation ?? ""}`.toLowerCase().includes(q)
    );
  }, [rosterStaff, query]);

  const filteredStaffIds = useMemo(() => new Set(filteredStaff.map((s) => s.id)), [filteredStaff]);

  // Records matching the current search + status filter
  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      if (!filteredStaffIds.has(r.staffId)) return false;
      if (statusFilter !== "all" && normalizeAttendanceStatus(r.status) !== statusFilter) return false;
      return true;
    });
  }, [records, filteredStaffIds, statusFilter]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const presentDays = records.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
    const leaveDays = records.filter((r) => r.status === "leave").length;
    const lateMarks = records.filter((r) => r.isLate).length;
    // Headcount is the live roster — removed staff are history, not employees.
    const staffCount = staffList.filter((s) => !s.isDeleted).length;
    return { staff: staffCount, presentDays, leaveDays, lateMarks };
  }, [records, staffList]);

  // ── Log stream events (every check-in / check-out) ───────────────────────────
  const logEvents = useMemo(() => {
    const events: {
      key: string;
      sec: number;
      staffId: string;
      action: "Check In" | "Check Out";
      status: AttendanceStatus;
      location?: { lat: number; lng: number };
      isLate: boolean;
      isEarly: boolean;
    }[] = [];
    for (const r of visibleRecords) {
      const inSec = secOf(r.checkIn);
      const outSec = secOf(r.checkOut);
      if (inSec) {
        events.push({
          key: `${r.id}-in`,
          sec: inSec,
          staffId: r.staffId,
          action: "Check In",
          status: r.status,
          location: r.checkInLocation,
          isLate: r.isLate,
          isEarly: false,
        });
      }
      if (outSec) {
        events.push({
          key: `${r.id}-out`,
          sec: outSec,
          staffId: r.staffId,
          action: "Check Out",
          status: r.status,
          location: r.checkOutLocation,
          isLate: false,
          isEarly: r.isEarlyDeparture,
        });
      }
    }
    return events.sort((a, b) => b.sec - a.sec);
  }, [visibleRecords]);

  // ponytail: month's records are already in memory (stats + grid need them all),
  // so page the log stream by slicing. Swap for cursor queries if a month ever
  // grows past a few thousand punches.
  // Page is stored with the filter signature it belongs to, so changing month /
  // search / status resets to page 1 without a setState-in-effect round trip.
  const logFilterSig = `${month}|${query}|${statusFilter}`;
  const [logPageState, setLogPageState] = useState({ sig: logFilterSig, page: 0 });
  const logTotalPages = Math.ceil(logEvents.length / LOG_PAGE_SIZE);
  // Clamp: an edit that drops punches can shrink the list under the current page.
  const logPage = Math.min(
    logPageState.sig === logFilterSig ? logPageState.page : 0,
    Math.max(0, logTotalPages - 1)
  );
  const setLogPage = (page: number) => setLogPageState({ sig: logFilterSig, page });
  const pagedLogEvents = useMemo(
    () => logEvents.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE),
    [logEvents, logPage]
  );

  // ── Daily register rows (one per record, newest first) ───────────────────────
  const dailyRows = useMemo(() => {
    return [...visibleRecords].sort((a, b) => (secOf(b.date) ?? 0) - (secOf(a.date) ?? 0));
  }, [visibleRecords]);

  // ── Monthly grid lookup ──────────────────────────────────────────────────────
  const gridLookup = useMemo(() => {
    const map = new Map<string, Rec>();
    for (const r of records) {
      const s = secOf(r.date);
      if (!s) continue;
      const k = `${r.staffId}_${dateKeyFromSec(s)}`;
      const prev = map.get(k);
      // Duplicate rows for one day: correction > manual > import, then newest write
      map.set(k, prev ? pickAttendanceRecord(prev, r) : r);
    }
    return map;
  }, [records]);

  const todayKey = localDateKey(new Date());

  const dayMeta = useMemo(() => {
    const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, monthNum - 1, i + 1);
      const dayName = d.toLocaleDateString("en-IN", { weekday: "long" });
      const key = `${year}-${String(monthNum).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return {
        day: i + 1,
        key,
        short: d.toLocaleDateString("en-IN", { weekday: "short" }),
        isOff: weeklyOff.includes(dayName),
        holidayName: holidayMap.get(key) ?? null,
        isFuture: key > todayKey,
      };
    });
  }, [daysInMonth, year, monthNum, weeklyOff, holidays, todayKey]);

  function cellFor(staff: Staff & { id: string }, meta: (typeof dayMeta)[number]) {
    const joinSec = secOf(staff.dateOfJoining);
    const removedSec = secOf(staff.deletedAt);
    // Shared with the staff portal and the profile widget — a day with no record
    // reads blank, never "Absent". See lib/attendance-grid.ts.
    return resolveDayCell(gridLookup.get(`${staff.id}_${meta.key}`) ?? null, meta, {
      joinedKey: joinSec ? dateKeyFromSec(joinSec) : null,
      removedKey: removedSec ? dateKeyFromSec(removedSec) : null,
    });
  }

  const deptNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  // ── Export ────────────────────────────────────────────────────────────────────
  async function handleExport() {
    const monthText = monthStart.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    if (view === "logs") {
      const rows = logEvents.map((e) => ({
        Date: dateKeyFromSec(e.sec),
        Time: new Date(e.sec * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        Staff: fullName(staffMap.get(e.staffId)),
        Action: e.action,
        Status: attendanceStatusMeta(e.status).label,
        Flag: e.isLate ? "Late" : e.isEarly ? "Early" : "",
        Location: e.location ? `${e.location.lat}, ${e.location.lng}` : "",
      }));
      exportToCSV(rows, `attendance-logs-${month}`);
    } else if (view === "daily") {
      const rows = dailyRows.map((r) => ({
        Date: dateKeyFromSec(secOf(r.date) ?? 0),
        Staff: fullName(staffMap.get(r.staffId)),
        Status: attendanceStatusMeta(r.status).label,
        "Check In": timeStr(r.checkIn),
        "Check Out": timeStr(r.checkOut),
        Hours: r.workingHours ? r.workingHours.toFixed(1) : "",
        Overtime: r.overtimeHours ? r.overtimeHours.toFixed(1) : "",
        Late: r.isLate ? "Yes" : "",
        Early: r.isEarlyDeparture ? "Yes" : "",
      }));
      exportToCSV(rows, `attendance-daily-${month}`);
    } else {
      // Monthly grid exports as the org's printed D4 attendance sheet (PDF)
      const entries: SheetStaffEntry[] = filteredStaff.map((s) => ({
        name: fullName(s),
        empCode: s.employeeCode ?? "",
        dept: deptNameById.get(s.departmentId) ?? s.designation ?? "",
        employmentType: s.employmentType,
        cells: dayMeta.map((meta) => {
          const c = cellFor(s, meta);
          return c ? { code: c.code, cell: c.cell } : null;
        }),
      }));
      await exportAttendanceSheetPDF({
        monthLabel: monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
        days: dayMeta.map((m) => ({
          day: m.day,
          weekday: m.short.toUpperCase(),
          isOff: m.isOff,
          isHoliday: !!m.holidayName,
        })),
        sections: groupStaffForSheet(entries),
        legend: Object.values(STATUS_CONFIG).map((c) => ({ code: c.code, label: c.label })),
        filename: `D4-attendance-sheet-${month}`,
      });
    }
    toast("success", `Exported ${monthText} ${view} register`);
  }

  if (loading) return <PageLoader />;

  const monthLabel = monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Attendance Register"
        description={`Every check-in and check-out log for ${monthLabel}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              mode="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto min-w-[160px]"
            />
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        }
      />

      <StatGrid cols={4} mobileCols={4}>
        <StatCard
          title="Total Staff"
          value={stats.staff}
          icon={Users}
          color="text-sky-600"
          bg="bg-sky-50"
        />
        <StatCard
          title="Present Days"
          value={stats.presentDays}
          icon={UserCheck}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          title="Leave Days"
          value={stats.leaveDays}
          icon={CalendarOff}
          color="text-sky-600"
          bg="bg-sky-50"
        />
        <StatCard
          title="Late Marks"
          value={stats.lateMarks}
          icon={TimerReset}
          color="text-amber-600"
          bg="bg-amber-50"
        />
      </StatGrid>

      {/* View switcher + filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full rounded-full border border-slate-200/90 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:w-fit">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-xs font-semibold transition-all sm:flex-none sm:gap-2 sm:px-4 sm:text-sm " +
                  (active
                    ? "bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 text-white shadow-[0_10px_24px_rgba(55,48,163,0.24)]"
                    : "text-slate-600 hover:text-slate-950")
                }
              >
                <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:flex-none sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search staff…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 sm:w-auto"
            />
          </div>
          {view !== "grid" ? (
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ActiveAttendanceStatus)}
              className="w-auto shrink-0 sm:min-w-[170px]"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({ value: key, label: cfg.label })),
              ]}
            />
          ) : null}
        </div>
      </div>

      {/* ── Log stream ── */}
      {view === "logs" ? (
        <ListingPanel
          title={`Log Stream (${logEvents.length})`}
          description="Every check-in and check-out punch, newest first."
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Flag</TableHead>
                <TableHead className="hidden sm:table-cell">Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No punch logs for this period.
                  </TableCell>
                </TableRow>
              ) : (
                pagedLogEvents.map((e) => {
                  const cfg = attendanceStatusMeta(e.status);
                  return (
                    <TableRow key={e.key}>
                      <TableCell className="font-medium text-slate-950">
                        {new Date(e.sec * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(e.sec * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-950">{fullName(staffMap.get(e.staffId))}</TableCell>
                      <TableCell>
                        <span
                          className={
                            "inline-flex items-center gap-1.5 text-sm font-medium " +
                            (e.action === "Check In" ? "text-emerald-600" : "text-indigo-600")
                          }
                        >
                          {e.action === "Check In" ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                          {e.action}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg?.badge}>{cfg?.label ?? e.status}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {e.isLate ? (
                          <Badge variant="bg-amber-100 text-amber-700">Late</Badge>
                        ) : e.isEarly ? (
                          <Badge variant="bg-yellow-100 text-yellow-700">Early</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-slate-500 sm:table-cell">
                        {e.location ? `${e.location.lat.toFixed(4)}, ${e.location.lng.toFixed(4)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <Pagination
            page={logPage}
            totalPages={logTotalPages}
            totalCount={logEvents.length}
            pageSize={LOG_PAGE_SIZE}
            hasPrev={logPage > 0}
            hasNext={logPage < logTotalPages - 1}
            onPrev={() => setLogPage(Math.max(0, logPage - 1))}
            onNext={() => setLogPage(Math.min(logTotalPages - 1, logPage + 1))}
          />
        </ListingPanel>
      ) : null}

      {/* ── Daily register ── */}
      {view === "daily" ? (
        <ListingPanel
          title={`Daily Register (${dailyRows.length})`}
          description="One row per staff per day. Click a row to open the daily detail."
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead className="hidden sm:table-cell">Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="hidden sm:table-cell">Overtime</TableHead>
                <TableHead className="hidden sm:table-cell">Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">
                    No attendance records for this period.
                  </TableCell>
                </TableRow>
              ) : (
                dailyRows.map((r) => {
                  const cfg = attendanceStatusMeta(r.status);
                  const dateKey = dateKeyFromSec(secOf(r.date) ?? 0);
                  const detailHref = `/dashboard/attendance/${r.staffId}?date=${dateKey}`;
                  return (
                    <TableRow
                      key={r.id}
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
                      <TableCell className="font-medium text-slate-950">
                        {new Date((secOf(r.date) ?? 0) * 1000).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-slate-950">{fullName(staffMap.get(r.staffId))}</TableCell>
                      <TableCell>
                        <Badge variant={cfg?.badge}>{cfg?.label ?? r.status}</Badge>
                      </TableCell>
                      <TableCell>{timeStr(r.checkIn)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{timeStr(r.checkOut)}</TableCell>
                      <TableCell>{r.workingHours ? `${r.workingHours.toFixed(1)}h` : "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {r.overtimeHours ? (
                          <Badge variant="bg-orange-100 text-orange-700">+{r.overtimeHours.toFixed(1)}h</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1.5">
                          {r.isLate ? <Badge variant="bg-amber-100 text-amber-700">Late</Badge> : null}
                          {r.isEarlyDeparture ? <Badge variant="bg-yellow-100 text-yellow-700">Early</Badge> : null}
                          {!r.isLate && !r.isEarlyDeparture ? <span className="text-xs text-slate-400">None</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(r)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ListingPanel>
      ) : null}

      {/* ── Monthly grid ── */}
      {view === "grid" ? (
        <ListingPanel
          title={`Monthly Grid — ${monthLabel}`}
          description="Staff down the side, days across the top. Tap a name to expand their full month."
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Staff
                  </th>
                  {dayMeta.map((m) => (
                    <th
                      key={m.key}
                      title={m.holidayName ?? undefined}
                      className={
                        "px-1.5 py-2 text-center text-[11px] font-semibold " +
                        (m.holidayName ? "text-rose-500" : m.isOff ? "text-rose-400" : "text-slate-400")
                      }
                    >
                      <div>{m.day}</div>
                      <div className="text-[9px] font-normal">{m.holidayName ? "Holiday" : m.short}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonth + 1} className="py-10 text-center text-sm text-slate-500">
                      No staff match your search.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 sm:px-4">
                        <button
                          type="button"
                          onClick={() => setStaffDetail(s)}
                          title="View full month"
                          className="block min-h-11 w-full text-left"
                        >
                          <div className="max-w-[116px] truncate whitespace-nowrap font-medium text-slate-950 sm:max-w-none">
                            {fullName(s)}
                            {s.isDeleted ? (
                              <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 align-middle text-[10px] font-semibold uppercase text-slate-500">
                                Removed
                              </span>
                            ) : null}
                          </div>
                          <div className="max-w-[116px] truncate text-xs text-slate-400 sm:max-w-none">
                            {s.employeeCode || s.designation}
                          </div>
                        </button>
                      </td>
                      {dayMeta.map((m) => {
                        const c = cellFor(s, m);
                        return (
                          <td key={m.key} className="px-1 py-1 text-center">
                            {c ? (
                              <button
                                type="button"
                                title={`${m.day} — ${c.label} (tap to edit)`}
                                onClick={() =>
                                  beginEdit(
                                    gridLookup.get(`${s.id}_${m.key}`) ?? null,
                                    s.id,
                                    new Date(year, monthNum - 1, m.day)
                                  )
                                }
                                className={
                                  "mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold transition-transform hover:scale-110 " +
                                  c.cell
                                }
                              >
                                {c.code}
                              </button>
                            ) : (
                              <span className="text-slate-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ListingPanel>
      ) : null}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-slate-100 bg-white/70 px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">Legend</span>
        {Object.values(STATUS_CONFIG).map((c) => (
          <span key={c.code} className="inline-flex items-center gap-1.5">
            <span className={"flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold " + c.cell}>
              {c.code}
            </span>
            {c.label}
          </span>
        ))}
      </div>

      {/* Expanded per-staff month view (bottom sheet on mobile, centered on desktop) */}
      {staffDetail &&
        (() => {
          const detailDays = dayMeta.map((m) => ({
            meta: m,
            cell: cellFor(staffDetail, m),
            rec: gridLookup.get(`${staffDetail.id}_${m.key}`),
          }));
          const counts = new Map<string, { label: string; cell: string; n: number }>();
          for (const d of detailDays) {
            if (!d.cell) continue;
            const prev = counts.get(d.cell.code);
            if (prev) prev.n += 1;
            else counts.set(d.cell.code, { label: d.cell.label, cell: d.cell.cell, n: 1 });
          }
          // Portal to <body>: the layout's content wrapper is its own stacking
          // context (relative z-10), so anything inside it paints under the
          // fixed bottom nav (z-50) no matter the z-index.
          return createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-end bg-black/40 sm:items-center"
              onClick={() => setStaffDetail(null)}
            >
              <div
                className="flex max-h-[88vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-slate-950">{fullName(staffDetail)}</h3>
                    <p className="truncate text-sm text-slate-500">
                      {[staffDetail.employeeCode || staffDetail.designation, monthLabel].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setStaffDetail(null)}
                    className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {counts.size > 0 ? (
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
                    {Array.from(counts.entries()).map(([code, c]) => (
                      <span
                        key={code}
                        title={c.label}
                        className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " + c.cell}
                      >
                        {code}
                        <span className="font-normal">× {c.n}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  {detailDays.map(({ meta: m, cell: c, rec }) => (
                    <button
                      key={m.key}
                      type="button"
                      disabled={!c}
                      title={c ? "Tap to edit" : undefined}
                      onClick={() => beginEdit(rec ?? null, staffDetail.id, new Date(year, monthNum - 1, m.day))}
                      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 disabled:opacity-40"
                    >
                      <div className="w-8 shrink-0 text-center">
                        <div className="text-sm font-semibold text-slate-950">{m.day}</div>
                        <div className={"text-[10px] " + (m.holidayName || m.isOff ? "text-rose-400" : "text-slate-400")}>
                          {m.short}
                        </div>
                      </div>
                      <span
                        className={
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold " +
                          (c ? c.cell : "bg-slate-50 text-slate-300")
                        }
                      >
                        {c ? c.code : "·"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-700">
                          {c ? c.label : m.isFuture ? "Upcoming" : "Before joining"}
                        </div>
                        {rec && (secOf(rec.checkIn) || secOf(rec.checkOut)) ? (
                          <div className="truncate text-xs text-slate-400">
                            {timeStr(rec.checkIn)} – {timeStr(rec.checkOut)}
                            {rec.workingHours ? ` · ${rec.workingHours.toFixed(1)}h` : ""}
                            {rec.isLate ? " · Late" : rec.isEarlyDeparture ? " · Early out" : ""}
                          </div>
                        ) : null}
                      </div>
                      {c ? <Edit2 className="h-3.5 w-3.5 shrink-0 text-slate-300" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

      {editTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end bg-black/40 sm:items-center"
            onClick={() => setEditTarget(null)}
          >
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:mx-auto sm:max-w-md sm:rounded-2xl sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">
                {editTarget.record ? "Edit Attendance" : "Add Attendance"}
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setEditTarget(null)}
                className="-mr-2 -mt-2 shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 mt-0.5 text-sm text-slate-500">
              {editTarget.staffName} —{" "}
              {editTarget.date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Status</label>
                <Select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                  options={Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({ value: key, label: cfg.label }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Check In (optional)</label>
                <Input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Check Out (optional)</label>
                <Input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => setEditTarget(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}
