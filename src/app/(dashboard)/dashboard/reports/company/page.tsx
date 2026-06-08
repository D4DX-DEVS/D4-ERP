"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { BarChart3, Building2, FileText, TrendingUp } from "lucide-react";
import type { DepartmentReport } from "@/types";

export default function CompanyReportPage() {
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [loading, setLoading] = useState(true);

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

  const published = reports.filter((r) => r.status === "published");
  const departments = new Set(reports.map((r) => r.departmentId));

  // Aggregate metrics across departments
  const totalTasks = published.reduce((s, r) => s + (r.autoMetrics?.tasks?.total || 0), 0);
  const completedTasks = published.reduce((s, r) => s + (r.autoMetrics?.tasks?.completed || 0), 0);
  const totalHours = published.reduce((s, r) => s + (r.autoMetrics?.workLogs?.totalHours || 0), 0);
  const avgCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <ListingHeader title="Company Report" description="Aggregated metrics across all departments." />

      <ListingStatGrid>
        <ListingStatCard label="Departments" value={departments.size} icon={<Building2 className="h-5 w-5" />} />
        <ListingStatCard label="Published Reports" value={published.length} icon={<FileText className="h-5 w-5" />} />
        <ListingStatCard label="Total Hours" value={`${totalHours}h`} icon={<BarChart3 className="h-5 w-5" />} />
        <ListingStatCard label="Task Completion" value={`${avgCompletion}%`} icon={<TrendingUp className="h-5 w-5" />} />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : published.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published department reports yet.</p>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-left px-4 py-3 font-medium">Period</th>
                <th className="text-left px-4 py-3 font-medium">Tasks</th>
                <th className="text-left px-4 py-3 font-medium">Hours</th>
                <th className="text-left px-4 py-3 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {published.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{r.departmentName}</td>
                  <td className="px-4 py-3 capitalize">{r.period} ({r.startDate})</td>
                  <td className="px-4 py-3">{r.autoMetrics?.tasks?.completed}/{r.autoMetrics?.tasks?.total}</td>
                  <td className="px-4 py-3">{r.autoMetrics?.workLogs?.totalHours}h</td>
                  <td className="px-4 py-3">{r.autoMetrics?.workLogs?.coverageRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
