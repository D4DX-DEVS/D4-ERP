"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  getDocuments,
  createDocument,
  deleteDocument,
  orderBy,
  Timestamp,
} from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { useToast } from "@/components/ui/toast";
import { ListingHeader } from "@/components/ui/listing";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CustomKPI } from "@/types";

interface KPIDoc extends CustomKPI {
  id?: string;
  departmentId: string;
  createdBy: string;
  createdAt?: unknown;
}

export default function KPIManagementPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [kpis, setKpis] = useState<KPIDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", value: "", target: "", unit: "" });

  useEffect(() => {
    async function fetch() {
      try {
        const data = await getDocuments<KPIDoc>("custom_kpis", [orderBy("createdAt", "desc")]);
        setKpis(data);
      } catch (error) {
        console.error("Failed:", error);
      } finally {
        setLoading(false);
      }
    }
    void fetch();
  }, []);

  const handleCreate = async () => {
    if (!form.label.trim() || !form.unit.trim()) {
      toast("error", "Label and unit are required");
      return;
    }
    try {
      await createDocument("custom_kpis", {
        label: form.label.trim(),
        value: Number(form.value) || 0,
        target: form.target ? Number(form.target) : undefined,
        unit: form.unit.trim(),
        departmentId: user?.departmentId || "",
        createdBy: user?.staffId || "",
        createdAt: Timestamp.now(),
      });
      toast("success", "KPI created");
      setDialog(false);
      setForm({ label: "", value: "", target: "", unit: "" });
      const data = await getDocuments<KPIDoc>("custom_kpis", [orderBy("createdAt", "desc")]);
      setKpis(data);
    } catch {
      toast("error", "Failed to create KPI");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDocument("custom_kpis", deleteId);
      toast("success", "KPI deleted");
      setDeleteId(null);
      setKpis((prev) => prev.filter((k) => k.id !== deleteId));
    } catch {
      toast("error", "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <ListingHeader
        title="KPI Management"
        description="Define and track custom key performance indicators."
        action={
          <button
            onClick={() => setDialog(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add KPI
          </button>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : kpis.length === 0 ? (
        <p className="text-sm text-muted-foreground">No KPIs defined yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi) => {
            const progress = kpi.target ? Math.min(100, Math.round((kpi.value / kpi.target) * 100)) : null;
            return (
              <div key={kpi.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{kpi.label}</h4>
                    <p className="text-2xl font-bold mt-1">{kpi.value} <span className="text-sm font-normal text-muted-foreground">{kpi.unit}</span></p>
                  </div>
                  <button onClick={() => setDeleteId(kpi.id!)} className="rounded p-1 hover:bg-destructive/10 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {kpi.target && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Target: {kpi.target} {kpi.unit}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Add KPI</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Label *</label>
                <input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Customer Satisfaction" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Current Value</label>
                  <input type="number" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Target</label>
                  <input type="number" value={form.target} onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Unit *</label>
                <input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. %, hours, tasks" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDialog(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button onClick={handleCreate} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">Save</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete KPI"
        message="Are you sure you want to delete this KPI?"
        variant="danger"
      />
    </div>
  );
}
