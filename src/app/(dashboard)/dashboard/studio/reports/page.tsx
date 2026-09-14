"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock, Download, TrendingUp, Timer, XCircle } from "lucide-react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard, ListingPanel } from "@/components/ui/listing";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { studioStatusBadge } from "@/lib/studio-utils";
import {
  REPORT_RANGES,
  busiestDay,
  completedReportRows,
  countByStatus,
  countByType,
  crewLeaderboard,
  filterByRange,
  peakHours,
  perStudio,
  summarize,
  toCsv,
  type ReportRange,
} from "@/lib/studio-reports";
import type { Studio, StudioBooking } from "@/types";

/** Minutes rendered as "6h 30m" — hours read better than three-digit minutes. */
function formatHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Horizontal bar row used by the distribution panels. */
function BarRow({
  label,
  value,
  max,
  meta,
  tone = "from-indigo-600 to-violet-600",
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  meta?: string;
  tone?: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        {meta && <span className="text-xs text-slate-400">{meta}</span>}
        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${width}%` }} />
        </div>
        <span className="w-8 text-right text-sm font-semibold text-slate-900">{value}</span>
      </div>
    </div>
  );
}

export default function StudioReportsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<(StudioBooking & { id: string })[]>([]);
  const [studios, setStudios] = useState<(Studio & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<ReportRange>("this-month");

  useEffect(() => {
    async function fetch() {
      try {
        const [b, s] = await Promise.all([
          getDocuments<StudioBooking>("studio_bookings", [orderBy("createdAt", "desc")]),
          getDocuments<Studio>("studios", []),
        ]);
        setBookings(b);
        setStudios(s);
      } catch (error) {
        console.error("Failed to fetch studio reports:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const studioNames = useMemo(() => studios.map((s) => ({ id: s.id, name: s.name })), [studios]);
  const rows = useMemo(() => filterByRange(bookings, range), [bookings, range]);

  const stats = useMemo(() => summarize(rows), [rows]);
  const studioTotals = useMemo(() => perStudio(rows, studioNames), [rows, studioNames]);
  const typeCounts = useMemo(() => countByType(rows), [rows]);
  const statusCounts = useMemo(() => countByStatus(rows), [rows]);
  const hours = useMemo(() => peakHours(rows), [rows]);
  const busiest = useMemo(() => busiestDay(rows), [rows]);
  const crew = useMemo(() => crewLeaderboard(rows), [rows]);
  const completedRows = useMemo(() => completedReportRows(rows, studioNames), [rows, studioNames]);

  const maxHourCount = Math.max(1, ...hours.map((h) => h.count));

  const handleExport = () => {
    if (completedRows.length === 0) {
      toast("error", "Nothing to export for this range");
      return;
    }
    const blob = new Blob([toCsv(completedRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-completed-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Studio Reports"
        description="Booking analytics, crew and utilisation."
        action={
          <div className="flex items-center gap-2">
            <Select
              value={range}
              onChange={(e) => setRange(e.target.value as ReportRange)}
              className="w-[160px]"
              options={REPORT_RANGES.map((r) => ({ value: r.value, label: r.label }))}
            />
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<BarChart3 className="h-12 w-12" />}
              title="No bookings in this range"
              description="Pick a wider date range to see studio analytics."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <ListingStatGrid>
            <ListingStatCard
              label="Total Bookings"
              value={stats.total}
              icon={<BarChart3 className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
            />
            <ListingStatCard
              label="Completed"
              value={stats.completed}
              icon={<TrendingUp className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white"
              meta={`${stats.total ? Math.round((stats.completed / stats.total) * 100) : 0}% of bookings`}
            />
            <ListingStatCard
              label="Booked Hours"
              value={formatHours(stats.bookedMinutes)}
              icon={<Timer className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-emerald-500 to-teal-500 text-white"
              meta="Excludes cancelled & rejected"
            />
            <ListingStatCard
              label="Avg Duration"
              value={`${stats.avgDurationMinutes} min`}
              icon={<Clock className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white"
            />
            <ListingStatCard
              label="Cancellation Rate"
              value={`${stats.cancellationRate}%`}
              icon={<XCircle className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-rose-500 to-red-500 text-white"
              meta={`${stats.cancelled} cancelled`}
            />
            <ListingStatCard
              label="Busiest Day"
              value={busiest ? formatDay(busiest.date) : "—"}
              icon={<CalendarDays className="h-5 w-5" />}
              toneClassName="bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white"
              meta={busiest ? `${busiest.count} bookings` : undefined}
            />
          </ListingStatGrid>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ListingPanel title="Studio usage" description="Hours held per studio.">
              <div className="space-y-3">
                {studioTotals.map((s) => (
                  <BarRow
                    key={s.studioId}
                    label={s.name}
                    value={s.count}
                    max={studioTotals[0]?.count || 1}
                    meta={formatHours(s.minutes)}
                  />
                ))}
              </div>
            </ListingPanel>

            <ListingPanel title="Bookings by type">
              <div className="space-y-3">
                {typeCounts.map((t) => (
                  <BarRow
                    key={t.key}
                    label={<span className="capitalize">{t.key}</span>}
                    value={t.count}
                    max={typeCounts[0]?.count || 1}
                    tone="from-violet-500 to-fuchsia-500"
                  />
                ))}
              </div>
            </ListingPanel>

            <ListingPanel title="Bookings by status">
              <div className="space-y-3">
                {statusCounts.map((s) => (
                  <BarRow
                    key={s.key}
                    label={
                      <Badge variant={studioStatusBadge(s.key)} className="capitalize">
                        {s.key}
                      </Badge>
                    }
                    value={s.count}
                    max={statusCounts[0]?.count || 1}
                    tone="from-sky-500 to-blue-500"
                  />
                ))}
              </div>
            </ListingPanel>

            <ListingPanel title="Crew leaderboard" description="Shoots credited per shooter.">
              {crew.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No crew recorded yet — shooters are captured when a booking is completed.
                </p>
              ) : (
                <div className="space-y-3">
                  {crew.slice(0, 8).map((c) => (
                    <BarRow
                      key={c.key}
                      label={
                        <span className="flex items-center gap-2">
                          {c.name}
                          {c.isExternal && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-600">external</span>
                          )}
                        </span>
                      }
                      value={c.shoots}
                      max={crew[0].shoots}
                      tone="from-emerald-500 to-teal-500"
                    />
                  ))}
                </div>
              )}
            </ListingPanel>
          </div>

          <ListingPanel title="Peak hours" description="Bookings running in each hour of the day.">
            <div className="flex items-end gap-1 overflow-x-auto pb-2">
              {hours.map((h) => (
                <div key={h.hour} className="flex min-w-[22px] flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-violet-500"
                      style={{ height: `${Math.round((h.count / maxHourCount) * 100)}%` }}
                      title={`${h.count} booking(s)`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{String(h.hour).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          </ListingPanel>

          <ListingPanel
            title="Completed bookings"
            description={`${completedRows.length} in this range.`}
            contentClassName="p-0 sm:p-0"
          >
            {completedRows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-400">Nothing completed in this range yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Studio</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Shot by</TableHead>
                      <TableHead>Card with</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedRows.slice(0, 25).map((r, idx) => (
                      <TableRow key={`${r.date}-${r.studio}-${idx}`}>
                        <TableCell>
                          <p className="text-xs">{formatDay(r.date)}</p>
                          <p className="text-xs text-slate-400">{r.time}</p>
                        </TableCell>
                        <TableCell>{r.studio}</TableCell>
                        <TableCell>{r.purpose || "—"}</TableCell>
                        <TableCell>{r.client || "—"}</TableCell>
                        <TableCell>{r.shooters || "—"}</TableCell>
                        <TableCell>{r.cardHolder || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ListingPanel>
        </>
      )}
    </div>
  );
}
