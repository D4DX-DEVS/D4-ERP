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
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as ReportPeriod)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Generate Report
              </button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports generated yet.</p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="font-medium">{report.departmentName}</h4>
                    <p className="text-xs text-muted-foreground capitalize">
                      {report.period} • {report.startDate} to {report.endDate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_COLORS[report.status] || ""}`}>
                    {report.status.replace(/-/g, " ")}
                  </span>
                  {report.status === "draft" && user?.role === "department-head" && (
                    <button
                      onClick={() => handleSubmit(report)}
                      className="rounded px-3 py-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>

              {/* Auto metrics summary */}
              {report.autoMetrics && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Tasks Completed</p>
                    <p className="text-lg font-bold">{report.autoMetrics.tasks.completed}/{report.autoMetrics.tasks.total}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Overdue Tasks</p>
                    <p className="text-lg font-bold text-orange-600">{report.autoMetrics.tasks.overdue}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Hours Logged</p>
                    <p className="text-lg font-bold">{report.autoMetrics.workLogs.totalHours}h</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Coverage Rate</p>
                    <p className="text-lg font-bold">{report.autoMetrics.workLogs.coverageRate}%</p>
                  </div>
                </div>
              )}

              {report.remarks && (
                <p className="mt-3 text-sm text-muted-foreground">{report.remarks}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
