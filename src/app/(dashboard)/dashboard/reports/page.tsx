"use client";

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

export default function ReportsPage() {
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ReportCard
            icon={<TrendingUp className="h-6 w-6 text-green-500" />}
            label="Total Income"
            value={formatCurrency(stats.totalIncome)}
            color="text-green-600"
          />
          <ReportCard
            icon={<TrendingDown className="h-6 w-6 text-red-500" />}
            label="Total Expense"
            value={formatCurrency(stats.totalExpense)}
            color="text-red-600"
          />
          <ReportCard
            icon={<IndianRupee className="h-6 w-6 text-blue-500" />}
            label="Profit / Loss"
            value={formatCurrency(profitLoss)}
            color={profitLoss >= 0 ? "text-green-600" : "text-red-600"}
          />
          <ReportCard
            icon={<FileText className="h-6 w-6 text-purple-500" />}
            label="Total Invoiced"
            value={formatCurrency(stats.totalInvoiceAmount)}
            color="text-purple-600"
          />
        </div>
      </div>

      {/* Staff & HR */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Staff & HR</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ReportCard
            icon={<Users className="h-6 w-6 text-blue-500" />}
            label="Total Staff"
            value={String(stats.totalStaff)}
          />
          <ReportCard
            icon={<UserCheck className="h-6 w-6 text-green-500" />}
            label="Active Staff"
            value={String(stats.activeStaff)}
          />
          <ReportCard
            icon={<Clock className="h-6 w-6 text-orange-500" />}
            label="Pending Leaves"
            value={String(stats.pendingLeaves)}
          />
          <ReportCard
            icon={<Calendar className="h-6 w-6 text-teal-500" />}
            label="Approved Leaves"
            value={String(stats.approvedLeaves)}
          />
        </div>
      </div>

      {/* Invoice Breakdown */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Invoices</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReportCard
            icon={<BarChart3 className="h-6 w-6 text-green-500" />}
            label="Paid Invoices"
            value={String(stats.paidInvoices)}
          />
          <ReportCard
            icon={<PieChart className="h-6 w-6 text-red-500" />}
            label="Unpaid Invoices"
            value={String(stats.unpaidInvoices)}
          />
          <ReportCard
            icon={<FileText className="h-6 w-6 text-gray-500" />}
            label="Avg. Attendance Days"
            value={String(stats.avgAttendance)}
          />
        </div>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader><CardTitle>Detailed Reports</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Quotation List", desc: "All quotations & estimates", href: "/dashboard/reports/sales" },
              { label: "Invoice Report", desc: "Invoices, payments, dues", href: "/dashboard/reports/sales" },
              { label: "Pending Payments", desc: "Outstanding balances", href: "/dashboard/reports/sales" },
              { label: "Payment Collection", desc: "Receipts by date & mode", href: "/dashboard/reports/sales" },
              { label: "Receipt Register", desc: "All issued receipts", href: "/dashboard/reports/sales" },
              { label: "Staff Report", desc: "Employee details, salary info", href: "/dashboard/staff" },
              { label: "Financial Report", desc: "Income, expenses, P&L", href: "/dashboard/accounting" },
              { label: "Leave Report", desc: "Leave trends, balance", href: "/dashboard/leaves" },
              { label: "Attendance Report", desc: "Daily attendance logs", href: "/dashboard/attendance" },
              { label: "Payroll Report", desc: "Monthly salary breakdown", href: "/dashboard/payroll" },
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

function ReportCard({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
