"use client";

import { useEffect, useState } from "react";
import { Plus, FileText } from "lucide-react";
import {
  getDocuments,
  createDocument,
  updateDocument,
  where,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/loading";
import { computeDepartmentMetrics, getPeriodRange } from "@/lib/report-aggregator";
import type { DepartmentReport, ReportPeriod } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-green-100 text-green-700",
};

export default function DepartmentReportsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [periodType, setPeriodType] = useState<ReportPeriod>("monthly");

  useEffect(() => {
    async function fetch() {
      try {
        const constraints = user?.role === "department-head"
          ? [where("departmentId", "==", user.departmentId), orderBy("createdAt", "desc")]
          : [orderBy("createdAt", "desc")];
        const data = await getDocuments<DepartmentReport>("department_reports", constraints);
        setReports(data);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, [user]);

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const range = getPeriodRange(periodType);
      const metrics = await computeDepartmentMetrics(user.departmentId!, range.start, range.end);
      await createDocument("department_reports", {
        departmentId: user.departmentId,
        departmentName: user.departmentId,
        companyId: user.companyId || "",
        period: periodType,
        startDate: range.start,
        endDate: range.end,
        autoMetrics: metrics,
        customKPIs: [],
        generatedBy: user.staffId,
        generatedByName: `${user.firstName} ${user.lastName}`,
        generatedAt: Timestamp.now(),
        status: "draft",
        createdAt: Timestamp.now(),
      });
      toast("success", "Report created as draft. Fill in details to submit.");
      const data = await getDocuments<DepartmentReport>("department_reports", [
        where("departmentId", "==", user.departmentId),
        orderBy("createdAt", "desc"),
      ]);
      setReports(data);
    } catch (error) {
      console.error("Create failed:", error);
      toast("error", "Failed to create report");
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = async (report: DepartmentReport) => {
    try {
      await updateDocument("department_reports", report.id!, {
        status: "published" as const,
        updatedAt: Timestamp.now(),
      });
      toast("success", "Report published");
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: "published" as const } : r));
    } catch {
      toast("error", "Failed to submit");
    }
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Department Reports"
        description="Generate and manage periodic department reports."
        action={
          user?.role === "department-head" ? (
            <div className="flex items-center gap-2">
              <Select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as ReportPeriod)}
                className="w-[140px]"
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                ]}
              />
              <Button onClick={handleCreate} disabled={creating}>
                <Plus className="h-4 w-4" /> Generate Report
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : reports.length === 0 ? (
        <Card><CardContent><EmptyState icon={<FileText className="h-12 w-12" />} title="No reports generated yet" /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-teal-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-slate-900">{report.departmentName}</h4>
                    <p className="text-xs text-slate-500 capitalize">
                      {report.period} • {report.startDate} to {report.endDate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_COLORS[report.status]} className="capitalize">
                    {report.status.replace(/-/g, " ")}
                  </Badge>
                  {report.status === "draft" && user?.role === "department-head" && (
                    <Button size="sm" onClick={() => handleSubmit(report)}>
                      Publish
                    </Button>
                  )}
                </div>
              </div>

              {/* Auto metrics summary */}
              {report.autoMetrics && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                    <p className="text-xs text-slate-500">Tasks Completed</p>
                    <p className="text-lg font-semibold text-slate-900">{report.autoMetrics.tasks.completed}/{report.autoMetrics.tasks.total}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                    <p className="text-xs text-slate-500">Overdue Tasks</p>
                    <p className="text-lg font-semibold text-orange-600">{report.autoMetrics.tasks.overdue}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                    <p className="text-xs text-slate-500">Hours Logged</p>
                    <p className="text-lg font-semibold text-slate-900">{report.autoMetrics.workLogs.totalHours}h</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3">
                    <p className="text-xs text-slate-500">Coverage Rate</p>
                    <p className="text-lg font-semibold text-slate-900">{report.autoMetrics.workLogs.coverageRate}%</p>
                  </div>
                </div>
              )}

              {report.remarks && (
                <p className="mt-3 text-sm text-slate-500">{report.remarks}</p>
              )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
