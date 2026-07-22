"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDocument, getDocuments, getSubDocuments, where, orderBy, Timestamp } from "@/lib/firestore";
import { Staff, Payroll, Department, Company, SalaryHistory } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeft, Calendar, DollarSign, Clock, History } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { hasFeature } from "@/lib/permissions";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

export default function StaffPayrollDossierPage() {
  const base = useWorkspaceBase();
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;

  const { user: currentUser } = useAuthStore();
  const [staff, setStaff] = useState<(Staff & { id: string }) | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [payrolls, setPayrolls] = useState<(Payroll & { id: string })[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<(SalaryHistory & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const { toast } = useToast();

  const fetchData = async () => {
    try {
      // Check access: admin/accounts role, or an explicit payroll grant.
      if (!currentUser || !(["admin", "accounts"].includes(currentUser.role) || hasFeature(currentUser, "payroll"))) {
        router.push(base === "/staff-portal" ? "/staff-portal" : "/dashboard");
        return;
      }

      const staffData = await getDocument<Staff>("staff", staffId);
      if (!staffData) {
        router.push(`${base}/payroll`);
        return;
      }
      setStaff(staffData);

      const [dept, comp, payrollList, salHist] = await Promise.all([
        staffData.departmentId ? getDocument<Department>("departments", staffData.departmentId) : null,
        staffData.companyId ? getDocument<Company>("companies", staffData.companyId) : null,
        getDocuments<Payroll>("payroll", [where("staffId", "==", staffId), orderBy("month", "desc")]),
        getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
      ]);

      setDepartment(dept ?? null);
      setCompany(comp ?? null);
      setPayrolls(payrollList);
      setSalaryHistory(salHist);
    } catch (error) {
      toast("error", "Failed to load staff payroll dossier");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  if (loading) return <PageLoader />;
  if (!staff) return null;

  const yearPayrolls = payrolls.filter((p) => {
    const payrollYear = typeof p.month === "string" ? parseInt(p.month.split("-")[0]) : (p.year || year);
    return payrollYear === year;
  }).sort((a, b) => {
    const monthA = typeof a.month === "string" ? parseInt(a.month.split("-")[1]) : 0;
    const monthB = typeof b.month === "string" ? parseInt(b.month.split("-")[1]) : 0;
    return monthA - monthB;
  });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Calculate year totals
  const yearTotals = {
    netPaid: yearPayrolls.filter((p) => p.status === "paid").reduce((sum, p) => sum + (p.netSalary || 0), 0),
    lopDays: yearPayrolls.reduce((sum, p) => sum + (p.lopDays || 0), 0),
    overtimeHours: yearPayrolls.reduce((sum, p) => sum + (p.overtimeHours || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Payroll Dossier</h1>
            <Badge>{staff.status}</Badge>
          </div>
          <p className="text-gray-600">{staff.firstName} {staff.lastName} • {staff.designation}</p>
          <p className="text-sm text-gray-500 mt-1">
            {department?.name} • {company?.name}
          </p>
        </div>
      </div>

      {/* Year Selector */}
      <div className="flex gap-4 items-center">
        <Label className="text-sm font-medium">Year</Label>
        <Select
          value={year.toString()}
          onChange={(e) => setYear(parseInt(e.target.value))}
          options={Array.from({ length: 5 }, (_, i) => {
            const y = new Date().getFullYear() - 2 + i;
            return { value: y.toString(), label: y.toString() };
          })}
        />
      </div>

      {/* Monthly Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Payroll — {year}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Present Days</TableHead>
                <TableHead>LOP Days</TableHead>
                <TableHead>OT Hours</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => {
                const payroll = yearPayrolls.find((p) => {
                  const payMonth = typeof p.month === "string" ? parseInt(p.month.split("-")[1]) : 0;
                  return payMonth === m;
                });
                return (
                  <TableRow key={m} className={!payroll ? "bg-gray-50" : ""}>
                    <TableCell className="font-medium">{monthNames[m - 1]}</TableCell>
                    <TableCell>{payroll?.workingDays || "—"}</TableCell>
                    <TableCell>{payroll?.presentDays || "—"}</TableCell>
                    <TableCell>{payroll?.lopDays || "—"}</TableCell>
                    <TableCell>{payroll?.overtimeHours || "—"}</TableCell>
                    <TableCell>{payroll ? formatCurrency(payroll.totalEarnings) : "—"}</TableCell>
                    <TableCell>{payroll ? formatCurrency(payroll.totalDeductions) : "—"}</TableCell>
                    <TableCell className="font-bold">{payroll ? formatCurrency(payroll.netSalary) : "—"}</TableCell>
                    <TableCell>
                      {payroll && (
                        <Badge variant={payroll.status === "paid" ? "bg-green-100 text-green-700" : payroll.status === "processed" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}>
                          {payroll.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {payroll && (
                        <Button size="sm" variant="ghost" onClick={() => {
                          // Show payslip breakdown
                          router.push(`${base}/payroll/staff/${staffId}/payslip?month=${payroll.month}`);
                        }}>
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Year Totals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <DollarSign className="h-5 w-5 text-green-600 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Net Paid (Year)</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(yearTotals.netPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-orange-600 mt-1" />
              <div>
                <p className="text-sm text-gray-500">LOP Days (Year)</p>
                <p className="text-2xl font-bold text-orange-600">{yearTotals.lopDays.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-blue-600 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Overtime Hours (Year)</p>
                <p className="text-2xl font-bold text-blue-600">{yearTotals.overtimeHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salary History */}
      {salaryHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Salary Revision History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salaryHistory.map((entry) => (
                <div key={entry.id} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium capitalize">{entry.type}</p>
                    <p className="text-xs text-gray-500">{entry.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {entry.effectiveDate ? formatDate(new Date(entry.effectiveDate.seconds * 1000)) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">{formatCurrency(entry.newSalary)}</p>
                    <p className="text-xs text-gray-500">
                      {entry.previousSalary ? `from ${formatCurrency(entry.previousSalary)}` : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium text-gray-700 ${className || ""}`}>{children}</label>;
}
