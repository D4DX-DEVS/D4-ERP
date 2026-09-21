"use client";

import { useEffect, useMemo, useState } from "react";
import { getDocuments, updateDocument, orderBy, Timestamp } from "@/lib/firestore";
import { ListingHeader, ListingPanel, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { BarChart3, Building2, ChevronDown, ChevronRight, FileText, Inbox, TrendingUp } from "lucide-react";
import type { DepartmentReport } from "@/types";

const PLAN_STATUS_COLORS: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  "in-progress": "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  dropped: "bg-orange-100 text-orange-700",
};

/** "2026-09" from a report's start date, the period the roll-up groups by. */
function monthOf(report: DepartmentReport): string {
  return (report.startDate || "").slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key || "All periods";
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function CompanyReportPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("");

  useEffect(() => {
    async function fetch() {
      try {
        const data = await getDocuments<DepartmentReport>("department_reports", [orderBy("createdAt", "desc")]);
        setReports(data);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  // Periods that actually have reports, newest first; "" means every period.
  const monthOptions = useMemo(() => {
    const keys = [...new Set(reports.map(monthOf).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    return [{ value: "", label: "All periods" }, ...keys.map((k) => ({ value: k, label: monthLabel(k) }))];
  }, [reports]);

  const scoped = useMemo(
    () => (month ? reports.filter((r) => monthOf(r) === month) : reports),
    [reports, month]
  );

  const pending = scoped.filter((r) => r.status === "submitted");
  const published = scoped.filter((r) => r.status === "published");
  const departments = new Set(scoped.map((r) => r.departmentId));

  // Company totals read from the published set: the signed-off numbers only.
  const totals = useMemo(() => {
    const tasks = published.reduce((s, r) => s + (r.autoMetrics?.tasks?.total || 0), 0);
    const completed = published.reduce((s, r) => s + (r.autoMetrics?.tasks?.completed || 0), 0);
    const overdue = published.reduce((s, r) => s + (r.autoMetrics?.tasks?.overdue || 0), 0);
    const hours = published.reduce((s, r) => s + (r.autoMetrics?.workLogs?.totalHours || 0), 0);
    const goals = published.reduce((s, r) => s + (r.planItems?.length || 0), 0);
    return {
      tasks,
      completed,
      overdue,
      hours: Math.round(hours * 10) / 10,
      goals,
      completion: tasks > 0 ? Math.round((completed / tasks) * 100) : 0,
    };
  }, [published]);

  async function handlePublish(report: DepartmentReport) {
    setPublishing((prev) => ({ ...prev, [report.id!]: true }));
    try {
      await updateDocument("department_reports", report.id!, {
        status: "published" as const,
        updatedAt: Timestamp.now(),
      });
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: "published" as const } : r)));
      toast("success", `${report.departmentName} published into the final report`);
    } catch {
      toast("error", "Failed to publish report");
    } finally {
      setPublishing((prev) => ({ ...prev, [report.id!]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Final Report"
        description="Every department's month, signed off and rolled up."
        action={
          <Select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-[190px]"
            options={monthOptions}
          />
        }
      />

      <ListingStatGrid>
        <ListingStatCard label="Departments" value={departments.size} icon={<Building2 className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-indigo-500 to-violet-600 text-white" />
        <ListingStatCard label="Awaiting approval" value={pending.length} icon={<Inbox className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" meta={pending.length ? "Publish to include in totals" : undefined} />
        <ListingStatCard label="Hours logged" value={`${totals.hours}h`} icon={<BarChart3 className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" meta="Published only" />
        <ListingStatCard label="Task completion" value={`${totals.completion}%`} icon={<TrendingUp className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" meta={`${totals.completed}/${totals.tasks} · ${totals.overdue} overdue`} />
      </ListingStatGrid>

      {/* Submissions waiting on the admin. Without this the heads' reports sat
          unseen unless someone opened the department page. */}
      {pending.length > 0 ? (
        <ListingPanel
          title={`Awaiting your approval (${pending.length})`}
          description="Submitted by department heads. Publishing folds a report into the final numbers below."
          contentClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="hidden sm:table-cell">Submitted by</TableHead>
                <TableHead className="text-center">Goals filed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-950">{r.departmentName}</TableCell>
                  <TableCell className="capitalize">
                    {r.period} · {r.startDate} to {r.endDate}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-slate-600">{r.generatedByName ?? "—"}</TableCell>
                  <TableCell className="text-center">{r.planItems?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => handlePublish(r)} disabled={publishing[r.id!]}>
                      {publishing[r.id!] ? "Publishing…" : "Publish"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListingPanel>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : published.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No published department reports yet"
              description="A department head files a report, you publish it, and it lands here as part of the month's final report."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {published.map((r) => {
            const open = expanded === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="p-5">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setExpanded(open ? null : r.id || null)}
                  >
                    <div>
                      <h4 className="font-semibold text-slate-900">{r.departmentName}</h4>
                      <p className="text-xs capitalize text-slate-500">
                        {r.period} · {r.startDate} to {r.endDate} · filed by {r.generatedByName ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="bg-emerald-100 text-emerald-700">Published</Badge>
                      {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </div>
                  </button>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                      <p className="text-xs text-slate-500">Tasks</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {r.autoMetrics?.tasks?.completed ?? 0}/{r.autoMetrics?.tasks?.total ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                      <p className="text-xs text-slate-500">Overdue</p>
                      <p className="text-lg font-semibold text-orange-600">{r.autoMetrics?.tasks?.overdue ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                      <p className="text-xs text-slate-500">Hours</p>
                      <p className="text-lg font-semibold text-slate-900">{r.autoMetrics?.workLogs?.totalHours ?? 0}h</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                      <p className="text-xs text-slate-500">Coverage</p>
                      <p className="text-lg font-semibold text-slate-900">{r.autoMetrics?.workLogs?.coverageRate ?? 0}%</p>
                    </div>
                  </div>

                  {/* The plan is the half of the report the admin acts on, so it
                      shows without expanding. */}
                  {r.planSummary || (r.planItems?.length ?? 0) > 0 ? (
                    <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Plan for the next period</p>
                      {r.planSummary ? (
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.planSummary}</p>
                      ) : null}
                      {r.planItems?.length ? (
                        <ul className="mt-3 space-y-2">
                          {r.planItems.map((item) => (
                            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm">
                              <span className="font-medium text-slate-900">{item.goal}</span>
                              {item.owner ? <span className="text-slate-500">· {item.owner}</span> : null}
                              {item.targetDate ? <span className="text-slate-500">· by {item.targetDate}</span> : null}
                              <Badge variant={PLAN_STATUS_COLORS[item.status ?? "planned"]} className="ml-auto capitalize">
                                {(item.status ?? "planned").replace(/-/g, " ")}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {open ? (
                    <div className="mt-4 space-y-4">
                      {r.customKPIs?.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom KPIs</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {r.customKPIs.map((kpi, idx) => (
                              <div key={idx} className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm">
                                <span className="text-slate-500">{kpi.label}</span>
                                <span className="ml-2 font-semibold text-slate-900">
                                  {kpi.value}
                                  {kpi.target ? ` / ${kpi.target}` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {r.staffBreakdown?.length ? (
                        <div className="overflow-x-auto">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Staff breakdown</p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Staff</TableHead>
                                <TableHead className="text-center">Present</TableHead>
                                <TableHead className="text-center">Late</TableHead>
                                <TableHead className="text-center">Absent</TableHead>
                                <TableHead className="hidden text-center sm:table-cell">Tasks</TableHead>
                                <TableHead className="hidden text-center sm:table-cell">Hours</TableHead>
                                <TableHead className="hidden sm:table-cell">Remarks</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.staffBreakdown.map((entry) => (
                                <TableRow key={entry.staffId}>
                                  <TableCell className="font-medium text-slate-950">{entry.staffName}</TableCell>
                                  <TableCell className="text-center">{entry.attendance.present}</TableCell>
                                  <TableCell className="text-center text-orange-600">{entry.attendance.late}</TableCell>
                                  <TableCell className="text-center text-red-600">{entry.attendance.absent}</TableCell>
                                  <TableCell className="hidden text-center sm:table-cell">{entry.tasksCompleted}</TableCell>
                                  <TableCell className="hidden text-center sm:table-cell">{entry.workLogHours}</TableCell>
                                  <TableCell className="hidden text-slate-600 sm:table-cell">{entry.remarks || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">No staff breakdown was filed with this report.</p>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
