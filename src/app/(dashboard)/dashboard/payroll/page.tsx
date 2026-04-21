"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, updateDocument, where, Timestamp } from "@/lib/firestore";
import { Staff, Payroll } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, Plus, FileText, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<(Payroll & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);
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

  useEffect(() => { fetchData(); }, []);

  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s]));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      for (const staff of staffList) {
        const basicSalary = staff.currentSalary || 0;
        const hra = Math.round(basicSalary * 0.4);
        const da = Math.round(basicSalary * 0.1);
        const pf = Math.round(basicSalary * 0.12);
        const esi = basicSalary <= 21000 ? Math.round(basicSalary * 0.0075) : 0;
        const tds = basicSalary > 50000 ? Math.round(basicSalary * 0.1) : 0;
        const totalEarnings = basicSalary + hra + da;
        const totalDeductions = pf + esi + tds;
        const netSalary = totalEarnings - totalDeductions;

        const payrollData: Record<string, unknown> = {
          staffId: staff.id,
          month: month,
          basicSalary,
          earnings: { hra, da, allowances: 0, overtime: 0 },
          deductions: { pf, esi, tds, loanRecovery: 0, otherDeductions: 0 },
          totalEarnings,
          totalDeductions,
          netSalary,
          status: "draft",
          workingDays: 26,
          presentDays: 26,
          leaveDays: 0,
          createdAt: Timestamp.now(),
        };

        await createDocument("payroll", payrollData);
      }
      setShowGenerate(false);
      toast("success", `Payroll generated for ${staffList.length} staff`);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to generate payroll");
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await updateDocument("payroll", id, {
        status: "paid",
        paidDate: Timestamp.now(),
      });
      toast("success", "Marked as paid");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update payroll");
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
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
          <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Generate Payroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate Payroll</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Month</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-xs text-gray-500">Total Payable</p>
              <p className="text-xl font-bold">{formatCurrency(totalNet)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-xs text-gray-500">Paid</p>
              <p className="text-xl font-bold">{paidCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-xl font-bold">{draftCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>Salary Slips — {month}</CardTitle></CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-gray-500">No payroll records for this month. Click Generate Payroll to create.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Staff</th>
                      <th className="pb-2 font-medium">Basic</th>
                      <th className="pb-2 font-medium">Earnings</th>
                      <th className="pb-2 font-medium">Deductions</th>
                      <th className="pb-2 font-medium">Net Salary</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2">{staffMap[p.staffId] ? `${staffMap[p.staffId].firstName} ${staffMap[p.staffId].lastName}` : p.staffId}</td>
                        <td>{formatCurrency(p.basicSalary || p.baseSalary)}</td>
                        <td className="text-green-600">{formatCurrency(p.totalEarnings)}</td>
                        <td className="text-red-600">{formatCurrency(p.totalDeductions)}</td>
                        <td className="font-bold">{formatCurrency(p.netSalary)}</td>
                        <td>
                          <Badge variant={p.status === "paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}>
                            {p.status}
                          </Badge>
                        </td>
                        <td>
                          {p.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)}>
                              Mark Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
