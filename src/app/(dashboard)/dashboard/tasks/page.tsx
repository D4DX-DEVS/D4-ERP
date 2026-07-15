"use client";

import { useEffect, useRef, useState } from "react";
import { Task, Staff, Department } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { changeTaskStatus } from "@/lib/tasks";
import { canTransitionTask, transitionNeedsRemark } from "@/lib/task-workflow";
import { createNotification } from "@/lib/notifications";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader } from "@/components/ui/listing";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { CommentsSection } from "@/components/ui/comments-section";
import { formatDate, cn } from "@/lib/utils";
import { Plus, Loader2, Pencil, Trash2, CheckSquare, Square, X, CalendarClock, ListTodo, Loader, CheckCircle2, LayoutGrid, Rows3, Search, Hourglass } from "lucide-react";
import { isUpdatePendingTask, notifyPendingTaskUpdates, updatePendingDays, pendingBadgeClasses, pendingBadgeLabel } from "@/lib/task-alerts";
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
  { id: "table", label: "Table", icon: Rows3 },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const emptyForm = {
  title: "",
  description: "",
  status: "todo" as Task["status"],
  priority: "medium" as Task["priority"],
  assigneeId: "",
  dueDate: "",
  tags: "",
};

export default function TasksPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskDoc | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>("board");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Task["status"]>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Task["priority"]>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [pendingUpdateOnly, setPendingUpdateOnly] = useState(false);
  const notifiedRef = useRef(false);

  const [form, setForm] = useState(emptyForm);
  const [subtasks, setSubtasks] = useState<{ title: string; isCompleted: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [returnTarget, setReturnTarget] = useState<TaskDoc | null>(null);
  const [returnRemark, setReturnRemark] = useState("");

  const fetchData = async () => {
    try {
      const [taskList, staff, depts] = await Promise.all([
        getDocuments<Task>("tasks", [orderBy("createdAt", "desc")]),
        getDocuments<Staff>("staff", [where("isActive", "==", true)]),
        getDocuments<Department>("departments", [where("isActive", "==", true)]),
      ]);
      setTasks(taskList);
      setStaffList(staff);
      setDepartments(depts);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After 6 PM, alert dept heads + admins about tasks with no update today
  // (once per mount; the helper itself is idempotent per day).
  useEffect(() => {
    if (loading || notifiedRef.current || tasks.length === 0) return;
    notifiedRef.current = true;
    notifyPendingTaskUpdates(tasks).catch(() => {});
  }, [loading, tasks]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSubtasks([]);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const openEdit = (task: TaskDoc) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ?? "",
      dueDate: task.dueDate ? new Date(task.dueDate.seconds * 1000).toISOString().split("T")[0] : "",
      tags: (task.tags ?? []).join(", "),
    });
    setSubtasks(task.subtasks ?? []);
    setCompletionPercentage(task.completionPercentage ?? 0);
    setNewSubtask("");
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const assignee = staffList.find((s) => s.id === form.assigneeId);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId,
        assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : "",
        dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : Timestamp.now(),
        subtasks,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        completionPercentage,
      };
      if (editingId) {
        // Status moves go through the workflow helper (history + guards) — not the edit form.
        const editPayload: Record<string, unknown> = { ...payload };
        delete editPayload.status;
        await updateDocument("tasks", editingId, editPayload);
        toast("success", "Task updated successfully");
      } else {
        const id = await createDocument("tasks", {
          ...payload,
          assignedBy: user?.staffId || "",
          createdBy: user?.staffId || "",
        });
        if (form.assigneeId && form.assigneeId !== user?.staffId) {
          void createNotification({
            recipientId: form.assigneeId,
            type: "task",
            title: "New task assigned",
            message: `You have been assigned "${payload.title}".`,
            link: `/staff-portal/my-tasks/${id}`,
            entityId: id,
            entityType: "task",
            senderName: user ? `${user.firstName} ${user.lastName}` : undefined,
          });
        }
        toast("success", "Task created successfully");
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setSubtasks([]);
      setCompletionPercentage(0);
      void fetchData();
    } catch (error) {
      toast("error", editingId ? "Failed to update task" : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const applyStatusChange = async (task: TaskDoc, newStatus: Task["status"], remarks?: string) => {
    if (!user) return;
    // Optimistic update for snappy drag-and-drop
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try {
      const update = await changeTaskStatus(task, newStatus, user, remarks);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...update } : t)));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update task status");
      void fetchData();
    }
  };

  const handleStatusChange = (taskId: string, newStatus: Task["status"]) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus || !user) return;
    if (!canTransitionTask(user.role, task.assigneeId === user.staffId, task.status, newStatus)) {
      toast("error", "That status change is not allowed for your role.");
      return;
    }
    if (transitionNeedsRemark(task.status, newStatus) && task.assigneeId !== user.staffId) {
      setReturnTarget(task);
      setReturnRemark("");
      return;
    }
    void applyStatusChange(task, newStatus);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument("tasks", deleteTarget.id);
      toast("success", "Task deleted");
      setDeleteTarget(null);
      void fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete task");
    }
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks((prev) => [...prev, { title, isCompleted: false }]);
    setNewSubtask("");
  };

  const toggleSubtask = (idx: number) =>
    setSubtasks((prev) => prev.map((s, i) => (i === idx ? { ...s, isCompleted: !s.isCompleted } : s)));

  const removeSubtask = (idx: number) => setSubtasks((prev) => prev.filter((_, i) => i !== idx));

  if (loading) return <PageLoader />;

  const todayKey = new Date().toISOString().split("T")[0];
  const isOverdue = (t: TaskDoc) =>
    t.status !== "done" && !!t.dueDate && new Date(t.dueDate.seconds * 1000).toISOString().split("T")[0] < todayKey;

  const q = query.trim().toLowerCase();
  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (assigneeFilter !== "all" && t.assigneeId !== assigneeFilter) return false;
    if (departmentFilter !== "all" && t.departmentId !== departmentFilter) return false;
    if (overdueOnly && !isOverdue(t)) return false;
    if (pendingUpdateOnly && !isUpdatePendingTask(t)) return false;
    if (q) {
      const haystack = `${t.title} ${t.description ?? ""} ${t.assigneeName ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total: filteredTasks.length,
    inProgress: filteredTasks.filter((t) => t.status === "in-progress").length,
    overdue: filteredTasks.filter(isOverdue).length,
    done: filteredTasks.filter((t) => t.status === "done").length,
    pendingUpdate: tasks.filter((t) => isUpdatePendingTask(t)).length,
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Task Board"
        description="Coordinate deliverables across your team — drag cards between columns to update status."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          title="Total Tasks"
          value={stats.total}
          icon={ListTodo}
          color="text-slate-600"
          bg="bg-slate-100"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          icon={Loader}
          color="text-sky-600"
          bg="bg-sky-50"
        />
        <StatCard
          title="Overdue"
          value={stats.overdue}
          icon={CalendarClock}
          color="text-red-600"
          bg="bg-red-50"
        />
        <StatCard
          title="No Update Today"
          value={stats.pendingUpdate}
          icon={Hourglass}
          color="text-amber-600"
          bg="bg-amber-50"
          onClick={() => setPendingUpdateOnly((p) => !p)}
          active={pendingUpdateOnly}
        />
        <StatCard
          title="Completed"
          value={stats.done}
          icon={CheckCircle2}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
      </StatGrid>

      {/* View switcher */}
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

      {/* Filters — apply to both Board and Table views */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-auto min-w-[200px] pl-9"
          />
        </div>
        <Select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="w-auto min-w-[170px]"
          options={[
            { value: "all", label: "All staff" },
            ...staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-auto min-w-[170px]"
          options={[{ value: "all", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | Task["status"])}
          className="w-auto min-w-[150px]"
          options={[{ value: "all", label: "All statuses" }, ...statusColumns.map((c) => ({ value: c.key, label: c.label }))]}
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as "all" | Task["priority"])}
          className="w-auto min-w-[150px]"
          options={[
            { value: "all", label: "All priorities" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
        />
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
            overdueOnly ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:border-red-200"
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" /> Overdue only
        </button>
      </div>

      {view === "board" ? (
      /* Kanban Board */
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statusColumns.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.key);
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) void handleStatusChange(draggedId, col.key);
                setDraggedId(null);
                setDragOverCol(null);
              }}
              className={cn(
                "flex min-h-[420px] flex-col rounded-[24px] border border-white/70 bg-gradient-to-b p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] backdrop-blur-md transition-all",
                col.accent,
                isOver ? `scale-[1.01] ring-2 ${col.ring}` : "ring-1 ring-transparent"
              )}
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
                    Drop tasks here
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const subDone = (task.subtasks ?? []).filter((s) => s.isCompleted).length;
                    const subTotal = (task.subtasks ?? []).length;
                    const dueKey = task.dueDate ? new Date(task.dueDate.seconds * 1000).toISOString().split("T")[0] : null;
                    const overdue = task.status !== "done" && dueKey !== null && dueKey < todayKey;
                    return (
                      <Card
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedId(task.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        onClick={() => openEdit(task)}
                        className={cn(
                          "group cursor-pointer border-white/80 bg-white/90 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)]",
                          draggedId === task.id && "opacity-50"
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

                          {isUpdatePendingTask(task) && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pendingBadgeClasses(updatePendingDays(task))}`}>
                              <Hourglass className="h-3 w-3" /> {pendingBadgeLabel(updatePendingDays(task))}
                            </span>
                          )}

                          {subTotal > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                                <span className="inline-flex items-center gap-1"><CheckSquare className="h-3 w-3" /> Subtasks</span>
                                <span>{subDone}/{subTotal}</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all"
                                  style={{ width: `${subTotal ? (subDone / subTotal) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {(task.tags ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {task.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">#{tag}</span>
                              ))}
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
      ) : (
      /* Table View */
      <div className="space-y-2">
        <p className="px-1 text-xs text-slate-500">Showing {filteredTasks.length} of {tasks.length} tasks</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="min-w-[150px]">Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Subtasks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  No tasks match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredTasks.map((task) => {
                const subDone = (task.subtasks ?? []).filter((s) => s.isCompleted).length;
                const subTotal = (task.subtasks ?? []).length;
                const dueKey = task.dueDate ? new Date(task.dueDate.seconds * 1000).toISOString().split("T")[0] : null;
                const overdue = task.status !== "done" && dueKey !== null && dueKey < todayKey;
                return (
                  <TableRow key={task.id} className="cursor-pointer" onClick={() => openEdit(task)}>
                    <TableCell>
                      <div className="font-semibold text-slate-800">{task.title}</div>
                      {isUpdatePendingTask(task) && (
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pendingBadgeClasses(updatePendingDays(task))}`}>
                          <Hourglass className="h-3 w-3" /> {pendingBadgeLabel(updatePendingDays(task))}
                        </span>
                      )}
                      {(task.tags ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {task.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-[10px] font-semibold uppercase text-white">
                          {task.assigneeName ? task.assigneeName.charAt(0) : "?"}
                        </span>
                        <span className="text-sm text-slate-600">{task.assigneeName || "Unassigned"}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityColors[task.priority]} className="border px-2 py-0.5 text-[9px] tracking-[0.12em]">
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={task.status}
                        onChange={(e) => void handleStatusChange(task.id, e.target.value as Task["status"])}
                        className="w-full min-w-[140px]"
                        options={statusColumns
                          .filter(
                            (c) =>
                              c.key === task.status ||
                              (user && canTransitionTask(user.role, task.assigneeId === user.staffId, task.status, c.key as Task["status"]))
                          )
                          .map((c) => ({ value: c.key, label: c.label }))}
                      />
                    </TableCell>
                    <TableCell>
                      {dueKey ? (
                        <span className={cn("flex items-center gap-1 text-sm", overdue ? "font-semibold text-red-600" : "text-slate-500")}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(new Date(task.dueDate.seconds * 1000))}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {subTotal > 0 ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"
                              style={{ width: `${(subDone / subTotal) * 100}%` }}
                            />
                          </span>
                          <span className="text-xs text-slate-500">{subDone}/{subTotal}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(task)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-600"
                          aria-label="Edit task"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(task)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-red-300 hover:text-red-600"
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Create / Edit Task Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader><DialogTitle>{editingId ? "Edit Task" : "New Task"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Edit promo video" required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assignee *</Label>
              <Select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                options={staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))}
                placeholder="Select" required />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task["priority"] })}
                options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              {editingId ? (
                <p className="flex h-10 items-center rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 text-sm text-slate-500">
                  {statusColumns.find((c) => c.key === form.status)?.label} — change from the board
                </p>
              ) : (
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Task["status"] })}
                  options={statusColumns.map((c) => ({ value: c.key, label: c.label }))} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <DatePicker value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subtasks</Label>
            {subtasks.length > 0 && (
              <div className="space-y-1.5">
                {subtasks.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-1.5">
                    <button type="button" onClick={() => toggleSubtask(idx)} className="cursor-pointer text-slate-500 hover:text-teal-600">
                      {s.isCompleted ? <CheckSquare className="h-4 w-4 text-teal-600" /> : <Square className="h-4 w-4" />}
                    </button>
                    <span className={cn("flex-1 text-sm", s.isCompleted ? "text-slate-400 line-through" : "text-slate-700")}>{s.title}</span>
                    <button type="button" onClick={() => removeSubtask(idx)} className="cursor-pointer text-slate-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="Add a subtask"
              />
              <Button type="button" variant="outline" onClick={addSubtask}>Add</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Progress (%)</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={completionPercentage}
                onChange={(e) => setCompletionPercentage(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
              />
              <span className="inline-flex h-8 w-12 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                {completionPercentage}%
              </span>
            </div>
            {subtasks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const completed = subtasks.filter((s) => s.isCompleted).length;
                  setCompletionPercentage(subtasks.length ? Math.round((completed / subtasks.length) * 100) : 0);
                }}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Sync from subtasks
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="design, urgent" />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            {editingId ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => { const t = tasks.find((x) => x.id === editingId); if (t) { setDialogOpen(false); setDeleteTarget(t); } }}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : <span />}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? "Save Changes" : "Create Task"}
              </Button>
            </div>
          </div>
        </form>

        {editingId && (
          <div className="mt-4 border-t pt-4">
            <CommentsSection entityType="task" entityId={editingId} />
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Task"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Dialog open={!!returnTarget} onClose={() => setReturnTarget(null)}>
        <DialogHeader>
          <DialogTitle>Return Task from Review</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Tell {returnTarget?.assigneeName || "the assignee"} what needs fixing on “{returnTarget?.title}”. This is posted as a comment.
          </p>
          <Textarea
            value={returnRemark}
            onChange={(e) => setReturnRemark(e.target.value)}
            placeholder="e.g. Fix mobile alignment, validation missing on the form"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReturnTarget(null)}>Cancel</Button>
            <Button
              disabled={!returnRemark.trim()}
              onClick={() => {
                if (!returnTarget) return;
                void applyStatusChange(returnTarget, "in-progress", returnRemark.trim());
                setReturnTarget(null);
              }}
            >
              Return Task
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
