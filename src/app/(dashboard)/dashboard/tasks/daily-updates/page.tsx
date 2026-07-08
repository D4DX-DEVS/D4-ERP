"use client";

import { useEffect, useState } from "react";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/loading";
import { Clock, Users, FileText, AlertTriangle } from "lucide-react";
import type { WorkLog } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  reviewed: "bg-green-100 text-green-700",
  "needs-revision": "bg-orange-100 text-orange-700",
};

export default function DailyUpdatesPage() {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const allLogs = await getDocuments<WorkLog>("work_logs", [
          where("status", "in", ["submitted", "reviewed", "needs-revision"]),
          orderBy("date", "desc"),
        ]);
        setLogs(allLogs);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetchLogs();
  }, []);

  const filtered = dateFilter ? logs.filter((l) => l.date === dateFilter) : logs;

  const totalHoursToday = filtered.reduce((s, l) => s + (l.totalHours || 0), 0);
  const uniqueStaff = new Set(filtered.map((l) => l.staffId)).size;
  const withBlockers = filtered.filter((l) => l.entries.some((e) => e.blockers)).length;

  return (
    <div className="space-y-6">
      <ListingHeader title="Daily Updates" description="Staff work submissions by date." />

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Date:</label>
        <DatePicker
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-[170px]"
        />
        <button onClick={() => setDateFilter("")} className="text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline">
          All dates
        </button>
      </div>

      <ListingStatGrid>
        <ListingStatCard label="Submissions" value={filtered.length} icon={<FileText className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white" />
        <ListingStatCard label="Staff Logged" value={uniqueStaff} icon={<Users className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" />
        <ListingStatCard label="Total Hours" value={`${totalHoursToday}h`} icon={<Clock className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" />
        <ListingStatCard label="With Blockers" value={withBlockers} icon={<AlertTriangle className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-rose-500 to-red-500 text-white" />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent><EmptyState icon={<FileText className="h-12 w-12" />} title="No submissions for this date" /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((log) => (
            <Card key={log.id}>
              <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900">{log.staffName}</h4>
                  <p className="text-xs text-slate-500">{log.date} • {log.totalHours}h total</p>
                </div>
                <Badge variant={STATUS_COLORS[log.status]} className="capitalize">
                  {log.status.replace(/-/g, " ")}
                </Badge>
              </div>
              <div className="space-y-2">
                {log.entries.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm border-l-2 border-teal-100 pl-3 py-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{entry.project || "—"}</span>
                        <span className="text-[10px] rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 capitalize">{entry.activityType}</span>
                        <span className="text-xs text-slate-500">{entry.hours}h</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">{entry.description}</p>
                      {entry.blockers && (
                        <p className="text-xs text-orange-600 mt-1">Blocker: {entry.blockers}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
