"use client";

import { useEffect, useState } from "react";
import { Plus, FileText, Edit2, X, Check } from "lucide-react";
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
import { computeDepartmentMetrics, getPeriodRange, computeStaffBreakdown } from "@/lib/report-aggregator";
import { createBulkNotifications } from "@/lib/notifications";
import type { DepartmentReport, ReportPeriod, StaffBreakdownEntry } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
};

export default function DepartmentReportsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [periodType, setPeriodType] = useState<ReportPeriod>("monthly");
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

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
      const staffBreakdown = periodType === "monthly" ? await computeStaffBreakdown(user.departmentId!, range.start, range.end) : undefined;
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
        staffBreakdown,
      });
      toast("success", "Report created as draft. Fill in details to submit.");
      const data = await getDocuments<DepartmentReport>("department_reports", [
        where("departmentId", "==", user.departmentId),
        orderBy("createdAt", "desc"),
      ]);
      setReports(data);
    } catch (error) {
      toast("error", "Failed to create report");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDraft = async (report: DepartmentReport) => {
    try {
      const updatedBreakdown = report.staffBreakdown?.map((entry) => ({
        ...entry,
        remarks: editingStaff[`${report.id}-${entry.staffId}`] || entry.remarks || "",
      }));
      await updateDocument("department_reports", report.id!, {
        staffBreakdown: updatedBreakdown,
        updatedAt: Timestamp.now(),
      });
      toast("success", "Draft saved");
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, staffBreakdown: updatedBreakdown } : r
        )
      );
      setEditingStaff({});
    } catch {
      toast("error", "Failed to save draft");
    }
  };

  const handleSubmitToAdmin = async (report: DepartmentReport) => {
    if (!user) return;
    setSubmitting((prev) => ({ ...prev, [report.id!]: true }));
    try {
      const updatedBreakdown = report.staffBreakdown?.map((entry) => ({
        ...entry,
        remarks: editingStaff[`${report.id}-${entry.staffId}`] || entry.remarks || "",
      }));
      await updateDocument("department_reports", report.id!, {
        status: "submitted" as const,
        staffBreakdown: updatedBreakdown,
        submittedAt: Timestamp.now(),
        submittedBy: user.staffId,
        updatedAt: Timestamp.now(),
      });
      const admins = await getDocuments("staff", [
        where("role", "==", "admin"),
        where("isActive", "==", true),
      ]);
      const adminIds = admins.map((a) => a.id || "").filter(Boolean);
      await createBulkNotifications(adminIds, {
        type: "system",
        title: "Monthly Report Submitted",
        message: `${report.departmentName} dept report for ${report.startDate} to ${report.endDate} submitted for approval.`,
        link: "/dashboard/reports/department",
      });
      toast("success", "Report submitted to admins");
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, status: "submitted" as const, staffBreakdown: updatedBreakdown, submittedAt: Timestamp.now(), submittedBy: user.staffId } : r
        )
      );
      setEditingStaff({});
    } catch {
      toast("error", "Failed to submit report");
    } finally {
      setSubmitting((prev) => ({ ...prev, [report.id!]: false }));
    }
  };

  const handlePublish = async (report: DepartmentReport) => {
    try {
      await updateDocument("department_reports", report.id!, {
        status: "published" as const,
        updatedAt: Timestamp.now(),
      });
      toast("success", "Report published");
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: "published" as const } : r));
    } catch {
      toast("error", "Failed to publish report");
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
                  <div className="flex items-start gap-3 flex-1">
                    <FileText className="h-5 w-5 text-teal-600 mt-0.5" />
                    <div className="flex-1">
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
                      <>
                        <Button size="sm" onClick={() => setExpandedReportId(expandedReportId === report.id ? null : (report.id || null))}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {report.status === "submitted" && user?.role === "admin" && (
                      <Button size="sm" onClick={() => handlePublish(report)}>
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

                {/* Staff breakdown table */}
                {expandedReportId === report.id && report.staffBreakdown && report.staffBreakdown.length > 0 && (
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Staff</th>
                          <th className="text-center px-3 py-2 font-semibold">Present</th>
                          <th className="text-center px-3 py-2 font-semibold">Late</th>
                          <th className="text-center px-3 py-2 font-semibold">Absent</th>
                          <th className="text-center px-3 py-2 font-semibold">Leaves</th>
                          <th className="text-center px-3 py-2 font-semibold">Tasks</th>
                          <th className="text-center px-3 py-2 font-semibold">Hrs</th>
                          <th className="text-left px-3 py-2 font-semibold">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.staffBreakdown.map((entry) => (
                          <tr key={entry.staffId} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-900">{entry.staffName}</td>
                            <td className="text-center px-3 py-2">{entry.attendance.present}</td>
                            <td className="text-center px-3 py-2 text-orange-600">{entry.attendance.late}</td>
                            <td className="text-center px-3 py-2 text-red-600">{entry.attendance.absent}</td>
                            <td className="text-center px-3 py-2 text-blue-600">{entry.attendance.leaves}</td>
                            <td className="text-center px-3 py-2">{entry.tasksCompleted}</td>
                            <td className="text-center px-3 py-2">{entry.workLogHours}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={editingStaff[`${report.id!}-${entry.staffId}`] ?? entry.remarks ?? ""}
                                onChange={(e) =>
                                  setEditingStaff((prev) => ({
                                    ...prev,
                                    [`${report.id!}-${entry.staffId}`]: e.target.value,
                                  }))
                                }
                                className="w-full px-2 py-1 border rounded text-xs"
                                placeholder="Add remark"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-4 flex gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => setExpandedReportId(null)}>
                        <X className="h-4 w-4 mr-1" /> Close
                      </Button>
                      <Button size="sm" onClick={() => handleSaveDraft(report)}>
                        <Check className="h-4 w-4 mr-1" /> Save Draft
                      </Button>
                      <Button size="sm" onClick={() => handleSubmitToAdmin(report)} disabled={submitting[report.id!]}>
                        Submit to Admin
                      </Button>
                    </div>
                  </div>
                )}

                {report.remarks && !expandedReportId && (
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
