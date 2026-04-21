"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, where, orderBy } from "@/lib/firestore";
import { LeaveRequest, Task } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStatusColor, formatDate } from "@/lib/utils";
import { CalendarDays, ClipboardList, CheckCircle, Clock } from "lucide-react";

export default function StaffPortalHome() {
  const { user } = useAuthStore();
  const [recentLeaves, setRecentLeaves] = useState<(LeaveRequest & { id: string })[]>([]);
  const [pendingTasks, setPendingTasks] = useState<(Task & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetch() {
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
        setRecentLeaves(leaves.slice(0, 5));
        setPendingTasks(tasks);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetch();
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
              {recentLeaves.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium capitalize">{leave.type === "wfh" ? "Work From Home" : leave.type === "on-duty" ? "On Duty" : leave.type}</p>
                    <p className="text-xs text-gray-500">{leave.reason}</p>
                  </div>
                  <Badge variant={getStatusColor(leave.status)}>{leave.status}</Badge>
                </div>
              ))}
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
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.dueDate && <p className="text-xs text-gray-500">Due: {formatDate(new Date(task.dueDate.seconds * 1000))}</p>}
                  </div>
                  <Badge variant={getStatusColor(task.status)}>{task.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
