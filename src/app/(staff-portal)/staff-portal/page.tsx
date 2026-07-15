"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { useAuthStore } from "@/store/auth-store";
import { getDocument, getDocuments, where, orderBy } from "@/lib/firestore";
import { getAppSettings, isNonWorkingDay, AppSettings } from "@/lib/settings";
import { Attendance, Banner, LeaveRequest, Staff, Task } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarCheck, CalendarDays, ClipboardList, Eye, HeartPulse, Umbrella, UserX } from "lucide-react";

// Leave policy (calendar year, Jan–Dec):
//  CL: 15/year, accrues 1.25/month from joining month; unused carries over within the year.
//  SL: flat 15/year pool, available on medical report + coordinator approval (not accrued).
const LEAVE_ANNUAL = 15;
const CL_MONTHLY = LEAVE_ANNUAL / 12; // 1.25

// CL accrued so far this calendar year. A staff joining mid-year only accrues from
// their joining month onward (e.g. Jan–Apr worker = 4 × 1.25 = 5 days).
function accruedCasualLeave(joining: Date | null, now: Date): number {
  if (joining && joining.getFullYear() > now.getFullYear()) return 0;
  const startMonth = joining && joining.getFullYear() === now.getFullYear() ? joining.getMonth() : 0;
  const months = now.getMonth() - startMonth + 1;
  if (months <= 0) return 0;
  return Math.min(LEAVE_ANNUAL, Math.round(months * CL_MONTHLY * 100) / 100);
}

// Counts only working days, mirroring how approval syncs leave into attendance
// (weekly offs and holidays don't consume leave balance).
function leaveDays(leave: LeaveRequest, settings: AppSettings | null, companyId?: string): number {
  if (leave.isHalfDay) return 0.5;
  const startSec = leave.startDate?.seconds;
  const endSec = leave.endDate?.seconds ?? startSec;
  if (!startSec || !endSec) return 1;
  if (!settings) return Math.max(1, Math.round((endSec - startSec) / 86400) + 1);
  let days = 0;
  const start = new Date(startSec * 1000);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endSec * 1000);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
    if (!isNonWorkingDay(settings, d, companyId)) days += 1;
  }
  return days;
}

const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export default function StaffPortalHome() {
  const { user } = useAuthStore();
  const [recentLeaves, setRecentLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [pendingTasks, setPendingTasks] = useState<(Task & { id: string })[]>([]);
  const [banners, setBanners] = useState<(Banner & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearStats, setYearStats] = useState({
    present: 0,
    leave: 0,
    absent: 0,
    clUsed: 0,
    slUsed: 0,
    clAccrued: 0,
    slAccrued: 0,
  });
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    async function loadHomeData() {
      try {
        const [leaves, tasks, attendance, staffDoc] = await Promise.all([
          getDocuments<LeaveRequest>("leaveRequests", [
            where("staffId", "==", user!.staffId),
            orderBy("createdAt", "desc"),
          ]),
          getDocuments<Task>("tasks", [
            where("assigneeId", "==", user!.staffId),
            where("status", "!=", "done"),
          ]),
          getDocuments<Attendance>("attendance", [where("staffId", "==", user!.staffId)]),
          getDocument<Staff>("staff", user!.staffId),
        ]);
        const appSettings = await getAppSettings();
        if (!isMounted) return;
        setRecentLeaves(leaves.slice(0, 5));
        setPendingTasks(tasks);

        const now = new Date();
        const yearStartSec = new Date(now.getFullYear(), 0, 1).getTime() / 1000;

        let present = 0;
        let leaveTaken = 0;
        let absent = 0;
        for (const record of attendance) {
          if (record.isDeleted || !record.date?.seconds || record.date.seconds < yearStartSec) continue;
          if (record.status === "present" || record.status === "late" || record.status === "wfh" || record.status === "on-duty") present += 1;
          else if (record.status === "half-day") present += 0.5;
          else if (record.status === "leave") leaveTaken += 1;
          else if (record.status === "absent") absent += 1;
        }

        let clUsed = 0;
        let slUsed = 0;
        for (const request of leaves) {
          if (request.status !== "approved" || request.type !== "leave") continue;
          if (!request.startDate?.seconds || request.startDate.seconds < yearStartSec) continue;
          if (request.leaveType === "CL") clUsed += leaveDays(request, appSettings, staffDoc?.companyId);
          else if (request.leaveType === "SL") slUsed += leaveDays(request, appSettings, staffDoc?.companyId);
        }

        const joining = staffDoc?.dateOfJoining?.seconds
          ? new Date(staffDoc.dateOfJoining.seconds * 1000)
          : null;

        setYearStats({
          present,
          leave: leaveTaken,
          absent,
          clUsed,
          slUsed,
          clAccrued: accruedCasualLeave(joining, now), // CL ramps monthly
          slAccrued: LEAVE_ANNUAL, // SL is a flat 15/year pool
        });
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadHomeData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    async function loadBanners() {
      try {
        const all = await getDocuments<Banner>("banners", [where("isActive", "==", true), orderBy("priority", "desc")]);
        const now = Date.now();
        const visible = all.filter((b) => {
          if (b.audience === "department" && b.departmentId !== user!.departmentId) return false;
          const start = (b.startDate as { seconds: number } | undefined)?.seconds;
          const end = (b.endDate as { seconds: number } | undefined)?.seconds;
          if (start && start * 1000 > now) return false;
          if (end && end * 1000 + 86400000 < now) return false;
          return true;
        });
        if (isMounted) setBanners(visible);
      } catch (error) {
        console.error("Error:", error);
      }
    }
    void loadBanners();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const pendingLeaves = recentLeaves.filter((l) => l.status === "pending").length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Welcome, {user?.firstName}!</h1>

      {/* Banners */}
      {banners.length > 0 && (
        <div className="space-y-3">
          {banners.map((b) => {
            const content = (
              <Card key={b.id} className="overflow-hidden">
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt={b.title} className="h-40 w-full object-cover" />
                )}
                <CardContent className="p-4">
                  <p className="font-semibold">{b.title}</p>
                  {b.message && <p className="mt-1 text-sm text-gray-600">{b.message}</p>}
                </CardContent>
              </Card>
            );
            return b.link ? (
              <a key={b.id} href={b.link} target="_blank" rel="noreferrer" className="block">
                {content}
              </a>
            ) : (
              <div key={b.id}>{content}</div>
            );
          })}
        </div>
      )}

      {/* Quick Stats */}
      <StatGrid cols={2}>
        <StatCard
          title="Pending Leaves"
          value={pendingLeaves}
          icon={CalendarDays}
          color="text-orange-600"
          bg="bg-orange-50"
          href="/staff-portal/my-leaves"
        />
        <StatCard
          title="Active Tasks"
          value={pendingTasks.length}
          icon={ClipboardList}
          color="text-blue-600"
          bg="bg-blue-50"
          href="/staff-portal/my-tasks"
        />
      </StatGrid>

      {/* Attendance This Year */}
      <Card>
        <CardHeader><CardTitle className="text-base">Attendance • {new Date().getFullYear()}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-emerald-50 p-3">
              <CalendarCheck className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
              <p className="text-xl font-bold text-emerald-700">{fmtDays(yearStats.present)}</p>
              <p className="text-[11px] text-gray-500">Present</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3">
              <Umbrella className="h-5 w-5 mx-auto text-blue-600 mb-1" />
              <p className="text-xl font-bold text-blue-700">{fmtDays(yearStats.leave)}</p>
              <p className="text-[11px] text-gray-500">Leave</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3">
              <UserX className="h-5 w-5 mx-auto text-rose-600 mb-1" />
              <p className="text-xl font-bold text-rose-700">{fmtDays(yearStats.absent)}</p>
              <p className="text-[11px] text-gray-500">Absent</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Balance */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leave Balance • {new Date().getFullYear()}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Casual Leave (CL)", icon: Umbrella, color: "text-orange-500", used: yearStats.clUsed, accrued: yearStats.clAccrued, note: "Accrues 1.25 days/month from your joining month" },
            { label: "Sick Leave (SL)", icon: HeartPulse, color: "text-rose-500", used: yearStats.slUsed, accrued: yearStats.slAccrued, note: "15/year pool • needs medical report + coordinator approval" },
          ].map((row) => {
            const balance = Math.max(0, row.accrued - row.used);
            const pct = row.accrued > 0 ? Math.min(100, (row.used / row.accrued) * 100) : 0;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <row.icon className={`h-4 w-4 ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="text-gray-600">
                    <span className="font-bold text-gray-900">{fmtDays(balance)}</span> left of {fmtDays(row.accrued)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${100 - pct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Used {fmtDays(row.used)} day{row.used === 1 ? "" : "s"} this year • {row.note}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent Leave Requests */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Leave Requests</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : recentLeaves.length === 0 ? (
            <p className="text-sm text-gray-500">No leave requests yet</p>
          ) : (
            <div className="space-y-3">
              {recentLeaves.map((leave) => {
                const detailHref = `/staff-portal/my-leaves/${leave.id}`;

                return (
                <div
                  key={leave.id}
                  className="flex cursor-pointer items-center justify-between border-b pb-2 last:border-0"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(detailHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(detailHref);
                    }
                  }}
                >
                  <div>
                    <p className="text-sm font-medium capitalize">{leave.type === "wfh" ? "Work From Home" : leave.type === "on-duty" ? "On Duty" : leave.type}</p>
                    <p className="text-xs text-gray-500">{leave.reason}</p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Badge variant={getStatusColor(leave.status)}>{leave.status}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Tasks */}
      <Card>
        <CardHeader><CardTitle className="text-base">My Tasks</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : pendingTasks.length === 0 ? (
            <p className="text-sm text-gray-500">No active tasks!</p>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map((task) => {
                const detailHref = `/staff-portal/my-tasks/${task.id}`;

                return (
                <div
                  key={task.id}
                  className="flex cursor-pointer items-center justify-between border-b pb-2 last:border-0"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(detailHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(detailHref);
                    }
                  }}
                >
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.dueDate && <p className="text-xs text-gray-500">Due: {formatDate(new Date(task.dueDate.seconds * 1000))}</p>}
                  </div>
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Badge variant={getStatusColor(task.status)}>{task.status}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
