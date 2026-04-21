"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocuments, where } from "@/lib/firestore";
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
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [staffList, companies, clients, pendingLeaves, invoices, tasks] =
          await Promise.all([
            getDocuments("staff", [where("isActive", "==", true)]),
            getDocuments("companies", [where("isActive", "==", true)]),
            getDocuments("clients", [where("isActive", "==", true)]),
            getDocuments("leaveRequests", [where("status", "==", "pending")]),
            getDocuments("invoices"),
            getDocuments("tasks", [where("status", "!=", "done")]),
          ]);

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
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        toast("error", "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const statCards = [
    { title: "Total Staff", value: stats.totalStaff, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Companies", value: stats.totalCompanies, icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
    { title: "Clients", value: stats.totalClients, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarDays, color: "text-orange-600", bg: "bg-orange-50" },
    { title: "Invoices", value: stats.totalInvoices, icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
    { title: "Active Tasks", value: stats.totalTasks, icon: ClipboardList, color: "text-pink-600", bg: "bg-pink-50" },
    { title: "Monthly Income", value: formatCurrency(stats.monthlyIncome), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
    { title: "Monthly Expense", value: formatCurrency(stats.monthlyExpense), icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, {user?.firstName}. Here&apos;s your overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {loading ? "—" : stat.value}
                  </p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Leave Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : stats.pendingLeaves > 0 ? (
              <p className="text-sm text-gray-600">
                You have <span className="font-semibold text-orange-600">{stats.pendingLeaves}</span> pending leave requests to review.
              </p>
            ) : (
              <p className="text-sm text-gray-500">No pending leave requests.</p>
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
