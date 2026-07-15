"use client";

import { useEffect, useState } from "react";
import { Task, Staff } from "@/types";
import { getDocuments, updateDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommentsSection } from "@/components/ui/comments-section";
import { PageLoader, EmptyState } from "@/components/ui/loading";
import { ListingHeader } from "@/components/ui/listing";
import { formatDate, cn } from "@/lib/utils";
import {
  Plus,
  Loader2,
  CheckSquare,
  Square,
  X,
  CalendarClock,
  LayoutGrid,
  Rows3,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

type TaskDoc = Task & { id: string };

const statusColumns = [
  { key: "todo", label: "To Do", dot: "bg-slate-400", accent: "from-slate-50/80 to-white/40", ring: "ring-slate-200/70" },
  { key: "in-progress", label: "In Progress", dot: "bg-sky-500", accent: "from-sky-50/80 to-white/40", ring: "ring-sky-200/70" },
  { key: "review", label: "Review", dot: "bg-amber-500", accent: "from-amber-50/80 to-white/40", ring: "ring-amber-200/70" },
  { key: "done", label: "Done", dot: "bg-emerald-500", accent: "from-emerald-50/80 to-white/40", ring: "ring-emerald-200/70" },
] as const;

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200/60",
  medium: "bg-sky-100 text-sky-700 border-sky-200/60",
  high: "bg-orange-100 text-orange-700 border-orange-200/60",
  urgent: "bg-red-100 text-red-700 border-red-200/60",
};

const VIEWS = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "list", label: "List", icon: Rows3 },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const emptyForm = {
  title: "",
  description: "",
  status: "todo" as Task["status"],
  priority: "medium" as Task["priority"],
};

export default function TeamTasksPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDoc | null>(null);
  const [view, setView] = useState<ViewId>("list");
  const [saving, setSaving] = useState(false);
  const [subtaskEditing, setSubtaskEditing] = useState(false);

  const fetchData = async () => {
    try {
      const [taskList, staff] = await Promise.all([
        getDocuments<Task>("tasks", [orderBy("createdAt", "desc")]),
        getDocuments<Staff>("staff", [where("isActive", "==", true)]),
      ]);
      setTasks(taskList);
      setStaffList(staff);
    } catch (error) {
      toast("error", "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const isAssignee = (task: TaskDoc) => task.assigneeId === user?.staffId;

  const openDetail = (task: TaskDoc) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedTask(null);
    setSubtaskEditing(false);
  };

  const handleStatusChange = async (task: TaskDoc, newStatus: Task["status"]) => {
    if (!isAssignee(task)) return;
    setSaving(true);
    try {
      await updateDocument("tasks", task.id, {
        status: newStatus,
        ...(newStatus === "done" ? { completedAt: Timestamp.now() } : {}),
      });
      setSelectedTask((prev) =>
        prev ? { ...prev, status: newStatus, ...(newStatus === "done" ? { completedAt: Timestamp.now() } : {}) } : null
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: newStatus, ...(newStatus === "done" ? { completedAt: Timestamp.now() } : {}) } : t
        )
      );
      toast("success", "Status updated");
    } catch (error) {
      toast("error", "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const toggleSubtask = async (task: TaskDoc, idx: number) => {
    if (!isAssignee(task)) return;
    setSaving(true);
    try {
      const updated = (task.subtasks ?? []).map((s, i) => (i === idx ? { ...s, isCompleted: !s.isCompleted } : s));
      await updateDocument("tasks", task.id, { subtasks: updated });
      setSelectedTask((prev) => (prev ? { ...prev, subtasks: updated } : null));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: updated } : t)));
    } catch (error) {
      toast("error", "Failed to update subtask");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  const todayKey = new Date().toISOString().split("T")[0];
  const isOverdue = (t: TaskDoc) =>
    t.status !== "done" && !!t.dueDate && new Date(t.dueDate.seconds * 1000).toISOString().split("T")[0] < todayKey;

  const getProgress = (task: TaskDoc) => {
    if (task.completionPercentage !== undefined) return task.completionPercentage;
    const subtasks = task.subtasks ?? [];
    if (subtasks.length === 0) return 0;
    const completed = subtasks.filter((s) => s.isCompleted).length;
    return Math.round((completed / subtasks.length) * 100);
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Team Board"
        description="View all tasks and track team progress — edit only your assigned tasks."
      />

      <div className="inline-flex rounded-full border border-slate-200/90 bg-white/80 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
                active
                  ? "bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 text-white shadow-[0_10px_24px_rgba(15,118,110,0.24)]"
                  : "text-slate-600 hover:text-slate-950"
              )}
            >
              <Icon className="h-4 w-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {view === "board" ? (
        /* Kanban Board */
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Swipe left/right on mobile to scroll between columns</p>
          <div className="overflow-x-auto snap-x snap-mandatory">
            <div className="grid grid-flow-col gap-4 pb-4 min-w-max sm:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
              {statusColumns.map((col) => {
                const colTasks = tasks.filter((t) => t.status === col.key);
                return (
                  <div
                    key={col.key}
                    className={cn(
                      "flex min-h-[420px] flex-col rounded-[24px] border border-white/70 bg-gradient-to-b p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] backdrop-blur-md snap-start sm:snap-align-none",
                      col.accent,
                      "ring-1 ring-transparent"
                    )}
                    style={{ flex: "0 0 min(100vw, 320px)", marginRight: "1rem" }}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", col.dot)} />
                        <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-800">{col.label}</h3>
                      </div>
                      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white/70 px-2 text-xs font-semibold text-slate-500">
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-3">
                      {colTasks.length === 0 ? (
                        <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200/80 text-xs text-slate-400">
                          No tasks
                        </div>
                      ) : (
                        colTasks.map((task) => {
                          const progress = getProgress(task);
                          const dueKey = task.dueDate ? new Date(task.dueDate.seconds * 1000).toISOString().split("T")[0] : null;
                          const overdue = task.status !== "done" && dueKey !== null && dueKey < todayKey;
                          return (
                            <Card
                              key={task.id}
                              onClick={() => openDetail(task)}
                              className={cn(
                                "group cursor-pointer border-white/80 bg-white/90 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)]"
                              )}
                            >
                              <CardContent className="space-y-2.5 p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-semibold leading-tight text-slate-800">{task.title}</h4>
                                  <Badge
                                    variant={priorityColors[task.priority]}
                                    className="ml-1 flex-shrink-0 border px-2 py-0.5 text-[9px] tracking-[0.12em]"
                                  >
                                    {task.priority}
                                  </Badge>
                                </div>

                                {task.description && (
                                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{task.description}</p>
                                )}

                                {progress > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                                      <span>Progress</span>
                                      <span>{progress}%</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                                  <span className="flex items-center gap-1.5 text-slate-500">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-[9px] font-semibold uppercase text-white">
                                      {task.assigneeName ? task.assigneeName.charAt(0) : "?"}
                                    </span>
                                    <span className="max-w-[90px] truncate">{task.assigneeName || "Unassigned"}</span>
                                  </span>
                                  {dueKey && (
                                    <span className={cn("flex items-center gap-1", overdue ? "font-semibold text-red-600" : "text-slate-400")}>
                                      <CalendarClock className="h-3 w-3" />
                                      {formatDate(new Date(task.dueDate.seconds * 1000))}
                                    </span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* List View — Grouped by Assignee */
        <div className="space-y-6">
          {tasks.length === 0 ? (
            <EmptyState title="No tasks" description="Team board is empty." />
          ) : (
            (() => {
              const grouped = new Map<string, TaskDoc[]>();
              tasks.forEach((t) => {
                const key = t.assigneeName || "Unassigned";
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(t);
              });

              return Array.from(grouped.entries()).map(([assignee, assigneeTasks]) => (
                <div key={assignee} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">{assignee}</h3>
                  <div className="space-y-2">
                    {assigneeTasks.map((task) => {
                      const progress = getProgress(task);
                      const dueKey = task.dueDate ? new Date(task.dueDate.seconds * 1000).toISOString().split("T")[0] : null;
                      const overdue = task.status !== "done" && dueKey !== null && dueKey < todayKey;
                      return (
                        <div
                          key={task.id}
                          onClick={() => openDetail(task)}
                          className="flex cursor-pointer items-center gap-4 rounded-lg border border-slate-200/70 bg-white/80 p-4 transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-slate-800 truncate">{task.title}</h4>
                              <Badge
                                variant={priorityColors[task.priority]}
                                className="flex-shrink-0 border px-2 py-0.5 text-[9px] tracking-[0.12em]"
                              >
                                {task.priority}
                              </Badge>
                              <span
                                className={cn(
                                  "flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                  task.status === "todo"
                                    ? "bg-slate-100 text-slate-700"
                                    : task.status === "in-progress"
                                      ? "bg-sky-100 text-sky-700"
                                      : task.status === "review"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-emerald-100 text-emerald-700"
                                )}
                              >
                                {task.status}
                              </span>
                            </div>
                            {task.description && <p className="text-xs text-slate-500 line-clamp-1 mb-2">{task.description}</p>}
                            {progress > 0 && (
                              <div className="flex items-center gap-2">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500 flex-shrink-0">{progress}%</span>
                              </div>
                            )}
                            {dueKey && (
                              <div className={cn("mt-1 text-xs flex items-center gap-1", overdue ? "font-semibold text-red-600" : "text-slate-400")}>
                                <CalendarClock className="h-3 w-3" />
                                {formatDate(new Date(task.dueDate.seconds * 1000))}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      )}

      {/* Task Detail Dialog */}
      <Dialog open={detailOpen} onClose={closeDetail}>
        {selectedTask && (
          <>
            <DialogHeader>
              <DialogTitle>{selectedTask.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedTask.description && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Description</p>
                  <p className="text-sm text-slate-700">{selectedTask.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Status</p>
                  <div className="mt-2 space-y-2">
                    {isAssignee(selectedTask) ? (
                      <div className="space-y-1">
                        {statusColumns.map((col) => (
                          <Button
                            key={col.key}
                            type="button"
                            variant={selectedTask.status === col.key ? "default" : "outline"}
                            className="w-full justify-start text-xs"
                            disabled={saving}
                            onClick={() => handleStatusChange(selectedTask, col.key as Task["status"])}
                          >
                            <span className={cn("h-2 w-2 rounded-full mr-2", col.dot)} />
                            {col.label}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 font-medium">
                        {statusColumns.find((c) => c.key === selectedTask.status)?.label || selectedTask.status}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Priority</p>
                  <p className="mt-2">
                    <Badge variant={priorityColors[selectedTask.priority]}>{selectedTask.priority}</Badge>
                  </p>
                </div>
              </div>

              {selectedTask.dueDate && (
                <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Due Date</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDate(new Date(selectedTask.dueDate.seconds * 1000))}</p>
                </div>
              )}

              {(selectedTask.subtasks ?? []).length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Subtasks</p>
                    {isAssignee(selectedTask) && (
                      <button
                        type="button"
                        onClick={() => setSubtaskEditing(!subtaskEditing)}
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {subtaskEditing ? "Done" : "Edit"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {selectedTask.subtasks.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white p-3">
                        {isAssignee(selectedTask) && subtaskEditing ? (
                          <button
                            type="button"
                            onClick={() => toggleSubtask(selectedTask, idx)}
                            disabled={saving}
                            className="cursor-pointer text-slate-500 hover:text-teal-600 flex-shrink-0"
                          >
                            {s.isCompleted ? <CheckSquare className="h-4 w-4 text-teal-600" /> : <Square className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="text-slate-500 flex-shrink-0">
                            {s.isCompleted ? <CheckSquare className="h-4 w-4 text-teal-600" /> : <Square className="h-4 w-4" />}
                          </span>
                        )}
                        <span className={cn("flex-1 text-sm", s.isCompleted ? "text-slate-400 line-through" : "text-slate-700")}>
                          {s.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(selectedTask.tags ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-[0.1em]">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedTask.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <CommentsSection entityType="task" entityId={selectedTask.id} />
              </div>

              <div className="flex gap-2 border-t pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={closeDetail}>
                  Close
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
