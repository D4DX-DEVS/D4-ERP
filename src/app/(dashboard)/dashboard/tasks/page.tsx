"use client";

import { useEffect, useState } from "react";
import { Task, Staff, Department } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";
import { ClipboardList, Plus, Loader2, GripVertical } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const statusColumns = [
  { key: "todo", label: "To Do", color: "bg-gray-100" },
  { key: "in-progress", label: "In Progress", color: "bg-blue-50" },
  { key: "review", label: "Review", color: "bg-yellow-50" },
  { key: "done", label: "Done", color: "bg-green-50" },
] as const;

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function TasksPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<(Task & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "todo" as Task["status"],
    priority: "medium" as Task["priority"],
    assigneeId: "",
    dueDate: "",
    tags: "",
  });

  const fetchData = async () => {
    try {
      const [taskList, staff] = await Promise.all([
        getDocuments<Task>("tasks", [orderBy("createdAt", "desc")]),
        getDocuments<Staff>("staff", [where("isActive", "==", true)]),
      ]);
      setTasks(taskList);
      setStaffList(staff);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const assignee = staffList.find((s) => s.id === form.assigneeId);
      await createDocument("tasks", {
        title: form.title,
        description: form.description,
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId,
        assigneeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : "",
        assignedBy: user?.staffId || "",
        dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : Timestamp.now(),
        subtasks: [],
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()) : [],
        createdBy: user?.staffId || "",
      });
      setDialogOpen(false);
      setForm({ title: "", description: "", status: "todo", priority: "medium", assigneeId: "", dueDate: "", tags: "" });
      toast("success", "Task created successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: Task["status"]) => {
    try {
      await updateDocument("tasks", taskId, {
        status: newStatus,
        ...(newStatus === "done" ? { completedAt: Timestamp.now() } : {}),
      });
      toast("success", `Task moved to ${newStatus}`);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update task status");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">{tasks.length} total tasks</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Task
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {statusColumns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className={`rounded-xl p-4 ${col.color} min-h-[400px]`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">{col.label}</h3>
                <Badge>{colTasks.length}</Badge>
              </div>
              <div className="space-y-3">
                {colTasks.map((task) => (
                  <Card key={task.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
                        <Badge variant={priorityColors[task.priority]} className="text-[10px] ml-2 flex-shrink-0">
                          {task.priority}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{task.assigneeName || "Unassigned"}</span>
                        {task.dueDate && (
                          <span>{formatDate(new Date(task.dueDate.seconds * 1000))}</span>
                        )}
                      </div>
                      {/* Quick status change */}
                      <div className="flex gap-1 pt-1">
                        {statusColumns
                          .filter((s) => s.key !== task.status)
                          .map((s) => (
                            <button
                              key={s.key}
                              onClick={() => handleStatusChange(task.id, s.key)}
                              className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer"
                            >
                              → {s.label}
                            </button>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Task Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="design, urgent" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Task
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
