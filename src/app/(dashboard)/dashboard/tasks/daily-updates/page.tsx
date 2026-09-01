"use client";

import { useMemo, useState } from "react";
import { where } from "@/lib/firestore";
import { usePagination } from "@/hooks/use-pagination";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
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
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split("T")[0]);
  const [pageSize, setPageSize] = useState(50);

  // Date filter lives in the query — a single day is roster-sized, so the
  // default view fits one page and the stat cards stay exact.
  const constraints = useMemo(() => {
    const c = [where("status", "in", ["submitted", "reviewed", "needs-revision"])];
    if (dateFilter) c.push(where("date", "==", dateFilter));
    return c;
  }, [dateFilter]);

  const {
    data: filtered,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
  } = usePagination<WorkLog>("work_logs", {
    pageSize,
    orderByField: "date",
    orderDirection: "desc",
    constraints,
  });

  const totalHoursToday = filtered.reduce((s, l) => s + (l.totalHours || 0), 0);
  const uniqueStaff = new Set(filtered.map((l) => l.staffId)).size;
  const withBlockers = filtered.filter((l) => l.entries.some((e) => e.blockers)).length;
  // Page-scoped stats are only partial when the result spills past one page
  const partial = totalCount > filtered.length;
  const pageMeta = partial ? "on this page" : undefined;

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
        <button onClick={() => setDateFilter("")} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
          All dates
        </button>
      </div>

      <ListingStatGrid>
        <ListingStatCard label="Submissions" value={totalCount} icon={<FileText className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-indigo-500 to-violet-600 text-white" />
        <ListingStatCard label="Staff Logged" value={uniqueStaff} meta={pageMeta} icon={<Users className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" />
        <ListingStatCard label="Total Hours" value={`${totalHoursToday}h`} meta={pageMeta} icon={<Clock className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" />
        <ListingStatCard label="With Blockers" value={withBlockers} meta={pageMeta} icon={<AlertTriangle className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-rose-500 to-red-500 text-white" />
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
                  <div key={idx} className="flex items-start gap-3 text-sm border-l-2 border-indigo-100 pl-3 py-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{entry.project || "—"}</span>
                        <span className="text-[10px] rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 capitalize">{entry.activityType}</span>
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
          <Card className="p-0">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={nextPage}
              onPrev={prevPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
