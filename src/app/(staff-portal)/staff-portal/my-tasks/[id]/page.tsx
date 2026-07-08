"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { updateDocument, getDocument, Timestamp } from "@/lib/firestore";
import { Task } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { CommentsSection } from "@/components/ui/comments-section";
import { formatDate, getStatusColor } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, CircleDashed, Eye, TimerReset } from "lucide-react";

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function MyTaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<(Task & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleStatusChange = async (status: Task["status"]) => {
    if (!task) return;
    setSaving(true);
    try {
      await updateDocument("tasks", task.id, {
        status,
        ...(status === "done" ? { completedAt: Timestamp.now() } : {}),
      });

      setTask((current) => current ? {
        ...current,
        status,
        ...(status === "done" ? { completedAt: Timestamp.now() } : {}),
      } : current);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!task) return null;

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
        <ListingStatCard icon={<CircleDashed className="h-5 w-5" />} label="Status" value={task.status} toneClassName="bg-sky-50 text-sky-700" meta="Current workflow stage" />
        <ListingStatCard icon={<Eye className="h-5 w-5" />} label="Priority" value={task.priority} toneClassName="bg-amber-50 text-amber-700" meta="Work urgency" />
        <ListingStatCard icon={<TimerReset className="h-5 w-5" />} label="Due Date" value={task.dueDate?.seconds ? formatDate(new Date(task.dueDate.seconds * 1000)) : "—"} toneClassName="bg-slate-100 text-slate-700" meta="Scheduled deadline" />
        <ListingStatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Subtasks" value={task.subtasks.length} toneClassName="bg-emerald-50 text-emerald-700" meta="Checklist items" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Task Summary" description="Core task description, tagging, and timeline.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Status" value={<Badge variant={getStatusColor(task.status)}>{task.status}</Badge>} />
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

        <ListingPanel title="Task Actions" description="Advance the task without leaving the detail page.">
          <div className="space-y-3">
            {task.status !== "in-progress" ? (
              <Button variant="outline" className="w-full" disabled={saving} onClick={() => handleStatusChange("in-progress")}>Start Task</Button>
            ) : (
              <Button variant="outline" className="w-full" disabled={saving} onClick={() => handleStatusChange("review")}>Submit for Review</Button>
            )}
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => handleStatusChange("done")}>Mark Done</Button>
          </div>
        </ListingPanel>
      </div>

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