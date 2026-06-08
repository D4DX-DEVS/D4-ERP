"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getAppSettings, Holiday } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, PartyPopper } from "lucide-react";

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseDate = (key: string) => new Date(`${key}T00:00:00`);

const monthLabel = (key: string) =>
  parseDate(key).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export default function StaffHolidaysPage() {
  const { user } = useAuthStore();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getAppSettings()
      .then((settings) => {
        const visible = settings.holidays
          .filter((h) => !h.companyId || h.companyId === user.companyId)
          .sort((a, b) => a.date.localeCompare(b.date));
        setHolidays(visible);
      })
      .catch((error) => console.error("Error:", error))
      .finally(() => setLoading(false));
  }, [user]);

  const todayKey = dateKey(new Date());
  const upcoming = holidays.filter((h) => h.date >= todayKey);
  const past = holidays.filter((h) => h.date < todayKey);
  const nextHoliday = upcoming[0] ?? null;

  // Group upcoming holidays by month for display.
  const groups = upcoming.reduce<Record<string, Holiday[]>>((acc, h) => {
    const label = monthLabel(h.date);
    (acc[label] ??= []).push(h);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Holidays</h1>

      {nextHoliday && (
        <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <PartyPopper className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Next holiday</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-900">{nextHoliday.name}</p>
              <p className="text-sm text-slate-500">
                {parseDate(nextHoliday.date).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {upcoming.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarOff className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">No upcoming holidays have been scheduled.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([label, items]) => (
            <div key={label} className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">{label}</p>
              <Card>
                <CardContent className="divide-y divide-slate-100 p-0">
                  {items.map((h) => {
                    const d = parseDate(h.date);
                    const isToday = h.date === todayKey;
                    return (
                      <div key={`${h.date}-${h.companyId ?? "all"}`} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-700">
                          <span className="text-base font-bold leading-none">{d.getDate()}</span>
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">
                            {d.toLocaleDateString("en-IN", { month: "short" })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{h.name}</p>
                          <p className="text-xs text-slate-500">
                            {d.toLocaleDateString("en-IN", { weekday: "long" })}
                          </p>
                        </div>
                        {isToday && <Badge variant="bg-emerald-100 text-emerald-700">Today</Badge>}
                        {h.companyId && <Badge variant="bg-sky-100 text-sky-700">Company</Badge>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-500">Earlier this year</p>
          <Card>
            <CardContent className="divide-y divide-slate-100 p-0">
              {past.map((h) => {
                const d = parseDate(h.date);
                return (
                  <div key={`${h.date}-${h.companyId ?? "all"}`} className="flex items-center gap-4 px-4 py-2.5 opacity-60">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                      <span className="text-sm font-bold leading-none">{d.getDate()}</span>
                      <span className="text-[9px] uppercase tracking-wide text-slate-400">
                        {d.toLocaleDateString("en-IN", { month: "short" })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-600">{h.name}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
