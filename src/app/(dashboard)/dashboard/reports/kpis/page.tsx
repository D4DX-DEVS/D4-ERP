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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/loading";
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
          <Button onClick={() => setDialog(true)}>
            <Plus className="h-4 w-4" /> Add KPI
          </Button>
        }
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : kpis.length === 0 ? (
        <Card><CardContent><EmptyState icon={<Plus className="h-12 w-12" />} title="No KPIs defined yet" description="Add your first KPI to start tracking." /></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpis.map((kpi) => {
            const progress = kpi.target ? Math.min(100, Math.round((kpi.value / kpi.target) * 100)) : null;
            return (
              <Card key={kpi.id}>
                <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-700">{kpi.label}</h4>
                    <p className="text-[1.7rem] font-semibold tracking-[-0.04em] text-slate-950 mt-1">{kpi.value} <span className="text-sm font-normal text-slate-400">{kpi.unit}</span></p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(kpi.id!)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
                {kpi.target && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Target: {kpi.target} {kpi.unit}</span>
                      <span className="font-semibold text-slate-700">{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-teal-600 to-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add KPI</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Label *</Label>
            <Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. Customer Satisfaction" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Current Value</Label>
              <Input type="number" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} placeholder="e.g. 80" />
            </div>
            <div className="space-y-2">
              <Label>Target</Label>
              <Input type="number" value={form.target} onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))} placeholder="e.g. 100" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Unit *</Label>
            <Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} placeholder="e.g. %, hours, tasks" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Save</Button>
        </div>
      </Dialog>

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
