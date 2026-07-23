"use client";

// Read-only current-month attendance grid for the staff home page.
// The interactive register (filters, corrections) lives on /staff-portal/attendance.
import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocuments, orderBy, where, Timestamp } from "@/lib/firestore";
import { Attendance } from "@/types";
import { getAppSettings, weeklyOffDayNames, Holiday } from "@/lib/settings";
import {
  ATTENDANCE_STATUS_CONFIG,
  WEEKLY_OFF_META,
  attendanceStatusMeta,
  type StatusMeta,
} from "@/lib/attendance-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";

const localDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const secOf = (ts: unknown): number | undefined =>
  ts && typeof ts === "object" && "seconds" in (ts as Record<string, unknown>)
    ? (ts as { seconds: number }).seconds
    : undefined;

interface DayCell {
  day: number;
  key: string;
  weekday: string;
  meta: StatusMeta | null;
}

export function AttendanceMonthGrid({ staffId }: { staffId: string }) {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<string[]>(["Sunday"]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  useEffect(() => {
    if (!staffId) return;
    let active = true;
    (async () => {
      try {
        const [att, settings] = await Promise.all([
          getDocuments<Attendance>("attendance", [
            where("staffId", "==", staffId),
            where("date", ">=", Timestamp.fromDate(new Date(year, month, 1))),
            where("date", "<=", Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59))),
            orderBy("date", "asc"),
          ]),
          getAppSettings(),
        ]);
        if (!active) return;
        setRecords(att.filter((r) => !r.isDeleted));
        setWeeklyOff(weeklyOffDayNames(settings));
        setHolidays(settings.holidays);
      } catch {
        // Home widget — fail quiet, full page has its own error handling.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [staffId, year, month]);

  // Plain computation — 31 cells, React Compiler memoizes. Manual useMemo trips
  // its preserve-manual-memoization rule because year/month derive from `now`.
  const cells: DayCell[] = (() => {
    const recordByDay = new Map<string, Attendance>();
    for (const r of records) {
      const s = secOf(r.date);
      if (s) recordByDay.set(localDateKey(new Date(s * 1000)), r);
    }
    const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
    const todayKey = localDateKey(new Date());
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: DayCell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = localDateKey(date);
      const rec = recordByDay.get(key);
      let meta: StatusMeta | null = null;
      if (rec) meta = attendanceStatusMeta(rec.status);
      else if (key > todayKey) meta = null;
      else if (holidayMap.has(key)) meta = ATTENDANCE_STATUS_CONFIG["public-holiday"];
      else if (weeklyOff.includes(date.toLocaleDateString("en-IN", { weekday: "long" }))) meta = WEEKLY_OFF_META;
      else meta = ATTENDANCE_STATUS_CONFIG.absent;
      list.push({ day: d, key, weekday: date.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2).toUpperCase(), meta });
    }
    return list;
  })();

  const counts: Record<string, number> = {};
  for (const cell of cells) if (cell.meta) counts[cell.meta.code] = (counts[cell.meta.code] ?? 0) + 1;

  const todayKey = localDateKey(new Date());
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Attendance • {monthLabel}</CardTitle>
          <Link
            href="/staff-portal/attendance"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
          >
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            {/* Mobile: 7-column calendar */}
            <div className="grid grid-cols-7 gap-1 sm:hidden">
              {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => (
                <div key={d} className={"py-0.5 text-center text-[9px] font-semibold uppercase " + (d === "SU" ? "text-rose-400" : "text-slate-400")}>
                  {d}
                </div>
              ))}
              {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {cells.map((cell) => (
                <div
                  key={cell.key}
                  title={cell.meta?.label}
                  className={
                    "flex h-9 flex-col items-center justify-center rounded-md " +
                    (cell.key === todayKey ? "outline outline-1 outline-teal-400 " : "") +
                    (cell.meta ? cell.meta.cell : "bg-slate-50 text-slate-300")
                  }
                >
                  <span className="text-[9px] font-medium leading-tight">{cell.day}</span>
                  <span className="text-[9px] font-bold leading-tight">{cell.meta?.code ?? ""}</span>
                </div>
              ))}
            </div>

            {/* Desktop: sheet-style strip */}
            <div className="hidden overflow-x-auto pb-1 sm:block">
              <div className="inline-block min-w-full">
                <div className="flex gap-1">
                  {cells.map((c) => (
                    <div
                      key={`h-${c.key}`}
                      className={"w-7 shrink-0 text-center text-[9px] font-semibold uppercase " + (c.weekday === "SU" ? "text-rose-500" : "text-slate-400")}
                    >
                      <div>{c.weekday}</div>
                      <div className="text-[10px] text-slate-600">{String(c.day).padStart(2, "0")}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex gap-1">
                  {cells.map((cell) => (
                    <div
                      key={cell.key}
                      title={`${cell.day} — ${cell.meta?.label ?? "Upcoming"}`}
                      className={
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold " +
                        (cell.key === todayKey ? "outline outline-1 outline-teal-400 " : "") +
                        (cell.meta ? cell.meta.cell : "bg-slate-50 text-slate-300")
                      }
                    >
                      {cell.meta?.code ?? ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
              {[...Object.values(ATTENDANCE_STATUS_CONFIG), WEEKLY_OFF_META].map((c) => (
                <span key={c.code} className="inline-flex items-center gap-1">
                  <span className={"flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-semibold " + c.cell}>{c.code}</span>
                  {counts[c.code] ? <span className="font-semibold text-slate-700">{counts[c.code]}</span> : "0"}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
