"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/loading";
import { TrendingUp, Clock, Users, BarChart3 } from "lucide-react";
import type { WorkLog } from "@/types";

interface StaffSummary {
  staffId: string;
  staffName: string;
  totalLogs: number;
  totalHours: number;
  avgHoursPerDay: number;
}

export default function PerformancePage() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  useEffect(() => {
    async function fetch() {
      try {
        const data = await getDocuments<WorkLog>("work_logs", [orderBy("date", "desc")]);
        setLogs(data);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const now = new Date();
  const filtered = logs.filter((l) => {
    if (period === "all") return true;
    const logDate = new Date(l.date);
    const diffDays = Math.ceil((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
    if (period === "week") return diffDays <= 7;
    return diffDays <= 30;
  });

  // Aggregate per staff
  const staffMap = new Map<string, StaffSummary>();
  filtered.forEach((l) => {
    const existing = staffMap.get(l.staffId);
    if (existing) {
      existing.totalLogs += 1;
      existing.totalHours += l.totalHours || 0;
      existing.avgHoursPerDay = existing.totalHours / existing.totalLogs;
    } else {
      staffMap.set(l.staffId, {
        staffId: l.staffId,
        staffName: l.staffName,
        totalLogs: 1,
        totalHours: l.totalHours || 0,
        avgHoursPerDay: l.totalHours || 0,
      });
    }
  });

  const summaries = Array.from(staffMap.values()).sort((a, b) => b.totalHours - a.totalHours);
  const totalHours = summaries.reduce((s, r) => s + r.totalHours, 0);
  const avgPerStaff = summaries.length > 0 ? Math.round(totalHours / summaries.length) : 0;
  const maxHours = summaries[0]?.totalHours || 1;

  return (
    <div className="space-y-6">
      <ListingHeader title="Performance" description="Staff work log analytics and rankings." />

      <div className="flex items-center gap-2">
        {(["week", "month", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors capitalize ${
              period === p
                ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white border-transparent shadow-sm"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p === "all" ? "All time" : `This ${p}`}
          </button>
        ))}
      </div>

      <ListingStatGrid>
        <ListingStatCard label="Staff Active" value={summaries.length} icon={<Users className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white" />
        <ListingStatCard label="Total Hours" value={`${totalHours}h`} icon={<Clock className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" />
        <ListingStatCard label="Avg per Staff" value={`${avgPerStaff}h`} icon={<BarChart3 className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" />
        <ListingStatCard label="Submissions" value={filtered.length} icon={<TrendingUp className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : summaries.length === 0 ? (
        <Card><CardContent><EmptyState icon={<BarChart3 className="h-12 w-12" />} title="No data for this period" /></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Staff Ranking (by hours logged)</h3>
          <div className="space-y-3">
            {summaries.map((s, idx) => (
              <div key={s.staffId} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{s.staffName}</span>
                    <span className="text-xs text-slate-500">{s.totalHours}h • {s.totalLogs} logs</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-600 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${(s.totalHours / maxHours) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
