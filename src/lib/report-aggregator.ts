import { getDocuments, where, orderBy } from "@/lib/firestore";
import type { WorkLog, Task, ReportAutoMetrics, ReportPeriod } from "@/types";

/**
 * Computes auto-metrics for a department in a given period.
 */
export async function computeDepartmentMetrics(
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<ReportAutoMetrics> {
  const [workLogs, tasks] = await Promise.all([
    getDocuments<WorkLog>("work_logs", [
      where("departmentId", "==", departmentId),
      orderBy("date", "desc"),
    ]),
    getDocuments<Task>("tasks", [
      where("departmentId", "==", departmentId),
    ]),
  ]);

  // Filter to period
  const periodLogs = workLogs.filter((l) => l.date >= startDate && l.date <= endDate);
  const periodTasks = tasks;

  const completedTasks = periodTasks.filter((t) => t.status === "done");
  const inProgressTasks = periodTasks.filter((t) => t.status === "in-progress");
  const overdueTasks = periodTasks.filter((t) => {
    if (!t.dueDate || t.status === "done") return false;
    const dueDateStr = t.dueDate.toDate?.() ? t.dueDate.toDate().toISOString().split("T")[0] : "";
    return dueDateStr < endDate;
  });

  const totalHours = periodLogs.reduce((s, l) => s + (l.totalHours || 0), 0);
  const uniqueStaff = new Set(periodLogs.map((l) => l.staffId));
  const workingDays = new Set(periodLogs.map((l) => l.date)).size;
  const avgHoursPerStaff = uniqueStaff.size > 0 ? totalHours / uniqueStaff.size : 0;

  // Coverage rate: days with at least one log / total possible working days
  const periodDays = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)));
  const coverageRate = Math.min(100, Math.round((workingDays / periodDays) * 100));
  const completionRate = periodTasks.length > 0 ? Math.round((completedTasks.length / periodTasks.length) * 100) : 0;

  return {
    attendance: { presentRate: 0, lateRate: 0, absentRate: 0, totalDays: workingDays },
    tasks: {
      total: periodTasks.length,
      completed: completedTasks.length,
      inProgress: inProgressTasks.length,
      overdue: overdueTasks.length,
      completionRate,
    },
    leaves: { approved: 0, pending: 0, rejected: 0, byType: {} },
    workLogs: {
      totalHours,
      avgHoursPerStaff: Math.round(avgHoursPerStaff * 10) / 10,
      coverageRate,
    },
  };
}

/**
 * Returns date range for a report period type (weekly/monthly/quarterly).
 */
export function getPeriodRange(period: ReportPeriod, referenceDate?: Date): { start: string; end: string } {
  const now = referenceDate || new Date();
  let start: Date;
  let end: Date;

  switch (period) {
    case "daily": {
      start = new Date(now);
      end = new Date(now);
      break;
    }
    case "weekly": {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      break;
    }
    case "monthly": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    }
    case "quarterly": {
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      break;
    }
    case "yearly": {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
      break;
    }
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}
