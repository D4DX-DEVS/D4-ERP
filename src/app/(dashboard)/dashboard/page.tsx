"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hourglass } from "lucide-react";
import { isUpdatePendingTask } from "@/lib/task-alerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDocuments, where, Timestamp, orderBy } from "@/lib/firestore";
import { REQUEST_TYPE_LABELS } from "@/lib/requests";
import { useAuthStore } from "@/store/auth-store";
import {
  Users,
  UserCheck,
  FileText,
  DollarSign,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Eye,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { hasFeature } from "@/lib/permissions";
import { useToast } from "@/components/ui/toast";
import {
  AttendanceTrendChart,
  TaskStatusChart,
  IncomeExpenseChart,
} from "@/components/charts";
import type { StaffRequest, Transaction, Task, Attendance } from "@/types";

interface DashboardStats {
  totalStaff: number;
  presentToday: number;
  totalClients: number;
  pendingLeaves: number;
  totalInvoices: number;
  totalTasks: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

interface AttendanceTrendData {
  day: string;
  present: number;
  late: number;
  absent: number;
}

interface TaskStatusData {
  name: string;
  value: number;
}

interface IncomeExpenseData {
  month: string;
  income: number;
  expense: number;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalStaff: 0,
    presentToday: 0,
    totalClients: 0,
    pendingLeaves: 0,
    totalInvoices: 0,
    totalTasks: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
  });
  const [todaysRequests, setTodaysRequests] = useState<(StaffRequest & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<AttendanceTrendData[]>([]);
  const [taskStatusData, setTaskStatusData] = useState<TaskStatusData[]>([]);
  const [pendingUpdateCount, setPendingUpdateCount] = useState(0);
  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseData[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrowTs = new Date(today);
        tomorrowTs.setDate(tomorrowTs.getDate() + 1);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const [staffList, clients, pendingLeaves, invoices, tasks, todayRequests, transactions, attendance] =
          await Promise.all([
            getDocuments("staff", [where("isActive", "==", true)]),
            getDocuments("clients", [where("isActive", "==", true)]),
            getDocuments("leaveRequests", [where("status", "==", "pending")]),
            // Server rejects finance reads without the feature — don't let a 403 sink the whole Promise.all.
            hasFeature(user, "invoices") || hasFeature(user, "quotations") || hasFeature(user, "reports")
              ? getDocuments("invoices")
              : Promise.resolve([]),
            getDocuments("tasks", [where("status", "!=", "done")]),
            getDocuments<StaffRequest>("leaveRequests", [
              where("status", "==", "pending"),
              where("createdAt", ">=", Timestamp.fromDate(today)),
              where("createdAt", "<", Timestamp.fromDate(tomorrowTs)),
            ]),
            hasFeature(user, "accounting") || hasFeature(user, "reports")
              ? getDocuments<Transaction>("transactions", [
                  where("date", ">=", Timestamp.fromDate(monthStart)),
                  where("date", "<", Timestamp.fromDate(monthEnd)),
                ])
              : Promise.resolve([]),
            getDocuments<Attendance>("attendance", [
              where("date", ">=", Timestamp.fromDate(monthStart)),
              where("date", "<", Timestamp.fromDate(monthEnd)),
            ]),
          ]);

        // Filter today's requests by department if user is dept-head
        let filtered = todayRequests;
        if (user?.role === "department-head") {
          filtered = todayRequests.filter((r) => r.departmentId === user.departmentId);
        }

        // Calculate monthly income/expense
        let monthlyIncome = 0;
        let monthlyExpense = 0;
        for (const txn of transactions as Transaction[]) {
          if (txn.type === "income") monthlyIncome += txn.amount;
          else if (txn.type === "expense") monthlyExpense += txn.amount;
        }

        // Build task status data
        const taskCounts = { todo: 0, "in-progress": 0, review: 0, done: 0 };
        for (const task of tasks as Task[]) {
          taskCounts[task.status as keyof typeof taskCounts]++;
        }
        const taskData: TaskStatusData[] = Object.entries(taskCounts)
          .filter(([_, count]) => count > 0)
          .map(([status, count]) => ({
            name: status,
            value: count,
          }));

        // Build attendance trend data (by day of month)
        const dayMap: Record<number, { present: number; late: number; absent: number }> = {};
        for (const att of attendance as Attendance[]) {
          if (!att.date?.seconds) continue;
          const d = new Date(att.date.seconds * 1000);
          const dayNum = d.getDate();
          if (!dayMap[dayNum]) dayMap[dayNum] = { present: 0, late: 0, absent: 0 };
          if (att.status === "present" || att.status === "wfh" || att.status === "on-duty") dayMap[dayNum].present++;
          else if (att.status === "late") dayMap[dayNum].late++;
          else if (att.status === "absent") dayMap[dayNum].absent++;
        }
        const attendanceData: AttendanceTrendData[] = Object.entries(dayMap)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([day, counts]) => ({
            day,
            ...counts,
          }));

        const todayNum = new Date().getDate();
        const presentToday = (attendance as Attendance[]).filter((a) => {
          if (!a.date?.seconds) return false;
          const d = new Date(a.date.seconds * 1000);
          return d.getDate() === todayNum && ["present", "late", "wfh", "on-duty", "half-day"].includes(a.status);
        }).length;

        setStats({
          totalStaff: staffList.length,
          presentToday,
          totalClients: clients.length,
          pendingLeaves: pendingLeaves.length,
          totalInvoices: invoices.length,
          totalTasks: tasks.length,
          monthlyIncome,
          monthlyExpense,
        });
        setTodaysRequests(filtered);
        setTaskStatusData(taskData);
        setPendingUpdateCount((tasks as Task[]).filter((t) => isUpdatePendingTask(t)).length);
        setAttendanceData(attendanceData);
        setIncomeExpenseData([
          {
            month: monthStart.toLocaleString("default", { month: "short" }),
            income: monthlyIncome,
            expense: monthlyExpense,
          },
        ]);
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
    { title: "Present Today", value: stats.presentToday, icon: UserCheck, color: "text-purple-600", bg: "bg-purple-50", href: "/dashboard/attendance" },
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

      {/* Role-aware Charts Section */}
      {(user?.role === "admin" || user?.role === "department-head") && pendingUpdateCount > 0 && (
        <Link
          href="/dashboard/tasks"
          className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
        >
          <Hourglass className="h-4 w-4 shrink-0" />
          {pendingUpdateCount} open task{pendingUpdateCount === 1 ? "" : "s"} with no update today — tap to review
        </Link>
      )}

      {(user?.role === "admin" || user?.role === "accounts") && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Financial & Operations</h2>
          </div>

          {/* Income/Expense and Task Status side-by-side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Income / Expense</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full h-56 sm:h-64 animate-pulse bg-slate-200 rounded" />
                ) : (
                  <IncomeExpenseChart data={incomeExpenseData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task Status Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full h-56 sm:h-64 animate-pulse bg-slate-200 rounded" />
                ) : (
                  <TaskStatusChart data={taskStatusData} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Attendance Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance Trend • {new Date().toLocaleString("default", { month: "long" })}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="w-full h-56 sm:h-64 animate-pulse bg-slate-200 rounded" />
              ) : (
                <AttendanceTrendChart data={attendanceData} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {user?.role === "department-head" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">My Department</h2>
          </div>

          {/* Attendance and Task Status side-by-side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attendance Trend • {new Date().toLocaleString("default", { month: "long" })}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full h-56 sm:h-64 animate-pulse bg-slate-200 rounded" />
                ) : (
                  <AttendanceTrendChart data={attendanceData} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task Status Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="w-full h-56 sm:h-64 animate-pulse bg-slate-200 rounded" />
                ) : (
                  <TaskStatusChart data={taskStatusData} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
