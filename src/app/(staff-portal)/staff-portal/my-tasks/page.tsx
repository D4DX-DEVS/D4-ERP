"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { countDocuments, where, QueryConstraint } from "@/lib/firestore";
import { usePagination } from "@/hooks/use-pagination";
import { changeTaskStatus } from "@/lib/tasks";
import { useToast } from "@/components/ui/toast";
import { Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, getStatusColor } from "@/lib/utils";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { CheckCircle2, CircleDashed, ClipboardList, Eye, TimerReset } from "lucide-react";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700", urgent: "bg-red-100 text-red-700",
};

const PAGE_SIZE = 10;

export default function MyTasksPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const [reviewCount, setReviewCount] = useState(0);
  const [tick, setTick] = useState(0);

  // Server-side pagination: the API returns only the current page per section.
  // "__none__" matches nothing while the auth store hydrates.
  const staffId = user?.staffId ?? "__none__";
  const activeConstraints = useMemo<QueryConstraint[]>(
    () => [where("assigneeId", "==", staffId), where("status", "!=", "done")],
    [staffId]
  );
  const doneConstraints = useMemo<QueryConstraint[]>(
    () => [where("assigneeId", "==", staffId), where("status", "==", "done")],
    [staffId]
  );
  const active = usePagination<Task>("tasks", { pageSize: PAGE_SIZE, constraints: activeConstraints });
  // "Recently closed" — order finished work by last touch, not creation date.
  const done = usePagination<Task>("tasks", { pageSize: PAGE_SIZE, constraints: doneConstraints, orderByField: "updatedAt" });

  useEffect(() => {
    if (!user?.staffId) return;
    countDocuments("tasks", [where("assigneeId", "==", user.staffId), where("status", "==", "review")])
      .then(setReviewCount)
      .catch(() => {});
  }, [user?.staffId, tick]);

  const handleStatusChange = async (task: Task & { id: string }, status: Task["status"]) => {
    if (!user) return;
    try {
      await changeTaskStatus(task, status, user);
      active.refresh();
      done.refresh();
      setTick((t) => t + 1);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update status");
    }
  };

  if (active.loading || done.loading) return <PageLoader />;

  const totalTasks = active.totalCount + done.totalCount;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="My Tasks"
        description="Uniform task listing with explicit view access and clickable rows for detail context."
      />

      <ListingStatGrid>
        <ListingStatCard icon={<ClipboardList className="h-5 w-5" />} label="Total Tasks" value={totalTasks} toneClassName="bg-slate-100 text-slate-700" meta="Assigned to you" />
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Active" value={active.totalCount} toneClassName="bg-sky-50 text-sky-700" meta="Not yet completed" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="In Review" value={reviewCount} toneClassName="bg-amber-50 text-amber-700" meta="Waiting for approval" />
        <ListingStatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completed" value={done.totalCount} toneClassName="bg-indigo-50 text-indigo-700" meta="Finished tasks" />
      </ListingStatGrid>

      <ListingPanel title="Active Tasks" description="Track progress, update status, or open the full task detail page." contentClassName="space-y-4">
        {active.totalCount === 0 ? (
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
              {active.data.map((task) => {
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
                        {task.status === "todo" ? (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(task, "in-progress")}>Start</Button>
                        ) : task.status === "in-progress" ? (
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={() => handleStatusChange(task, "review")}>Submit for Review</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(task, "in-progress")}>Pull Back</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination
          page={active.page}
          totalPages={active.totalPages}
          totalCount={active.totalCount}
          pageSize={active.pageSize}
          hasNext={active.hasNext}
          hasPrev={active.hasPrev}
          onNext={active.nextPage}
          onPrev={active.prevPage}
        />
      </ListingPanel>

      <ListingPanel title="Completed Tasks" description="Recently closed items stay available for review and reference.">
        {done.totalCount === 0 ? (
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
              {done.data.map((task) => {
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
        <Pagination
          page={done.page}
          totalPages={done.totalPages}
          totalCount={done.totalCount}
          pageSize={done.pageSize}
          hasNext={done.hasNext}
          hasPrev={done.hasPrev}
          onNext={done.nextPage}
          onPrev={done.prevPage}
        />
      </ListingPanel>
    </div>
  );
}
