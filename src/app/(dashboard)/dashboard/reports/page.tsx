"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useEffect, useState } from "react";
import { getDocuments } from "@/lib/firestore";
import { Staff, Transaction, Invoice, LeaveRequest, Attendance } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  Users, IndianRupee, FileText, Calendar,
  TrendingUp, TrendingDown, Clock, UserCheck,
  BarChart3, PieChart,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { StatCard, StatGrid } from "@/components/ui/stat-card";

export default function ReportsPage() {
  const base = useWorkspaceBase();
  const [stats, setStats] = useState({
    totalStaff: 0,
    activeStaff: 0,
    totalIncome: 0,
    totalExpense: 0,
    totalInvoiceAmount: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    pendingLeaves: 0,
    approvedLeaves: 0,
    avgAttendance: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [staff, transactions, invoices, leaves, attendance] = await Promise.all([
          getDocuments<Staff>("staff"),
          getDocuments<Transaction>("transactions"),
          getDocuments<Invoice>("invoices"),
          getDocuments<LeaveRequest>("leave_requests"),
          getDocuments<Attendance>("attendance"),
        ]);

        const activeStaff = staff.filter((s) => s.status === "active");
        const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
        const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
        const realInvoices = invoices.filter((i) => i.type === "invoice");
        const totalInvAmt = realInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
        const paid = realInvoices.filter((i) => i.status === "paid").length;
        const unpaid = realInvoices.filter((i) => ["sent", "overdue"].includes(i.status)).length;
        const pendingL = leaves.filter((l) => l.status === "pending").length;
        const approvedL = leaves.filter((l) => l.status === "approved").length;

        setStats({
          totalStaff: staff.length,
          activeStaff: activeStaff.length,
          totalIncome: income,
          totalExpense: expense,
          totalInvoiceAmount: totalInvAmt,
          paidInvoices: paid,
          unpaidInvoices: unpaid,
          pendingLeaves: pendingL,
          approvedLeaves: approvedL,
          avgAttendance: activeStaff.length > 0 ? Math.round((attendance.length / activeStaff.length) * 100) / 100 : 0,
        });
      } catch (error) {
        console.error("Error:", error);
        toast("error", "Failed to load report data");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const profitLoss = stats.totalIncome - stats.totalExpense;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports & Analytics</h1>

      {/* Financial Overview */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Financial Overview</h2>
        <StatGrid cols={4}>
          <StatCard
            title="Total Income"
            value={formatCurrency(stats.totalIncome)}
            icon={TrendingUp}
            color="text-green-600"
            bg="bg-green-50"
          />
          <StatCard
            title="Total Expense"
            value={formatCurrency(stats.totalExpense)}
            icon={TrendingDown}
            color="text-red-600"
            bg="bg-red-50"
          />
          <StatCard
            title="Profit / Loss"
            value={formatCurrency(profitLoss)}
            icon={IndianRupee}
            color={profitLoss >= 0 ? "text-green-600" : "text-red-600"}
            bg={profitLoss >= 0 ? "bg-green-50" : "bg-red-50"}
          />
          <StatCard
            title="Total Invoiced"
            value={formatCurrency(stats.totalInvoiceAmount)}
            icon={FileText}
            color="text-purple-600"
            bg="bg-purple-50"
          />
        </StatGrid>
      </div>

      {/* Staff & HR */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Staff & HR</h2>
        <StatGrid cols={4}>
          <StatCard
            title="Total Staff"
            value={stats.totalStaff}
            icon={Users}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <StatCard
            title="Active Staff"
            value={stats.activeStaff}
            icon={UserCheck}
            color="text-green-600"
            bg="bg-green-50"
          />
          <StatCard
            title="Pending Leaves"
            value={stats.pendingLeaves}
            icon={Clock}
            color="text-orange-600"
            bg="bg-orange-50"
          />
          <StatCard
            title="Approved Leaves"
            value={stats.approvedLeaves}
            icon={Calendar}
            color="text-teal-600"
            bg="bg-teal-50"
          />
        </StatGrid>
      </div>

      {/* Invoice Breakdown */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Invoices</h2>
        <StatGrid cols={3}>
          <StatCard
            title="Paid Invoices"
            value={stats.paidInvoices}
            icon={BarChart3}
            color="text-green-600"
            bg="bg-green-50"
          />
          <StatCard
            title="Unpaid Invoices"
            value={stats.unpaidInvoices}
            icon={PieChart}
            color="text-red-600"
            bg="bg-red-50"
          />
          <StatCard
            title="Avg. Attendance Days"
            value={stats.avgAttendance}
            icon={FileText}
            color="text-slate-600"
            bg="bg-slate-50"
          />
        </StatGrid>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader><CardTitle>Detailed Reports</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Quotation List", desc: "All quotations & estimates", href: `${base}/reports/sales` },
              { label: "Invoice Report", desc: "Invoices, payments, dues", href: `${base}/reports/sales` },
              { label: "Pending Payments", desc: "Outstanding balances", href: `${base}/reports/sales` },
              { label: "Payment Collection", desc: "Receipts by date & mode", href: `${base}/reports/sales` },
              { label: "Receipt Register", desc: "All issued receipts", href: `${base}/reports/sales` },
              { label: "Staff Report", desc: "Employee details, salary info", href: "/dashboard/staff" },
              { label: "Financial Report", desc: "Income, expenses, P&L", href: `${base}/accounting` },
              { label: "Leave Report", desc: "Leave trends, balance", href: "/dashboard/leaves" },
              { label: "Attendance Report", desc: "Daily attendance logs", href: "/dashboard/attendance" },
              { label: "Payroll Report", desc: "Monthly salary breakdown", href: `${base}/payroll` },
            ].map((r) => (
              <a
                key={r.label}
                href={r.href}
                className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-gray-500 mt-1">{r.desc}</p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

