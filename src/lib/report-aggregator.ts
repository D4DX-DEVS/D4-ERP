import { getDocuments, where, orderBy } from "@/lib/firestore";
import type { WorkLog, Task, ReportAutoMetrics, ReportPeriod, StaffBreakdownEntry, Attendance, Staff } from "@/types";

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
 * Computes staff-level breakdown for a department in a given period.
 * Returns per-staff attendance counts, completed tasks, and work log hours.
 */
export async function computeStaffBreakdown(
  departmentId: string,
  startDate: string,
  endDate: string
): Promise<StaffBreakdownEntry[]> {
  const [staff, attendance, tasks, workLogs] = await Promise.all([
    getDocuments<Staff>("staff", [where("departmentId", "==", departmentId), where("isActive", "==", true)]),
    getDocuments<Attendance>("attendance", [where("departmentId", "==", departmentId)]),
    getDocuments<Task>("tasks", [where("departmentId", "==", departmentId)]),
    getDocuments<WorkLog>("work_logs", [where("departmentId", "==", departmentId)]),
  ]);

  const breakdown: StaffBreakdownEntry[] = staff.map((s) => {
    // Filter attendance for this staff member in the period
    const staffAttendance = attendance.filter((a) => {
      if (a.staffId !== s.id) return false;
      const attDate = a.date instanceof Object && "toDate" in a.date ? a.date.toDate().toISOString().split("T")[0] : a.date;
      return attDate >= startDate && attDate <= endDate;
    });
    const present = staffAttendance.filter((a) => a.status === "present").length;
    const late = staffAttendance.filter((a) => a.status === "late").length;
    const absent = staffAttendance.filter((a) => a.status === "absent").length;
    const leaves = staffAttendance.filter((a) => ["leave", "wfh", "on-duty"].includes(a.status)).length;

    // Filter tasks completed by this staff member in the period
    const staffTasks = tasks.filter((t) => t.assigneeId === s.id && t.status === "done" && t.completedAt);
    const tasksCompleted = staffTasks.filter((t) => {
      if (!t.completedAt) return false;
      const completedDate = t.completedAt.toDate?.() ? t.completedAt.toDate().toISOString().split("T")[0] : "";
      return completedDate >= startDate && completedDate <= endDate;
    }).length;

    // Sum work log hours for this staff member in the period
    const staffLogs = workLogs.filter((l) => l.staffId === s.id && l.date >= startDate && l.date <= endDate);
    const workLogHours = staffLogs.reduce((sum, l) => sum + (l.totalHours || 0), 0);

    return {
      staffId: s.id || "",
      staffName: `${s.firstName} ${s.lastName}`,
      attendance: { present, late, absent, leaves },
      tasksCompleted,
      workLogHours: Math.round(workLogHours * 10) / 10,
    };
  });

  return breakdown;
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
