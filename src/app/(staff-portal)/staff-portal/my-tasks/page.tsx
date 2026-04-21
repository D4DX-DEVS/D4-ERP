"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, updateDocument, where } from "@/lib/firestore";
import { Task } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getStatusColor } from "@/lib/utils";
import { PageLoader } from "@/components/ui/loading";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};

export default function MyTasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<(Task & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      const data = await getDocuments<Task>("tasks", [
        where("assigneeId", "==", user.staffId),
      ]);
      setTasks(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [user]);

  const handleStatusChange = async (taskId: string, status: Task["status"]) => {
    await updateDocument("tasks", taskId, { status });
    fetchTasks();
  };

  if (loading) return <PageLoader />;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Tasks</h1>

      {activeTasks.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No active tasks!</p>
      ) : (
        <div className="space-y-3">
          {activeTasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{task.title}</p>
                    {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}
                  </div>
                  <Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  {task.dueDate && <p className="text-xs text-gray-500">Due: {formatDate(new Date(task.dueDate.seconds * 1000))}</p>}
                  <Badge variant={getStatusColor(task.status)}>{task.status}</Badge>
                </div>
                <div className="flex gap-2 pt-1">
                  {task.status !== "in-progress" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(task.id, "in-progress")}>Start</Button>
                  )}
                  {task.status === "in-progress" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(task.id, "review")}>Submit for Review</Button>
                  )}
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleStatusChange(task.id, "done")}>
                    Mark Done
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {doneTasks.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-gray-500">Completed ({doneTasks.length})</h2>
          <div className="space-y-2">
            {doneTasks.slice(0, 5).map((task) => (
              <Card key={task.id} className="opacity-60">
                <CardContent className="p-3 flex items-center justify-between">
                  <p className="text-sm line-through">{task.title}</p>
                  <Badge variant="bg-green-100 text-green-700">done</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
