"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getDocument } from "@/lib/firestore";
import { changeTaskStatus } from "@/lib/tasks";
import { canTransitionTask, transitionNeedsRemark, TASK_STATUS_LABELS } from "@/lib/task-workflow";
import { useAuthStore } from "@/store/auth-store";
import { Task, TaskStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { CommentsSection } from "@/components/ui/comments-section";
import { useToast } from "@/components/ui/toast";
import { formatDate, getStatusColor, cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, CircleDashed, Eye, TimerReset, Undo2 } from "lucide-react";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const statusDots: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  "in-progress": "bg-sky-500",
  review: "bg-amber-500",
  done: "bg-emerald-500",
};

function actionLabel(from: TaskStatus, to: TaskStatus): string {
  if (to === "in-progress") return from === "todo" ? "Start Task" : "Return to In Progress";
  if (to === "review") return "Submit for Review";
  if (to === "done") return "Approve & Mark Done";
  return `Move to ${TASK_STATUS_LABELS[to]}`;
}

export default function MyTaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [task, setTask] = useState<(Task & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returnRemark, setReturnRemark] = useState("");
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadTask() {
      try {
        const taskData = await getDocument<Task>("tasks", taskId);
        if (!isMounted) return;
        setTask(taskData);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadTask();

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  const isAssignee = !!user && task?.assigneeId === user.staffId;

  const handleStatusChange = async (to: TaskStatus, remarks?: string) => {
    if (!task || !user) return;
    setSaving(true);
    try {
      const update = await changeTaskStatus(task, to, user, remarks);
      setTask((current) => (current ? { ...current, ...update } : current));
      setReturning(false);
      setReturnRemark("");
      toast("success", `Task moved to ${TASK_STATUS_LABELS[to]}`);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!task) return null;

  const targets = user
    ? (Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).filter((to) =>
        canTransitionTask(user.role, isAssignee, task.status, to)
      )
    : [];

  const timeline = [
    ...(task.createdAt?.seconds
      ? [{ status: "todo" as TaskStatus, byName: task.assigneeName || "", at: task.createdAt, remarks: undefined as string | undefined, label: "Task created" }]
      : []),
    ...(task.statusHistory ?? []).map((h) => ({ ...h, label: `Moved to ${TASK_STATUS_LABELS[h.status]}` })),
  ];

  return (
    <div className="space-y-6">
      <ListingHeader
        title={task.title}
        description="Task detail page with status controls and full assignment context."
        action={
          <Link href="/staff-portal/my-tasks">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to tasks
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Status" value={TASK_STATUS_LABELS[task.status]} toneClassName="bg-sky-50 text-sky-700" meta="Current workflow stage" />
        <ListingStatCard icon={<Eye className="h-5 w-5" />} label="Priority" value={task.priority} toneClassName="bg-amber-50 text-amber-700" meta="Work urgency" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="Due Date" value={task.dueDate?.seconds ? formatDate(new Date(task.dueDate.seconds * 1000)) : "—"} toneClassName="bg-slate-100 text-slate-700" meta="Scheduled deadline" />
        <ListingStatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Subtasks" value={task.subtasks.length} toneClassName="bg-emerald-50 text-emerald-700" meta="Checklist items" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Task Summary" description="Core task description, tagging, and timeline.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Status" value={<Badge variant={getStatusColor(task.status)}>{TASK_STATUS_LABELS[task.status]}</Badge>} />
            <DetailField label="Priority" value={<Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>} />
            <DetailField label="Due Date" value={task.dueDate?.seconds ? formatDate(new Date(task.dueDate.seconds * 1000)) : "—"} />
            <DetailField label="Completed At" value={task.completedAt?.seconds ? formatDate(new Date(task.completedAt.seconds * 1000)) : "—"} />
            <div className="md:col-span-2">
              <DetailField label="Description" value={task.description || "—"} />
            </div>
            <div className="md:col-span-2">
              <DetailField label="Tags" value={task.tags.length ? task.tags.join(", ") : "—"} />
            </div>
          </div>
        </ListingPanel>

        <ListingPanel
          title="Task Actions"
          description={
            task.status === "review" && isAssignee
              ? "Submitted — waiting for your reviewer's decision."
              : task.status === "done"
                ? "This task is complete."
                : "Advance the task without leaving the detail page."
          }
        >
          <div className="space-y-3">
            {targets.map((to) => {
              const needsRemark = transitionNeedsRemark(task.status, to) && !isAssignee;
              if (needsRemark) {
                return (
                  <div key={to} className="space-y-2">
                    {returning ? (
                      <>
                        <textarea
                          value={returnRemark}
                          onChange={(e) => setReturnRemark(e.target.value)}
                          placeholder="Why is this being returned? (required)"
                          rows={3}
                          className="w-full rounded-xl border border-slate-200 bg-white/80 p-3 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" disabled={saving || !returnRemark.trim()} onClick={() => handleStatusChange(to, returnRemark)}>
                            <Undo2 className="h-4 w-4" /> Return Task
                          </Button>
                          <Button variant="ghost" disabled={saving} onClick={() => setReturning(false)}>Cancel</Button>
                        </div>
                      </>
                    ) : (
                      <Button variant="outline" className="w-full" disabled={saving} onClick={() => setReturning(true)}>
                        <Undo2 className="h-4 w-4" /> {actionLabel(task.status, to)}…
                      </Button>
                    )}
                  </div>
                );
              }
              return (
                <Button
                  key={to}
                  variant={to === "done" ? undefined : "outline"}
                  className={cn("w-full", to === "done" && "bg-emerald-600 hover:bg-emerald-700")}
                  disabled={saving}
                  onClick={() => handleStatusChange(to)}
                >
                  {actionLabel(task.status, to)}
                </Button>
              );
            })}
            {targets.length === 0 && (
              <p className="text-sm text-slate-500">
                {task.status === "done" ? "No further actions — task is done." : "No actions available for you at this stage."}
              </p>
            )}
          </div>
        </ListingPanel>
      </div>

      {timeline.length > 0 && (
        <ListingPanel title="Activity Timeline" description="Every workflow step, in order.">
          <ol className="space-y-4">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", statusDots[item.status])} />
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">
                    {item.byName ? `${item.byName} · ` : ""}
                    {item.at?.seconds ? formatDate(new Date(item.at.seconds * 1000)) : ""}
                  </p>
                  {item.remarks ? <p className="mt-1 text-xs text-slate-600">“{item.remarks}”</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </ListingPanel>
      )}

      <ListingPanel title="Progress Updates" description="Leave a note for your coordinator or check their feedback.">
        <CommentsSection entityType="task" entityId={task.id} />
      </ListingPanel>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-2 text-sm text-slate-700">{value}</div>
    </div>
  );
}
