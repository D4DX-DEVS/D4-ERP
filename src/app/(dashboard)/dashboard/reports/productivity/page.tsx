"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/loading";
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
        <ListingStatCard label="Active Staff" value={staff.length} icon={<Users className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white" />
        <ListingStatCard label="Total Hours" value={`${totalHours}h`} icon={<Clock className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" />
        <ListingStatCard label="Avg per Staff" value={`${avgOverall}h`} icon={<TrendingUp className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" />
        <ListingStatCard label="Top Performer" value={topPerformer} icon={<Target className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : staff.length === 0 ? (
        <Card><CardContent><EmptyState icon={<TrendingUp className="h-12 w-12" />} title="No productivity data in the last 30 days" /></CardContent></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Days Active</TableHead>
                <TableHead>Total Hours</TableHead>
                <TableHead>Avg/Day</TableHead>
                <TableHead>Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s, idx) => {
                const utilization = Math.min(100, Math.round((s.avgPerDay / 8) * 100));
                return (
                  <TableRow key={s.staffId}>
                    <TableCell className="font-bold text-slate-400">{idx + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">{s.staffName}</TableCell>
                    <TableCell>{s.daysActive}</TableCell>
                    <TableCell>{s.totalHours}h</TableCell>
                    <TableCell>{Math.round(s.avgPerDay * 10) / 10}h</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${utilization >= 75 ? "bg-gradient-to-r from-teal-600 to-emerald-500" : utilization >= 50 ? "bg-gradient-to-r from-amber-500 to-yellow-500" : "bg-gradient-to-r from-red-500 to-rose-500"}`}
                            style={{ width: `${utilization}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{utilization}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
