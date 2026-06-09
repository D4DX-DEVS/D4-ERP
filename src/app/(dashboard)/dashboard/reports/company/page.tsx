"use client";

import { useEffect, useState } from "react";
import { getDocuments, orderBy } from "@/lib/firestore";
import { ListingHeader, ListingStatGrid, ListingStatCard } from "@/components/ui/listing";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/loading";
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
        <ListingStatCard label="Departments" value={departments.size} icon={<Building2 className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-teal-500 to-emerald-500 text-white" />
        <ListingStatCard label="Published Reports" value={published.length} icon={<FileText className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-sky-500 to-blue-500 text-white" />
        <ListingStatCard label="Total Hours" value={`${totalHours}h`} icon={<BarChart3 className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-amber-500 to-orange-500 text-white" />
        <ListingStatCard label="Task Completion" value={`${avgCompletion}%`} icon={<TrendingUp className="h-5 w-5" />} toneClassName="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" />
      </ListingStatGrid>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : published.length === 0 ? (
        <Card><CardContent><EmptyState icon={<FileText className="h-12 w-12" />} title="No published department reports yet" /></CardContent></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Coverage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {published.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">{r.departmentName}</TableCell>
                  <TableCell className="capitalize">{r.period} ({r.startDate})</TableCell>
                  <TableCell>{r.autoMetrics?.tasks?.completed}/{r.autoMetrics?.tasks?.total}</TableCell>
                  <TableCell>{r.autoMetrics?.workLogs?.totalHours}h</TableCell>
                  <TableCell>{r.autoMetrics?.workLogs?.coverageRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
