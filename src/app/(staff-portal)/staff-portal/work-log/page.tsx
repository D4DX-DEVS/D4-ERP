"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Send, FileText, Clock, CalendarDays, Briefcase, AlertCircle } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  reviewed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "needs-revision": "bg-amber-50 text-amber-700 border-amber-200",
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

  const taskOptions = [
    { value: "", label: "No task" },
    ...tasks.map((t) => ({ value: t.id!, label: t.title })),
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Work Log</h1>
          <p className="mt-1 text-sm text-slate-500">Submit your daily work updates and track your progress.</p>
        </div>
        {!showForm && (
          <Button
            onClick={() => { setShowForm(true); setTab("form"); setEditingId(null); setEntries([{ ...emptyEntry }]); }}
          >
            <Plus className="h-4 w-4" /> New Log
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full bg-slate-100/80 p-1 w-fit">
        <button
          onClick={() => { setTab("form"); if (!showForm) { setShowForm(true); setEditingId(null); setEntries([{ ...emptyEntry }]); } }}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${tab === "form" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {showForm ? (editingId ? "Edit Log" : "New Log") : "New Log"}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${tab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          History
        </button>
      </div>

      {/* Form */}
      {tab === "form" && showForm && (
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Date & Total */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  Date
                </label>
                <DatePicker
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-48"
                />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 px-4 py-2.5">
                <Clock className="h-4 w-4 text-teal-600" />
                <span className="text-sm text-slate-600">Total:</span>
                <span className="text-lg font-bold text-teal-700">{totalHours}h</span>
              </div>
            </div>

            {/* Entries */}
            <div className="space-y-4">
              {entries.map((entry, idx) => (
                <div key={idx} className="relative rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 space-y-4 transition-all hover:border-slate-300/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entry {idx + 1}</span>
                    {entries.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEntry(idx)}
                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Briefcase className="h-3 w-3 text-slate-400" />
                        Project
                      </label>
                      <Input
                        value={entry.project}
                        onChange={(e) => updateEntry(idx, "project", e.target.value)}
                        placeholder="Project name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Activity Type</label>
                      <Select
                        value={entry.activityType}
                        onChange={(e) => updateEntry(idx, "activityType", e.target.value)}
                        options={ACTIVITY_TYPES}
                        placeholder="Select activity"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        Hours
                      </label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="24"
                        value={entry.hours || ""}
                        onChange={(e) => updateEntry(idx, "hours", Number(e.target.value))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Description</label>
                    <Textarea
                      value={entry.description}
                      onChange={(e) => updateEntry(idx, "description", e.target.value)}
                      rows={2}
                      className="min-h-[80px]"
                      placeholder="What did you work on?"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">Link to Task <span className="text-slate-400">(optional)</span></label>
                      <Select
                        value={entry.taskId || ""}
                        onChange={(e) => handleTaskSelect(idx, e.target.value)}
                        options={taskOptions}
                        placeholder="No task"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-slate-400" />
                        Blockers <span className="text-slate-400">(optional)</span>
                      </label>
                      <Input
                        value={entry.blockers || ""}
                        onChange={(e) => updateEntry(idx, "blockers", e.target.value)}
                        placeholder="Any blockers?"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="ghost" onClick={addEntry} className="text-teal-700 hover:text-teal-800 hover:bg-teal-50">
              <Plus className="h-4 w-4" /> Add entry
            </Button>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-5 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={() => { setShowForm(false); setEditingId(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                <Send className="h-4 w-4" /> Submit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-pulse flex flex-col items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-200" />
                  <div className="h-4 w-32 rounded bg-slate-200" />
                </div>
              </CardContent>
            </Card>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <FileText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-medium">No work logs submitted yet.</p>
                <p className="text-xs text-slate-400 mt-1">Start by creating your first work log entry.</p>
              </CardContent>
            </Card>
          ) : (
            logs.map((log) => (
              <Card
                key={log.id}
                className="cursor-pointer transition-all hover:shadow-[0_18px_44px_rgba(15,23,42,0.09)] hover:-translate-y-0.5"
                onClick={() => handleEdit(log)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
                        <FileText className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{log.date}</span>
                        <p className="text-xs text-slate-400">
                          {log.entries.length} {log.entries.length === 1 ? "entry" : "entries"}
                          {log.entries[0]?.project && ` · ${log.entries[0].project}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-600">{log.totalHours}h</span>
                      <Badge className={STATUS_STYLES[log.status] || ""}>
                        {log.status.replace(/-/g, " ")}
                      </Badge>
                    </div>
                  </div>
                  {log.reviewRemarks && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/80 border border-amber-100 p-3">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">
                        {log.reviewRemarks}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
