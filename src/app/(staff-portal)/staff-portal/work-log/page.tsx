"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Send, FileText } from "lucide-react";
import {
  getDocuments,
  createDocument,
  updateDocument,
  where,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import type { WorkLog, WorkLogEntry, ActivityType, Task } from "@/types";

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "development", label: "Development" },
  { value: "design", label: "Design" },
  { value: "meeting", label: "Meeting" },
  { value: "research", label: "Research" },
  { value: "admin", label: "Admin" },
  { value: "support", label: "Support" },
  { value: "fieldwork", label: "Fieldwork" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  reviewed: "bg-green-100 text-green-700",
  "needs-revision": "bg-orange-100 text-orange-700",
};

const emptyEntry: WorkLogEntry = {
  project: "",
  activityType: "development",
  description: "",
  hours: 0,
  taskId: "",
  taskTitle: "",
  blockers: "",
};

export default function StaffWorkLogPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<WorkLogEntry[]>([{ ...emptyEntry }]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"form" | "history">("form");

  const fetchData = async () => {
    if (!user) return;
    try {
      const [l, t] = await Promise.all([
        getDocuments<WorkLog>("work_logs", [
          where("staffId", "==", user.staffId),
          orderBy("date", "desc"),
        ]),
        getDocuments<Task>("tasks", [
          where("assigneeId", "==", user.staffId),
        ]),
      ]);
      setLogs(l);
      setTasks(t);
    } catch (error) {
      console.error("Failed to fetch:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const [l, t] = await Promise.all([
          getDocuments<WorkLog>("work_logs", [
            where("staffId", "==", user.staffId),
            orderBy("date", "desc"),
          ]),
          getDocuments<Task>("tasks", [
            where("assigneeId", "==", user.staffId),
          ]),
        ]);
        setLogs(l);
        setTasks(t);
      } catch (error) {
        console.error("Failed to fetch:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);

  const addEntry = () => setEntries((prev) => [...prev, { ...emptyEntry }]);
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateEntry = (idx: number, field: keyof WorkLogEntry, value: string | number) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };

  const handleSave = async (submitNow: boolean) => {
    if (!user) return;
    const validEntries = entries.filter((e) => e.project.trim() || e.description.trim());
    if (validEntries.length === 0) {
      toast("error", "Add at least one entry with a project or description");
      return;
    }
    if (submitNow && validEntries.some((e) => !e.hours || e.hours <= 0)) {
      toast("error", "All entries must have hours logged before submitting");
      return;
    }

    setSaving(true);
    try {
      const status = submitNow ? "submitted" : "draft";
      const data = {
        staffId: user.staffId,
        staffName: `${user.firstName} ${user.lastName}`,
        departmentId: user.departmentId,
        date,
        entries: entries.filter((e) => e.project.trim() || e.description.trim()),
        totalHours,
        status,
        ...(submitNow ? { submittedAt: Timestamp.now() } : {}),
        updatedAt: Timestamp.now(),
      };

      if (editingId) {
        await updateDocument("work_logs", editingId, data);
        toast("success", submitNow ? "Work log submitted" : "Draft saved");
      } else {
        await createDocument("work_logs", { ...data, createdAt: Timestamp.now() });
        toast("success", submitNow ? "Work log submitted" : "Draft saved");
      }

      setShowForm(false);
      setEditingId(null);
      setEntries([{ ...emptyEntry }]);
      await fetchData();
    } catch (error) {
      console.error("Save failed:", error);
      toast("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (log: WorkLog) => {
    if (log.status !== "draft" && log.status !== "needs-revision") {
      toast("info", "Only draft/revision logs can be edited");
      return;
    }
    setDate(log.date);
    setEntries(log.entries.length > 0 ? log.entries : [{ ...emptyEntry }]);
    setEditingId(log.id!);
    setShowForm(true);
    setTab("form");
  };

  const handleTaskSelect = (idx: number, taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    setEntries((prev) =>
      prev.map((e, i) =>
        i === idx ? { ...e, taskId, taskTitle: task?.title || "" } : e
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Work Log</h1>
          <p className="text-sm text-muted-foreground">Submit your daily work updates.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setTab("form"); setEditingId(null); setEntries([{ ...emptyEntry }]); }}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Log
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => { setTab("form"); if (!showForm) { setShowForm(true); setEditingId(null); setEntries([{ ...emptyEntry }]); } }}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "form" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          {showForm ? (editingId ? "Edit Log" : "New Log") : "Submit"}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          History
        </button>
      </div>

      {tab === "form" && showForm && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ml-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div className="ml-auto text-sm">
              Total: <span className="font-semibold">{totalHours}h</span>
            </div>
          </div>

          {/* Entries */}
          <div className="space-y-4">
            {entries.map((entry, idx) => (
              <div key={idx} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Entry {idx + 1}</span>
                  {entries.length > 1 && (
                    <button onClick={() => removeEntry(idx)} className="text-destructive hover:bg-destructive/10 rounded p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium">Project</label>
                    <input
                      value={entry.project}
                      onChange={(e) => updateEntry(idx, "project", e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Project name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Activity Type</label>
                    <select
                      value={entry.activityType}
                      onChange={(e) => updateEntry(idx, "activityType", e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={entry.hours || ""}
                      onChange={(e) => updateEntry(idx, "hours", Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium">Description</label>
                  <textarea
                    value={entry.description}
                    onChange={(e) => updateEntry(idx, "description", e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    placeholder="What did you work on?"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Link to Task (optional)</label>
                    <select
                      value={entry.taskId || ""}
                      onChange={(e) => handleTaskSelect(idx, e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">No task</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id!}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Blockers (optional)</label>
                    <input
                      value={entry.blockers || ""}
                      onChange={(e) => updateEntry(idx, "blockers", e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Any blockers?"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addEntry}
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add entry
          </button>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Submit
            </button>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work logs submitted yet.</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border bg-card p-4 hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => handleEdit(log)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{log.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{log.totalHours}h</span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_COLORS[log.status] || ""}`}>
                      {log.status.replace(/-/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {log.entries.length} {log.entries.length === 1 ? "entry" : "entries"}
                  {log.entries[0]?.project && ` • ${log.entries[0].project}`}
                </div>
                {log.reviewRemarks && (
                  <p className="mt-2 text-xs text-orange-600 italic">
                    Review: {log.reviewRemarks}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
