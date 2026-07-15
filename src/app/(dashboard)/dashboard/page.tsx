"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDocuments, where, Timestamp } from "@/lib/firestore";
import { REQUEST_TYPE_LABELS } from "@/lib/requests";
import { useAuthStore } from "@/store/auth-store";
import {
  Users,
  Building2,
  FileText,
  DollarSign,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Eye,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { StaffRequest } from "@/types";

interface DashboardStats {
  totalStaff: number;
  totalCompanies: number;
  totalClients: number;
  pendingLeaves: number;
  totalInvoices: number;
  totalTasks: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalStaff: 0,
    totalCompanies: 0,
    totalClients: 0,
    pendingLeaves: 0,
    totalInvoices: 0,
    totalTasks: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
  });
  const [todaysRequests, setTodaysRequests] = useState<(StaffRequest & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrowTs = new Date(today);
        tomorrowTs.setDate(tomorrowTs.getDate() + 1);

        const [staffList, companies, clients, pendingLeaves, invoices, tasks, todayRequests] =
          await Promise.all([
            getDocuments("staff", [where("isActive", "==", true)]),
            getDocuments("companies", [where("isActive", "==", true)]),
            getDocuments("clients", [where("isActive", "==", true)]),
            getDocuments("leaveRequests", [where("status", "==", "pending")]),
            getDocuments("invoices"),
            getDocuments("tasks", [where("status", "!=", "done")]),
            // Today's requests: createdAt today AND status pending
            getDocuments<StaffRequest>("leaveRequests", [
              where("status", "==", "pending"),
              where("createdAt", ">=", Timestamp.fromDate(today)),
              where("createdAt", "<", Timestamp.fromDate(tomorrowTs)),
            ]),
          ]);

        // Filter today's requests by department if user is dept-head
        let filtered = todayRequests;
        if (user?.role === "department-head") {
          filtered = todayRequests.filter((r) => r.departmentId === user.departmentId);
        }

        setStats({
          totalStaff: staffList.length,
          totalCompanies: companies.length,
          totalClients: clients.length,
          pendingLeaves: pendingLeaves.length,
          totalInvoices: invoices.length,
          totalTasks: tasks.length,
          monthlyIncome: 0,
          monthlyExpense: 0,
        });
        setTodaysRequests(filtered);
      } catch (error) {
        toast("error", "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [user, toast]);

  const statCards = [
    { title: "Total Staff", value: stats.totalStaff, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/dashboard/staff" },
    { title: "Companies", value: stats.totalCompanies, icon: Building2, color: "text-purple-600", bg: "bg-purple-50", href: "/dashboard/companies" },
    { title: "Clients", value: stats.totalClients, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50", href: "/dashboard/clients" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarDays, color: "text-orange-600", bg: "bg-orange-50", href: "/dashboard/leaves" },
    { title: "Invoices", value: stats.totalInvoices, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50", href: "/dashboard/invoices" },
    { title: "Active Tasks", value: stats.totalTasks, icon: ClipboardList, color: "text-pink-600", bg: "bg-pink-50", href: "/dashboard/tasks" },
    { title: "Monthly Income", value: formatCurrency(stats.monthlyIncome), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50", href: "/dashboard/accounting" },
    { title: "Monthly Expense", value: formatCurrency(stats.monthlyExpense), icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", href: "/dashboard/accounting" },
  ];

  return (
    <div className="space-y-6">
      {/* ponytail: hidden on mobile — header hero already shows title/welcome */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {user?.firstName}. Here&apos;s your overview.
        </p>
      </div>

      {/* Stats Grid */}
      <StatGrid>
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} loading={loading} />
        ))}
      </StatGrid>

      {/* Today's Requests & Quick Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Today's Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : todaysRequests.length === 0 ? (
              <p className="text-sm text-gray-500">No requests today.</p>
            ) : (
              <div className="space-y-2">
                {todaysRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{req.staffName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="text-xs">{REQUEST_TYPE_LABELS[req.type]}</Badge>
                        <span className="text-xs text-slate-500">{formatDate(new Date(req.createdAt?.seconds! * 1000))}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push("/dashboard/leaves")}
                      className="flex-shrink-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Active Staff</span>
                <span className="font-medium">{loading ? "—" : stats.totalStaff}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Active Clients</span>
                <span className="font-medium">{loading ? "—" : stats.totalClients}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Open Tasks</span>
                <span className="font-medium">{loading ? "—" : stats.totalTasks}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
