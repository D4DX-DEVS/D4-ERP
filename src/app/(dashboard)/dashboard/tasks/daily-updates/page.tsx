"use client";

import { useEffect, useState } from "react";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
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
        <label className="text-sm font-medium">Date:</label>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <button onClick={() => setDateFilter("")} className="text-sm text-primary hover:underline">
          All dates
        </button>
      </div>

      <ListingStatGrid>
        <ListingStatCard label="Submissions" value={filtered.length} icon={<FileText className="h-5 w-5" />} />
        <ListingStatCard label="Staff Logged" value={uniqueStaff} icon={<Users className="h-5 w-5" />} />
        <ListingStatCard label="Total Hours" value={`${totalHoursToday}h`} icon={<Clock className="h-5 w-5" />} />
        <ListingStatCard label="With Blockers" value={withBlockers} icon={<AlertTriangle className="h-5 w-5" />} />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions for this date.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((log) => (
            <div key={log.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium">{log.staffName}</h4>
                  <p className="text-xs text-muted-foreground">{log.date} • {log.totalHours}h total</p>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_COLORS[log.status] || ""}`}>
                  {log.status.replace(/-/g, " ")}
                </span>
              </div>
              <div className="space-y-2">
                {log.entries.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 py-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.project || "—"}</span>
                        <span className="text-[10px] rounded bg-accent px-1.5 py-0.5 capitalize">{entry.activityType}</span>
                        <span className="text-xs text-muted-foreground">{entry.hours}h</span>
                      </div>
                      <p className="text-muted-foreground text-xs mt-0.5">{entry.description}</p>
                      {entry.blockers && (
                        <p className="text-xs text-orange-600 mt-1">Blocker: {entry.blockers}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
