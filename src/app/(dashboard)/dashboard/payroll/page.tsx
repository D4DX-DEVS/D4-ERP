"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, updateDocument, where, orderBy, Timestamp } from "@/lib/firestore";
import { Staff, Payroll, Attendance, StaffRequest } from "@/types";
import { getAppSettings, isNonWorkingDay } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, Plus, CheckCircle, Clock, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { StatCard, StatGrid } from "@/components/ui/stat-card";

interface PayrollForm {
  staffId: string;
  basicSalary: number;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  overtimeHours: number;
  earnings: {
    basic: number;
    hra: number;
    da: number;
    overtime: number;
    bonus: number;
    allowances: number;
    other: number;
  };
  deductions: {
    pf: number;
    esi: number;
    tds: number;
    lop: number;
    advance: number;
    loanRecovery: number;
    otherDeductions: number;
  };
}

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<(Payroll & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<PayrollForm | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [savingPayroll, setSavingPayroll] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        getDocuments<Payroll>("payroll"),
        getDocuments<Staff>("staff"),
      ]);
      setPayrolls(p.sort((a, b) => (b.month > a.month ? 1 : -1)));
      setStaffList(s.filter((st) => st.status === "active"));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, []);

  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s]));

  const computePayrollData = async (staff: Staff & { id: string }, selectedMonth: string) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

    const [settings, attendance, overtimeRequests] = await Promise.all([
      getAppSettings(),
      getDocuments<Attendance>("attendance", [
        where("staffId", "==", staff.id),
        where("date", ">=", Timestamp.fromDate(monthStart)),
        where("date", "<=", Timestamp.fromDate(monthEnd)),
        orderBy("date", "asc"),
      ]),
      getDocuments<StaffRequest>("leaveRequests", [
        where("staffId", "==", staff.id),
        where("type", "==", "overtime"),
        where("status", "==", "approved"),
        where("startDate", ">=", Timestamp.fromDate(monthStart)),
        where("startDate", "<=", Timestamp.fromDate(monthEnd)),
      ]),
    ]);

    const liveAttendance = attendance.filter((r) => !r.isDeleted);
    const fullDayHours = settings.attendanceRules.fullDayHours || 8;

    // Calculate working days
    let workingDays = 0;
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      if (!isNonWorkingDay(settings, new Date(d), staff.companyId)) workingDays += 1;
    }
    if (workingDays === 0) workingDays = 26;

    // Calculate present/LOP days
    const presentLike = liveAttendance.filter(
      (r) => r.status === "present" || r.status === "late" || r.status === "wfh" || r.status === "on-duty"
    ).length;
    const halfDays = liveAttendance.filter((r) => r.status === "half-day").length;
    const leaveDays = liveAttendance.filter((r) => r.status === "leave").length;
    const effectivePresent = presentLike + halfDays * 0.5;
    const presentDays = Math.round(effectivePresent * 10) / 10;
    const lopDays = Math.max(0, Math.round((workingDays - effectivePresent - leaveDays) * 10) / 10);

    // Calculate overtime hours
    let overtimeHours = Math.round(liveAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0) * 10) / 10;
    for (const req of overtimeRequests) {
      const start = new Date(req.startDate.seconds * 1000);
      const end = new Date(req.endDate.seconds * 1000);
      if (req.startTime && req.endTime) {
        const [startH, startMin] = req.startTime.split(":").map(Number);
        const [endH, endMin] = req.endTime.split(":").map(Number);
        const hours = (endH * 60 + endMin - (startH * 60 + startMin)) / 60;
        overtimeHours += Math.round(hours * 10) / 10;
      } else {
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
        overtimeHours += days * fullDayHours;
      }
    }

    const basicSalary = staff.currentSalary || 0;
    const perDayRate = basicSalary / workingDays;

    // Compute all earnings and deductions
    const earnings = {
      basic: basicSalary,
      hra: Math.round(basicSalary * 0.4),
      da: Math.round(basicSalary * 0.1),
      overtime: Math.round((perDayRate / 8) * overtimeHours),
      bonus: 0,
      allowances: 0,
      other: 0,
    };

    const deductions = {
      pf: Math.round(basicSalary * 0.12),
      esi: basicSalary <= 21000 ? Math.round(basicSalary * 0.0075) : 0,
      tds: basicSalary > 50000 ? Math.round(basicSalary * 0.1) : 0,
      lop: Math.round(perDayRate * lopDays),
      advance: 0,
      loanRecovery: 0,
      otherDeductions: 0,
    };

    return {
      staffId: staff.id,
      basicSalary,
      workingDays,
      presentDays,
      lopDays,
      overtimeHours,
      earnings,
      deductions,
    };
  };

  const handleGenerateForAll = async () => {
    setGenerating(true);
    try {
      const [y, m] = month.split("-").map(Number);
      const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

      for (const staff of staffList) {
        const payrollData = await computePayrollData(staff, month);
        const totalEarnings = Object.values(payrollData.earnings).reduce((a, b) => a + b, 0);
        const totalDeductions = Object.values(payrollData.deductions).reduce((a, b) => a + b, 0);
        const netSalary = totalEarnings - totalDeductions;

        await createDocument("payroll", {
          staffId: payrollData.staffId,
          month: month,
          basicSalary: payrollData.basicSalary,
          earnings: payrollData.earnings,
          deductions: payrollData.deductions,
          totalEarnings,
          totalDeductions,
          netSalary,
          status: "draft",
          workingDays: payrollData.workingDays,
          presentDays: payrollData.presentDays,
          lopDays: payrollData.lopDays,
          overtimeHours: payrollData.overtimeHours,
          createdAt: Timestamp.now(),
        });
      }
      setShowGenerate(false);
      toast("success", `Payroll generated for ${staffList.length} staff`);
      fetchData();
    } catch (error) {
      toast("error", "Failed to generate payroll");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = handleGenerateForAll;

  const handleMarkPaid = async (id: string) => {
    try {
      await updateDocument("payroll", id, {
        status: "paid",
        paidDate: Timestamp.now(),
      });
      toast("success", "Marked as paid");
      fetchData();
    } catch (error) {
      toast("error", "Failed to update payroll");
    }
  };

  const handleSavePayrollEdit = async () => {
    if (!editingPayroll) return;
    setSavingPayroll(true);
    try {
      const existingPayroll = payrolls.find((p) => p.staffId === editingPayroll.staffId && p.month === month);
      if (!existingPayroll) {
        toast("error", "Payroll record not found");
        return;
      }

      const totalEarnings = Object.values(editingPayroll.earnings).reduce((a, b) => a + b, 0);
      const totalDeductions = Object.values(editingPayroll.deductions).reduce((a, b) => a + b, 0);
      const netSalary = totalEarnings - totalDeductions;

      await updateDocument("payroll", existingPayroll.id, {
        earnings: editingPayroll.earnings,
        deductions: editingPayroll.deductions,
        totalEarnings,
        totalDeductions,
        netSalary,
        workingDays: editingPayroll.workingDays,
        presentDays: editingPayroll.presentDays,
        lopDays: editingPayroll.lopDays,
        overtimeHours: editingPayroll.overtimeHours,
      });

      toast("success", "Payroll updated");
      setShowEditDialog(false);
      setEditingPayroll(null);
      fetchData();
    } catch (error) {
      toast("error", "Failed to save payroll");
    } finally {
      setSavingPayroll(false);
    }
  };

  const filtered = payrolls.filter((p) => p.month === month);
  const totalNet = filtered.reduce((sum, p) => sum + (p.netSalary || 0), 0);
  const paidCount = filtered.filter((p) => p.status === "paid").length;
  const draftCount = filtered.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payroll</h1>
        <div className="flex items-center gap-3">
          <DatePicker mode="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
          <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Generate Payroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate Payroll</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Month</Label>
                  <DatePicker mode="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <p className="text-sm text-gray-500">
                  This will generate salary slips for {staffList.length} active staff members for {month}.
                </p>
                <Button onClick={handleGenerate} disabled={generating} className="w-full">
                  {generating ? "Generating..." : `Generate for ${staffList.length} Staff`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary */}
      <StatGrid cols={3}>
        <StatCard
          title="Total Payable"
          value={formatCurrency(totalNet)}
          icon={DollarSign}
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          title="Paid"
          value={paidCount}
          icon={CheckCircle}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          title="Pending"
          value={draftCount}
          icon={Clock}
          color="text-orange-600"
          bg="bg-orange-50"
        />
      </StatGrid>

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No payroll records"
              description={`No salary slips for ${month}. Click Generate Payroll to create.`}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Salary Slips — {month}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Basic</TableHead>
                  <TableHead>Earnings</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/payroll/staff/${p.staffId}`} className="text-teal-600 hover:text-teal-700 flex items-center gap-1">
                        {staffMap[p.staffId]
                          ? `${staffMap[p.staffId].firstName} ${staffMap[p.staffId].lastName}`
                          : p.staffId}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                    <TableCell>{formatCurrency(p.basicSalary || p.baseSalary)}</TableCell>
                    <TableCell className="text-green-600">{formatCurrency(p.totalEarnings)}</TableCell>
                    <TableCell className="text-red-600">{formatCurrency(p.totalDeductions)}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(p.netSalary)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {p.status === "draft" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingPayroll({
                              staffId: p.staffId,
                              basicSalary: p.basicSalary || 0,
                              workingDays: p.workingDays,
                              presentDays: p.presentDays,
                              lopDays: p.lopDays,
                              overtimeHours: p.overtimeHours,
                              earnings: {
                                basic: p.earnings.basic ?? p.basicSalary ?? 0,
                                hra: p.earnings.hra ?? 0,
                                da: p.earnings.da ?? 0,
                                overtime: p.earnings.overtime ?? 0,
                                bonus: p.earnings.bonus ?? 0,
                                allowances: p.earnings.allowances ?? 0,
                                other: p.earnings.other ?? 0,
                              },
                              deductions: {
                                pf: p.deductions.pf ?? 0,
                                esi: p.deductions.esi ?? 0,
                                tds: p.deductions.tds ?? 0,
                                lop: p.deductions.lop ?? 0,
                                advance: p.deductions.advance ?? 0,
                                loanRecovery: p.deductions.loanRecovery ?? 0,
                                otherDeductions: p.deductions.otherDeductions ?? 0,
                              },
                            });
                            setShowEditDialog(true);
                          }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)}>
                            Mark Paid
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Payroll Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>Edit Payroll Details</DialogTitle></DialogHeader>
          {editingPayroll && (
            <div className="space-y-6">
              {/* Day & Hour Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Working Days</Label>
                  <Input type="number" value={editingPayroll.workingDays} onChange={(e) => setEditingPayroll({ ...editingPayroll, workingDays: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Present Days</Label>
                  <Input type="number" step="0.5" value={editingPayroll.presentDays} onChange={(e) => setEditingPayroll({ ...editingPayroll, presentDays: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>LOP Days</Label>
                  <Input type="number" step="0.5" value={editingPayroll.lopDays} onChange={(e) => setEditingPayroll({ ...editingPayroll, lopDays: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Overtime Hours</Label>
                  <Input type="number" step="0.5" value={editingPayroll.overtimeHours} onChange={(e) => setEditingPayroll({ ...editingPayroll, overtimeHours: Number(e.target.value) })} />
                </div>
              </div>

              {/* Earnings */}
              <div>
                <h3 className="font-semibold mb-3 text-green-700">Earnings</h3>
                <div className="grid grid-cols-2 gap-4 bg-green-50 p-4 rounded-lg">
                  {Object.entries(editingPayroll.earnings).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs capitalize">{key}</Label>
                      <Input type="number" value={value} onChange={(e) => setEditingPayroll({ ...editingPayroll, earnings: { ...editingPayroll.earnings, [key]: Number(e.target.value) } })} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Deductions */}
              <div>
                <h3 className="font-semibold mb-3 text-red-700">Deductions</h3>
                <div className="grid grid-cols-2 gap-4 bg-red-50 p-4 rounded-lg">
                  {Object.entries(editingPayroll.deductions).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs capitalize">{key}</Label>
                      <Input type="number" value={value} onChange={(e) => setEditingPayroll({ ...editingPayroll, deductions: { ...editingPayroll.deductions, [key]: Number(e.target.value) } })} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Total Earnings</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(Object.values(editingPayroll.earnings).reduce((a, b) => a + b, 0))}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-600">Total Deductions</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(Object.values(editingPayroll.deductions).reduce((a, b) => a + b, 0))}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-gray-600">Net Salary</p>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(Object.values(editingPayroll.earnings).reduce((a, b) => a + b, 0) - Object.values(editingPayroll.deductions).reduce((a, b) => a + b, 0))}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button onClick={handleSavePayrollEdit} disabled={savingPayroll}>{savingPayroll ? "Saving..." : "Save Changes"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
