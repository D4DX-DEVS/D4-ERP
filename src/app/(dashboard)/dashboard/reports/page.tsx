"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDocuments } from "@/lib/firestore";
import { Staff, Transaction, Invoice, LeaveRequest, Attendance } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  Users, IndianRupee, FileText, Calendar,
  TrendingUp, TrendingDown, Clock, UserCheck,
  BarChart3, PieChart, ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { StatCard, StatGrid } from "@/components/ui/stat-card";

const DETAILED_REPORTS: { label: string; desc: string; href: (base: string) => string }[] = [
  { label: "Quotation List", desc: "All quotations & estimates", href: (b) => `${b}/reports/sales` },
  { label: "Invoice Report", desc: "Invoices, payments, dues", href: (b) => `${b}/reports/sales` },
  { label: "Pending Payments", desc: "Outstanding balances", href: (b) => `${b}/reports/sales` },
  { label: "Payment Collection", desc: "Receipts by date & mode", href: (b) => `${b}/reports/sales` },
  { label: "Receipt Register", desc: "All issued receipts", href: (b) => `${b}/reports/sales` },
  { label: "Staff Report", desc: "Employee details, salary info", href: () => "/dashboard/staff" },
  { label: "Financial Report", desc: "Income, expenses, P&L", href: (b) => `${b}/accounting` },
  { label: "Leave Report", desc: "Leave trends, balance", href: () => "/dashboard/leaves" },
  { label: "Attendance Report", desc: "Daily attendance logs", href: () => "/dashboard/attendance" },
  { label: "Payroll Report", desc: "Monthly salary breakdown", href: (b) => `${b}/payroll` },
];

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
          getDocuments<LeaveRequest>("leaveRequests"),
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
    <div className="space-y-4">
      {/* The shell header already prints "Reports" + the page description, so the
          page itself opens straight into the numbers. Sections use small eyebrow
          labels instead of h2s to keep the whole overview on one screen. */}
      <Section label="Financial Overview">
        <StatGrid cols={4} mobileCols={4}>
          <StatCard
            title="Total Income"
            value={formatCurrency(stats.totalIncome)}
            icon={TrendingUp}
            color="text-green-600"
            bg="bg-green-50"
            compact
          />
          <StatCard
            title="Total Expense"
            value={formatCurrency(stats.totalExpense)}
            icon={TrendingDown}
            color="text-red-600"
            bg="bg-red-50"
            compact
          />
          <StatCard
            title="Profit / Loss"
            value={formatCurrency(profitLoss)}
            icon={IndianRupee}
            color={profitLoss >= 0 ? "text-green-600" : "text-red-600"}
            bg={profitLoss >= 0 ? "bg-green-50" : "bg-red-50"}
            compact
          />
          <StatCard
            title="Total Invoiced"
            value={formatCurrency(stats.totalInvoiceAmount)}
            icon={FileText}
            color="text-purple-600"
            bg="bg-purple-50"
            compact
          />
        </StatGrid>
      </Section>

      <Section label="Staff & HR">
        <StatGrid cols={4} mobileCols={4}>
          <StatCard
            title="Total Staff"
            value={stats.totalStaff}
            icon={Users}
            color="text-blue-600"
            bg="bg-blue-50"
            compact
          />
          <StatCard
            title="Active Staff"
            value={stats.activeStaff}
            icon={UserCheck}
            color="text-green-600"
            bg="bg-green-50"
            compact
          />
          <StatCard
            title="Pending Leaves"
            value={stats.pendingLeaves}
            icon={Clock}
            color="text-orange-600"
            bg="bg-orange-50"
            compact
          />
          <StatCard
            title="Approved Leaves"
            value={stats.approvedLeaves}
            icon={Calendar}
            color="text-indigo-600"
            bg="bg-indigo-50"
            compact
          />
        </StatGrid>
      </Section>

      <Section label="Invoices & Attendance">
        <StatGrid cols={3} mobileCols={3}>
          <StatCard
            title="Paid Invoices"
            value={stats.paidInvoices}
            icon={BarChart3}
            color="text-green-600"
            bg="bg-green-50"
            compact
          />
          <StatCard
            title="Unpaid Invoices"
            value={stats.unpaidInvoices}
            icon={PieChart}
            color="text-red-600"
            bg="bg-red-50"
            compact
          />
          <StatCard
            title="Avg. Attendance Days"
            value={stats.avgAttendance}
            icon={FileText}
            color="text-slate-600"
            bg="bg-slate-50"
            compact
          />
        </StatGrid>
      </Section>

      {/* Quick Links */}
      <Card>
        <CardHeader className="p-4 pb-0 sm:p-4 sm:pb-0">
          <CardTitle className="text-base sm:text-base">Detailed Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-3 sm:p-4 sm:pt-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            {DETAILED_REPORTS.map((r) => (
              <Link
                key={r.label}
                href={r.href(base)}
                className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 px-3 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{r.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{r.desc}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Eyebrow-labelled band of stat cards — a tighter stand-in for an h2 + margin. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</h2>
      {children}
    </section>
  );
}
