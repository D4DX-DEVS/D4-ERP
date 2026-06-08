"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Clock, TrendingUp, Users, Target } from "lucide-react";
import type { WorkLog } from "@/types";

interface StaffProductivity {
  staffId: string;
  staffName: string;
  totalHours: number;
  daysActive: number;
  avgPerDay: number;
}

export default function ProductivityPage() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const recentLogs = logs.filter((l) => l.date >= thirtyDaysAgo);

  // Aggregate per staff
  const staffMap = new Map<string, StaffProductivity>();
  recentLogs.forEach((l) => {
    const existing = staffMap.get(l.staffId);
    if (existing) {
      existing.totalHours += l.totalHours || 0;
      existing.daysActive += 1;
      existing.avgPerDay = existing.totalHours / existing.daysActive;
    } else {
      staffMap.set(l.staffId, {
        staffId: l.staffId,
        staffName: l.staffName,
        totalHours: l.totalHours || 0,
        daysActive: 1,
        avgPerDay: l.totalHours || 0,
      });
    }
  });

  const staff = Array.from(staffMap.values()).sort((a, b) => b.totalHours - a.totalHours);
  const totalHours = staff.reduce((s, r) => s + r.totalHours, 0);
  const avgOverall = staff.length > 0 ? Math.round((totalHours / staff.length) * 10) / 10 : 0;
  const topPerformer = staff[0]?.staffName || "—";

  return (
    <div className="space-y-6">
      <ListingHeader title="Productivity" description="Last 30 days staff productivity analysis." />

      <ListingStatGrid>
        <ListingStatCard label="Active Staff" value={staff.length} icon={<Users className="h-5 w-5" />} />
        <ListingStatCard label="Total Hours" value={`${totalHours}h`} icon={<Clock className="h-5 w-5" />} />
        <ListingStatCard label="Avg per Staff" value={`${avgOverall}h`} icon={<TrendingUp className="h-5 w-5" />} />
        <ListingStatCard label="Top Performer" value={topPerformer} icon={<Target className="h-5 w-5" />} />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">No productivity data in the last 30 days.</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Staff</th>
                <th className="text-left px-4 py-3 font-medium">Days Active</th>
                <th className="text-left px-4 py-3 font-medium">Total Hours</th>
                <th className="text-left px-4 py-3 font-medium">Avg/Day</th>
                <th className="text-left px-4 py-3 font-medium">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s, idx) => {
                const utilization = Math.min(100, Math.round((s.avgPerDay / 8) * 100));
                return (
                  <tr key={s.staffId} className="border-b last:border-0">
                    <td className="px-4 py-3 font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{s.staffName}</td>
                    <td className="px-4 py-3">{s.daysActive}</td>
                    <td className="px-4 py-3">{s.totalHours}h</td>
                    <td className="px-4 py-3">{Math.round(s.avgPerDay * 10) / 10}h</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${utilization >= 75 ? "bg-green-500" : utilization >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                        <span className="text-xs">{utilization}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
