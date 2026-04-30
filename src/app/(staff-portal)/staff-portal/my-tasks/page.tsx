"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, updateDocument, where } from "@/lib/firestore";
import { Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getStatusColor } from "@/lib/utils";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, CircleDashed, ClipboardList, Eye, TimerReset } from "lucide-react";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};

export default function MyTasksPage() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<(Task & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchTasks = async () => {
    if (!user?.staffId) {
      setLoading(false);
      return;
    }
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

  useEffect(() => {
    const staffId = user?.staffId;
    if (!staffId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadInitialTasks() {
      try {
        const data = await getDocuments<Task>("tasks", [
          where("assigneeId", "==", staffId),
        ]);

        if (!isMounted) return;
        setTasks(data);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialTasks();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleStatusChange = async (taskId: string, status: Task["status"]) => {
    await updateDocument("tasks", taskId, { status });
    fetchTasks();
  };

  if (loading) return <PageLoader />;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const reviewTasks = tasks.filter((t) => t.status === "review");

  return (
    <div className="space-y-6">
      <ListingHeader
        title="My Tasks"
        description="Uniform task listing with explicit view access and clickable rows for detail context."
      />

      <ListingStatGrid>
        <ListingStatCard icon={<ClipboardList className="h-5 w-5" />} label="Total Tasks" value={tasks.length} toneClassName="bg-slate-100 text-slate-700" meta="Assigned to you" />
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Active" value={activeTasks.length} toneClassName="bg-sky-50 text-sky-700" meta="Not yet completed" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="In Review" value={reviewTasks.length} toneClassName="bg-amber-50 text-amber-700" meta="Waiting for approval" />
        <ListingStatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={doneTasks.length} toneClassName="bg-emerald-50 text-emerald-700" meta="Finished tasks" />
      </ListingStatGrid>

      <ListingPanel title="Active Tasks" description="Track progress, update status, or open the full task detail page." contentClassName="space-y-4">
        {activeTasks.length === 0 ? (
          <EmptyState title="No active tasks" description="New assignments will appear here once they are linked to your account." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeTasks.map((task) => {
                const detailHref = `/staff-portal/my-tasks/${task.id}`;

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
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
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-950">{task.title}</p>
                        {task.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.description}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{task.dueDate ? formatDate(new Date(task.dueDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(task.status)}>{task.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {task.status !== "in-progress" ? (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(task.id, "in-progress")}>Start</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(task.id, "review")}>Submit</Button>
                        )}
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleStatusChange(task.id, "done")}>Done</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListingPanel>

      <ListingPanel title="Completed Tasks" description="Recently closed items stay available for review and reference.">
        {doneTasks.length === 0 ? (
          <p className="text-sm text-slate-500">No completed tasks yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doneTasks.slice(0, 8).map((task) => {
                const detailHref = `/staff-portal/my-tasks/${task.id}`;

                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
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
                    <TableCell className="text-slate-500 line-through">{task.title}</TableCell>
                    <TableCell>{task.completedAt?.seconds ? formatDate(new Date(task.completedAt.seconds * 1000)) : "—"}</TableCell>
                    <TableCell><Badge variant={priorityColors[task.priority]}>{task.priority}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ListingPanel>
    </div>
  );
}
