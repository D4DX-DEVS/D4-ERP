"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { LeaveRequest, Task } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, ClipboardList, Eye } from "lucide-react";

export default function StaffPortalHome() {
  const { user } = useAuthStore();
  const [recentLeaves, setRecentLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [pendingTasks, setPendingTasks] = useState<(Task & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    async function loadHomeData() {
      try {
        const [leaves, tasks] = await Promise.all([
          getDocuments<LeaveRequest>("leaveRequests", [
            where("staffId", "==", user!.staffId),
            orderBy("createdAt", "desc"),
          ]),
          getDocuments<Task>("tasks", [
            where("assigneeId", "==", user!.staffId),
            where("status", "!=", "done"),
          ]),
        ]);
        if (!isMounted) return;
        setRecentLeaves(leaves.slice(0, 5));
        setPendingTasks(tasks);
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

  const pendingLeaves = recentLeaves.filter((l) => l.status === "pending").length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Welcome, {user?.firstName}!</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CalendarDays className="h-6 w-6 mx-auto text-orange-500 mb-2" />
            <p className="text-2xl font-bold">{pendingLeaves}</p>
            <p className="text-xs text-gray-500">Pending Leaves</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ClipboardList className="h-6 w-6 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold">{pendingTasks.length}</p>
            <p className="text-xs text-gray-500">Active Tasks</p>
          </CardContent>
        </Card>
      </div>

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
