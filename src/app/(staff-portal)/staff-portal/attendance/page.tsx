"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { createDocument, getDocuments, orderBy, where, Timestamp } from "@/lib/firestore";
import { Attendance } from "@/types";
import { getAppSettings, weeklyOffDayNames, Holiday } from "@/lib/settings";
import {
  ATTENDANCE_STATUS_CONFIG,
  ATTENDANCE_STATUS_OPTIONS,
  WEEKLY_OFF_META,
  attendanceStatusMeta,
  type ActiveAttendanceStatus,
  type StatusMeta,
} from "@/lib/attendance-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ChevronLeft, ChevronRight, ClipboardEdit, Send } from "lucide-react";

const CORRECTION_STATUS_OPTIONS = ATTENDANCE_STATUS_OPTIONS.filter((o) => o.value !== "public-holiday");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const secOf = (ts: unknown): number | undefined =>
  ts && typeof ts === "object" && "seconds" in (ts as Record<string, unknown>)
    ? (ts as { seconds: number }).seconds
    : undefined;

const timeStr = (ts: unknown): string => {
  const s = secOf(ts);
  return s ? new Date(s * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
};

interface DayCell {
  day: number;
  key: string;
  weekday: string;
  meta: StatusMeta | null;
  holidayName: string | null;
}

export default function StaffAttendancePage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const correctionRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const [view, setView] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(now.getMonth()); // 0-based, month view only
  const [year, setYear] = useState(now.getFullYear());

  const [records, setRecords] = useState<(Attendance & { id: string })[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<string[]>(["Sunday"]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [correctionForm, setCorrectionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    requestedCheckIn: "",
    requestedCheckOut: "",
    requestedStatus: "present" as ActiveAttendanceStatus,
    reason: "",
  });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Fetch the whole year once — covers both views, no refetch on month change.
  useEffect(() => {
    if (!user?.staffId) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [att, settings] = await Promise.all([
          getDocuments<Attendance>("attendance", [
            where("staffId", "==", user.staffId),
            where("date", ">=", Timestamp.fromDate(new Date(year, 0, 1))),
            where("date", "<=", Timestamp.fromDate(new Date(year, 11, 31, 23, 59, 59))),
            orderBy("date", "asc"),
          ]),
          getAppSettings(),
        ]);
        if (!active) return;
        setRecords(att.filter((r) => !r.isDeleted));
        setWeeklyOff(weeklyOffDayNames(settings));
        setHolidays(settings.holidays);
      } catch (error) {
        console.error("Error:", error);
        if (active) toast("error", "Failed to load attendance");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.staffId, year, toast]);

  const recordByDay = useMemo(() => {
    const map = new Map<string, Attendance & { id: string }>();
    for (const r of records) {
      const s = secOf(r.date);
      if (s) map.set(localDateKey(new Date(s * 1000)), r);
    }
    return map;
  }, [records]);

  const todayKey = localDateKey(new Date());
  const holidayMap = useMemo(() => new Map(holidays.map((h) => [h.date, h.name])), [holidays]);

  const cellsForMonth = useMemo(() => {
    return (m: number): DayCell[] => {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const cells: DayCell[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, m, d);
        const key = localDateKey(date);
        const rec = recordByDay.get(key);
        const holidayName = holidayMap.get(key) ?? null;
        let meta: StatusMeta | null = null;
        if (rec) meta = attendanceStatusMeta(rec.status);
        else if (key > todayKey) meta = null;
        else if (holidayName) meta = ATTENDANCE_STATUS_CONFIG["public-holiday"];
        else if (weeklyOff.includes(date.toLocaleDateString("en-IN", { weekday: "long" }))) meta = WEEKLY_OFF_META;
        else meta = ATTENDANCE_STATUS_CONFIG.absent;
        cells.push({ day: d, key, weekday: date.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2).toUpperCase(), meta, holidayName });
      }
      return cells;
    };
  }, [year, recordByDay, holidayMap, weeklyOff, todayKey]);

  const monthCells = useMemo(() => cellsForMonth(month), [cellsForMonth, month]);

  const countsOf = (cells: DayCell[]) => {
    const counts: Record<string, number> = {};
    for (const c of cells) if (c.meta) counts[c.meta.code] = (counts[c.meta.code] ?? 0) + 1;
    return counts;
  };
  const monthCounts = useMemo(() => countsOf(monthCells), [monthCells]);

  const selectedRecord = selectedKey ? recordByDay.get(selectedKey) : undefined;

  const selectDay = (cell: DayCell) => {
    if (cell.key > todayKey) return;
    setSelectedKey(cell.key);
    setCorrectionForm((f) => ({ ...f, date: cell.key }));
  };

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i).map((y) => ({
    value: String(y),
    label: String(y),
  }));

  const handleSubmitCorrection = async () => {
    if (!user) return;
    if (!correctionForm.reason.trim()) {
      toast("error", "Please provide a reason for the correction");
      return;
    }
    setSubmittingCorrection(true);
    try {
      const date = new Date(correctionForm.date);
      date.setHours(0, 0, 0, 0);
      await createDocument("attendance_corrections", {
        staffId: user.staffId,
        staffName: `${user.firstName} ${user.lastName}`,
        date: Timestamp.fromDate(date),
        requestedCheckIn: correctionForm.requestedCheckIn || undefined,
        requestedCheckOut: correctionForm.requestedCheckOut || undefined,
        requestedStatus: correctionForm.requestedStatus,
        reason: correctionForm.reason.trim(),
        status: "pending",
      });
      toast("success", "Correction request submitted");
      setCorrectionForm({
        date: new Date().toISOString().split("T")[0],
        requestedCheckIn: "",
        requestedCheckOut: "",
        requestedStatus: "present",
        reason: "",
      });
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to submit correction request");
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const dayCellButton = (cell: DayCell) => (
    <button
      key={cell.key}
      type="button"
      onClick={() => selectDay(cell)}
      disabled={cell.key > todayKey}
      title={`${cell.day} — ${cell.holidayName ?? cell.meta?.label ?? "Upcoming"}`}
      className={
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold transition-transform hover:scale-110 " +
        (selectedKey === cell.key ? "ring-2 ring-teal-500 " : "") +
        (cell.key === todayKey ? "outline outline-1 outline-teal-400 " : "") +
        (cell.meta ? cell.meta.cell : "bg-slate-50 text-slate-300")
      }
    >
      {cell.meta?.code ?? ""}
    </button>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
      {[...Object.values(ATTENDANCE_STATUS_CONFIG), WEEKLY_OFF_META].map((c) => (
        <span key={c.code} className="inline-flex items-center gap-1">
          <span className={"flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold " + c.cell}>
            {c.code}
          </span>
          {c.label}
          {view === "month" && monthCounts[c.code] ? <span className="font-semibold text-slate-700">×{monthCounts[c.code]}</span> : null}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ponytail: hidden on mobile — hero header already shows the page name */}
      <h1 className="hidden text-xl font-bold sm:block">Attendance</h1>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Month navigation lives with the title; period filter sits on the right. */}
            <div className="flex items-center gap-1">
              {view === "month" ? (
                <>
                  <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="min-w-[92px] text-center text-base">{`${MONTH_NAMES[month]} ${year}`}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {(month !== now.getMonth() || year !== now.getFullYear()) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMonth(now.getMonth());
                        setYear(now.getFullYear());
                      }}
                    >
                      Today
                    </Button>
                  )}
                </>
              ) : (
                <CardTitle className="text-base">{`Year ${year}`}</CardTitle>
              )}
            </div>
            <div className="flex items-center gap-2">
              {view === "year" && (
                <Select
                  value={String(year)}
                  onChange={(e) => setYear(Number(e.target.value))}
                  options={yearOptions}
                  className="w-24"
                />
              )}
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5">
                {(["month", "year"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold transition-colors " +
                      (view === v ? "bg-teal-600 text-white" : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    {v === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
          ) : view === "month" ? (
            <>
              {/* Mobile: 7-column month calendar, no sideways scrolling */}
              <div className="sm:hidden">
                <div className="grid grid-cols-7 gap-1">
                  {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => (
                    <div key={d} className={"py-1 text-center text-[9px] font-semibold uppercase " + (d === "SU" ? "text-rose-400" : "text-slate-400")}>
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => (
                    <div key={`pad-${i}`} />
                  ))}
                  {monthCells.map((cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => selectDay(cell)}
                      disabled={cell.key > todayKey}
                      title={`${cell.day} — ${cell.holidayName ?? cell.meta?.label ?? "Upcoming"}`}
                      className={
                        "flex h-10 flex-col items-center justify-center rounded-md transition-colors " +
                        (selectedKey === cell.key ? "ring-2 ring-teal-500 " : "") +
                        (cell.key === todayKey ? "outline outline-1 outline-teal-400 " : "") +
                        (cell.meta ? cell.meta.cell : "bg-slate-50 text-slate-300")
                      }
                    >
                      <span className="text-[10px] font-medium leading-tight">{cell.day}</span>
                      <span className="text-[10px] font-bold leading-tight">{cell.meta?.code ?? ""}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop: sheet-style register, days across in one row */}
              <div className="hidden overflow-x-auto pb-1 sm:block">
                <div className="inline-block min-w-full">
                  <div className="flex gap-1">
                    {monthCells.map((c) => (
                      <div
                        key={`h-${c.key}`}
                        className={
                          "w-8 shrink-0 text-center text-[9px] font-semibold uppercase " +
                          (c.holidayName || c.weekday === "SU" ? "text-rose-500" : "text-slate-400")
                        }
                      >
                        <div>{c.weekday}</div>
                        <div className="text-[11px] text-slate-600">{String(c.day).padStart(2, "0")}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1">{monthCells.map(dayCellButton)}</div>
                </div>
              </div>

              {selectedKey ? (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {new Date(selectedKey).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })}
                        {" — "}
                        {selectedRecord ? attendanceStatusMeta(selectedRecord.status).label : holidayMap.get(selectedKey) ?? "No record"}
                      </p>
                      {selectedRecord ? (
                        <p className="text-xs text-slate-500">
                          In {timeStr(selectedRecord.checkIn)} · Out {timeStr(selectedRecord.checkOut)}
                          {selectedRecord.workingHours ? ` · ${selectedRecord.workingHours.toFixed(1)}h` : ""}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => correctionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      <ClipboardEdit className="mr-1.5 h-3.5 w-3.5" />
                      Request Correction
                    </Button>
                  </div>
                </div>
              ) : null}

              {legend}
            </>
          ) : (
            <>
              {/* Yearly register: one row per month */}
              <div className="overflow-x-auto pb-1">
                <table className="border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-white pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Month
                      </th>
                      {Array.from({ length: 31 }, (_, i) => (
                        <th key={i} className="w-8 text-center text-[10px] font-semibold text-slate-400">
                          {String(i + 1).padStart(2, "0")}
                        </th>
                      ))}
                      <th className="pl-2 text-center text-[10px] font-semibold uppercase text-slate-400">P</th>
                      <th className="text-center text-[10px] font-semibold uppercase text-slate-400">A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_NAMES.map((name, m) => {
                      const cells = cellsForMonth(m);
                      const counts = countsOf(cells);
                      return (
                        <tr key={name}>
                          <td className="sticky left-0 z-10 bg-white pr-2 text-xs font-semibold text-slate-700">{name}</td>
                          {Array.from({ length: 31 }, (_, i) => (
                            <td key={i} className="p-0">
                              {cells[i] ? dayCellButton(cells[i]) : null}
                            </td>
                          ))}
                          <td className="pl-2 text-center text-xs font-semibold text-emerald-600">{counts.P ?? 0}</td>
                          <td className="text-center text-xs font-semibold text-rose-600">{counts.A ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {legend}
            </>
          )}
        </CardContent>
      </Card>

      {/* Request Correction */}
      <div ref={correctionRef}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardEdit className="h-5 w-5 text-sky-500" /> Request Attendance Correction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">
              Marked absent when you were present, or forgot to punch? Pick the day on the register above and submit a request for your manager to review.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <DatePicker
                  value={correctionForm.date}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
                />
              </div>
              <div>
                <Label>Requested Status</Label>
                <Select
                  options={CORRECTION_STATUS_OPTIONS}
                  value={correctionForm.requestedStatus}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedStatus: e.target.value as ActiveAttendanceStatus })}
                />
              </div>
              <div>
                <Label>Check In (optional)</Label>
                <TimePicker
                  value={correctionForm.requestedCheckIn}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckIn: e.target.value })}
                />
              </div>
              <div>
                <Label>Check Out (optional)</Label>
                <TimePicker
                  value={correctionForm.requestedCheckOut}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, requestedCheckOut: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={correctionForm.reason}
                onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                placeholder="Explain why this correction is needed"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmitCorrection} disabled={submittingCorrection} className="w-full sm:w-auto">
                <Send className="h-4 w-4 mr-2" />
                {submittingCorrection ? "Submitting…" : "Submit Request"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
