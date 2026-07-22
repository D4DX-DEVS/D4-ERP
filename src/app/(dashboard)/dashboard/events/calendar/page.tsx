"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ManagedEvent } from "@/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_DOT_COLORS: Record<string, string> = {
  inquiry: "bg-slate-400",
  quotation: "bg-blue-400",
  confirmed: "bg-emerald-500",
  planning: "bg-indigo-400",
  "in-progress": "bg-amber-500",
  completed: "bg-green-600",
  cancelled: "bg-red-500",
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function EventCalendarPage() {
  const router = useRouter();
  const base = useWorkspaceBase();
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    async function fetchEvents() {
      try {
        const docs = await getDocuments<ManagedEvent>("events", [orderBy("startDate", "asc")]);
        setEvents(docs);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetchEvents();
  }, []);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthLabel = currentDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Get events for a specific date
  const getEventsForDate = (day: number): ManagedEvent[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      return e.startDate <= dateStr && e.endDate >= dateStr;
    });
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Event Calendar"
        description="Visual calendar of all events."
      />

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center text-slate-950">{monthLabel}</h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <Card>
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200/70 bg-slate-50/80">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {d}
              </div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={idx} className="border-b border-r border-slate-200/60 p-2 min-h-[100px] bg-slate-50/40" />;
              }
              const dayEvents = getEventsForDate(day);
              return (
                <div
                  key={idx}
                  className={`border-b border-r border-slate-200/60 p-2 min-h-[100px] hover:bg-teal-50/40 transition-colors ${
                    isToday(day) ? "bg-teal-50/60" : ""
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday(day) ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-[0_6px_14px_rgba(15,118,110,0.3)]" : "text-slate-700"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => router.push(`${base}/events/${e.id}`)}
                        className="w-full text-left rounded-md px-1 py-0.5 text-[10px] truncate hover:bg-white flex items-center gap-1 text-slate-700"
                        title={e.title}
                      >
                        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT_COLORS[e.status] || "bg-gray-400"}`} />
                        {e.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-slate-400 px-1">
                        +{dayEvents.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_DOT_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="capitalize">{status.replace(/-/g, " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
