"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createDocument, getDocuments, orderBy, where, Timestamp, updateDocument } from "@/lib/firestore";
import { Attendance, AttendanceStatus, Staff } from "@/types";
import { getAppSettings, weeklyOffDayNames, Holiday } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { exportToCSV } from "@/lib/asset-export-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ── View + status configuration ──────────────────────────────────────────────

type ViewMode = "logs" | "daily" | "grid";

const VIEWS: { id: ViewMode; label: string; icon: typeof Rows3 }[] = [
  { id: "logs", label: "Log Stream", icon: ListChecks },
  { id: "daily", label: "Daily Register", icon: Rows3 },
  { id: "grid", label: "Monthly Grid", icon: Grid3x3 },
];

const STATUS_CONFIG: Record<AttendanceStatus, { code: string; label: string; cell: string; badge: string }> = {
  present: { code: "P", label: "Present", cell: "bg-emerald-100 text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  absent: { code: "A", label: "Absent", cell: "bg-rose-100 text-rose-700", badge: "bg-rose-100 text-rose-700" },
  "half-day": { code: "H", label: "Half Day", cell: "bg-amber-100 text-amber-700", badge: "bg-amber-100 text-amber-700" },
  late: { code: "L", label: "Late", cell: "bg-yellow-100 text-yellow-700", badge: "bg-yellow-100 text-yellow-700" },
  leave: { code: "LV", label: "Leave", cell: "bg-sky-100 text-sky-700", badge: "bg-sky-100 text-sky-700" },
  wfh: { code: "W", label: "WFH", cell: "bg-indigo-100 text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  "on-duty": { code: "OD", label: "On Duty", cell: "bg-violet-100 text-violet-700", badge: "bg-violet-100 text-violet-700" },
  "public-holiday": { code: "PH", label: "Public Holiday", cell: "bg-purple-100 text-purple-700", badge: "bg-purple-100 text-purple-700" },
};

const OFF_CELL = "bg-slate-100 text-slate-400";
const HOLIDAY_CELL = "bg-rose-100 text-rose-500";

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

const dateKeyFromSec = (s: number): string => new Date(s * 1000).toISOString().split("T")[0];

const fullName = (s?: Staff) => (s ? `${s.firstName} ${s.lastName}` : "Unknown");

export default function AttendanceRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [view, setView] = useState<ViewMode>("logs");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AttendanceStatus>("all");

  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
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

  // Load staff + attendance settings once
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [staff, settings] = await Promise.all([
          getDocuments<Staff>("staff", [orderBy("firstName", "asc")]),
          getAppSettings(),
        ]);
        if (!active) return;
        setStaffList(staff);
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
    setEditStatus(record?.status ?? "present");
    const inSec = secOf(record?.checkIn);
    const outSec = secOf(record?.checkOut);
    setEditCheckIn(inSec ? new Date(inSec * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }).replace(/\s/g, "") : "");
    setEditCheckOut(outSec ? new Date(outSec * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }).replace(/\s/g, "") : "");
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

  // Staff filtered by the search box
  const filteredStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.employeeCode ?? ""} ${s.designation ?? ""}`.toLowerCase().includes(q)
    );
  }, [staffList, query]);

  const filteredStaffIds = useMemo(() => new Set(filteredStaff.map((s) => s.id)), [filteredStaff]);

  // Records matching the current search + status filter
  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      if (!filteredStaffIds.has(r.staffId)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [records, filteredStaffIds, statusFilter]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const presentDays = records.filter((r) => PRESENT_STATUSES.includes(r.status)).length;
    const leaveDays = records.filter((r) => r.status === "leave").length;
    const lateMarks = records.filter((r) => r.isLate).length;
    return { staff: staffList.length, presentDays, leaveDays, lateMarks };
  }, [records, staffList.length]);

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

  // ── Daily register rows (one per record, newest first) ───────────────────────
  const dailyRows = useMemo(() => {
    return [...visibleRecords].sort((a, b) => (secOf(b.date) ?? 0) - (secOf(a.date) ?? 0));
  }, [visibleRecords]);

  // ── Monthly grid lookup ──────────────────────────────────────────────────────
  const gridLookup = useMemo(() => {
    const map = new Map<string, Rec>();
    for (const r of records) {
      const s = secOf(r.date);
      if (s) map.set(`${r.staffId}_${dateKeyFromSec(s)}`, r);
    }
    return map;
  }, [records]);

  const todayKey = new Date().toISOString().split("T")[0];

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
    const rec = gridLookup.get(`${staff.id}_${meta.key}`);
    if (rec) return STATUS_CONFIG[rec.status];
    const joinSec = secOf(staff.dateOfJoining);
    if (joinSec && meta.key < dateKeyFromSec(joinSec)) return null; // before joining
    if (meta.isFuture) return null;
    if (meta.holidayName) return { code: "H", label: meta.holidayName, cell: HOLIDAY_CELL, badge: HOLIDAY_CELL };
    if (meta.isOff) return { code: "WO", label: "Weekly Off", cell: OFF_CELL, badge: OFF_CELL };
    return STATUS_CONFIG.absent;
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function handleExport() {
    const monthText = monthStart.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    if (view === "logs") {
      const rows = logEvents.map((e) => ({
        Date: dateKeyFromSec(e.sec),
        Time: new Date(e.sec * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        Staff: fullName(staffMap.get(e.staffId)),
        Action: e.action,
        Status: STATUS_CONFIG[e.status]?.label ?? e.status,
        Flag: e.isLate ? "Late" : e.isEarly ? "Early" : "",
        Location: e.location ? `${e.location.lat}, ${e.location.lng}` : "",
      }));
      exportToCSV(rows, `attendance-logs-${month}`);
    } else if (view === "daily") {
      const rows = dailyRows.map((r) => ({
        Date: dateKeyFromSec(secOf(r.date) ?? 0),
        Staff: fullName(staffMap.get(r.staffId)),
        Status: STATUS_CONFIG[r.status]?.label ?? r.status,
        "Check In": timeStr(r.checkIn),
        "Check Out": timeStr(r.checkOut),
        Hours: r.workingHours ? r.workingHours.toFixed(1) : "",
        Overtime: r.overtimeHours ? r.overtimeHours.toFixed(1) : "",
        Late: r.isLate ? "Yes" : "",
        Early: r.isEarlyDeparture ? "Yes" : "",
      }));
      exportToCSV(rows, `attendance-daily-${month}`);
    } else {
      const rows = filteredStaff.map((s) => {
        const row: Record<string, string> = { Staff: fullName(s), Code: s.employeeCode ?? "" };
        for (const meta of dayMeta) {
          const c = cellFor(s, meta);
          row[String(meta.day)] = c?.code ?? "";
        }
        return row;
      });
      exportToCSV(rows, `attendance-grid-${month}`);
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

      <StatGrid cols={4}>
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
        <div className="inline-flex rounded-full border border-slate-200/90 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all " +
                  (active
                    ? "bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 text-white shadow-[0_10px_24px_rgba(15,118,110,0.24)]"
                    : "text-slate-600 hover:text-slate-950")
                }
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search staff…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-auto min-w-[200px] pl-9"
            />
          </div>
          {view !== "grid" ? (
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | AttendanceStatus)}
              className="w-auto min-w-[170px]"
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
                <TableHead>Flag</TableHead>
                <TableHead>Location</TableHead>
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
                logEvents.map((e) => {
                  const cfg = STATUS_CONFIG[e.status];
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
                      <TableCell>
                        {e.isLate ? (
                          <Badge variant="bg-amber-100 text-amber-700">Late</Badge>
                        ) : e.isEarly ? (
                          <Badge variant="bg-yellow-100 text-yellow-700">Early</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {e.location ? `${e.location.lat.toFixed(4)}, ${e.location.lng.toFixed(4)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
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
                <TableHead>Check Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Overtime</TableHead>
                <TableHead>Flags</TableHead>
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
                  const cfg = STATUS_CONFIG[r.status];
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
                      <TableCell>{timeStr(r.checkOut)}</TableCell>
                      <TableCell>{r.workingHours ? `${r.workingHours.toFixed(1)}h` : "—"}</TableCell>
                      <TableCell>
                        {r.overtimeHours ? (
                          <Badge variant="bg-orange-100 text-orange-700">+{r.overtimeHours.toFixed(1)}h</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
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
          description="Staff down the side, days across the top. Each cell is the logged status."
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
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-950">
                        <div className="whitespace-nowrap">{fullName(s)}</div>
                        <div className="text-xs text-slate-400">{s.employeeCode || s.designation}</div>
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
        <span className="inline-flex items-center gap-1.5">
          <span className={"flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold " + OFF_CELL}>
            WO
          </span>
          Weekly Off
        </span>
      </div>

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center">
          <div className="w-full bg-white p-6 shadow-2xl sm:mx-auto sm:max-w-md sm:rounded-2xl">
            <h3 className="text-lg font-semibold text-slate-950">
              {editTarget.record ? "Edit Attendance" : "Add Attendance"}
            </h3>
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
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Check In</label>
                <Input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Check Out</label>
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
        </div>
      )}
    </div>
  );
}
