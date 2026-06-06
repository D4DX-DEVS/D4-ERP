"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where } from "@/lib/firestore";
import { LeaveRequest } from "@/types";
import { getAppSettings, AppSettings } from "@/lib/settings";
import {
  CalendarItem,
  holidayToItem,
  leaveToItem,
  itemsForDay,
  categoryMeta,
  dayStart,
  sameDay,
} from "@/lib/calendar-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StaffCalendarPage() {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(() => dayStart(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    async function load() {
      try {
        const [appSettings, leaves] = await Promise.all([
          getAppSettings(),
          getDocuments<LeaveRequest>("leaveRequests", [where("status", "==", "approved")]),
        ]);
        if (!isMounted) return;
        setSettings(appSettings);
        const holidayItems = (appSettings.holidays || []).map(holidayToItem);
        const leaveItems = leaves
          .map((l) => leaveToItem({ ...l, id: l.id }))
          .filter((i): i is CalendarItem => i !== null);
        setItems([...holidayItems, ...leaveItems]);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Build the 6-week grid for the current month.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - monthStart.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const today = dayStart(new Date());
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const selectedItems = itemsForDay(items, selected);

  const monthHolidays = items
    .filter((it) => it.source === "holiday" && it.start.getMonth() === cursor.getMonth() && it.start.getFullYear() === cursor.getFullYear())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const isWeeklyOff = (d: Date): boolean => {
    if (!settings) return false;
    const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
    const day = settings.weeklySchedule?.[keys[d.getDay()]];
    return day ? !day.enabled : false;
  };

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(dayStart(now));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="ghost" size="icon" onClick={goPrev}><ChevronLeft className="h-5 w-5" /></Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel}</span>
          <Button variant="ghost" size="icon" onClick={goNext}><ChevronRight className="h-5 w-5" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">{w}</div>
                ))}
                {days.map((d) => {
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const dayItems = itemsForDay(items, d);
                  const isToday = sameDay(d, today);
                  const isSelected = sameDay(d, selected);
                  const off = isWeeklyOff(d);
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setSelected(dayStart(d))}
                      className={[
                        "min-h-[68px] rounded-xl border p-1.5 text-left transition",
                        inMonth ? "bg-white" : "bg-slate-50/60 text-gray-400",
                        isSelected ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200 hover:border-emerald-300",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between">
                        <span className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday ? "bg-emerald-600 text-white" : off && inMonth ? "text-rose-500" : "",
                        ].join(" ")}>{d.getDate()}</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dayItems.slice(0, 2).map((it) => (
                          <div key={it.key} className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${categoryMeta(it.type).bar}`}>
                            {it.title}
                          </div>
                        ))}
                        {dayItems.length > 2 && <div className="px-1 text-[9px] text-gray-400">+{dayItems.length - 2} more</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selected.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedItems.length === 0 ? (
                  <p className="text-sm text-gray-500">Nothing scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedItems.map((it) => (
                      <div key={it.key} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2">
                        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full`} style={{ background: categoryMeta(it.type).hex }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{it.title}</p>
                          <Badge variant={categoryMeta(it.type).badge}>{categoryMeta(it.type).label}</Badge>
                          {it.description && <p className="mt-1 text-xs text-gray-500">{it.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-emerald-500" /> Holidays this month
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthHolidays.length === 0 ? (
                  <p className="text-sm text-gray-500">No company holidays this month.</p>
                ) : (
                  <div className="space-y-2">
                    {monthHolidays.map((h) => (
                      <div key={h.key} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                        <span className="text-sm font-medium">{h.title}</span>
                        <span className="text-xs text-gray-500">
                          {h.start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
