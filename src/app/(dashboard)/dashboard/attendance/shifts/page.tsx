"use client";

import { useEffect, useState } from "react";
import { Shift } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument } from "@/lib/firestore";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

type ShiftRec = Shift & { id: string };

const EMPTY_FORM = {
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  graceMinutes: 10,
  isOvernight: false,
  color: "#0ea5e9",
  isActive: true,
};

export default function ShiftsPage() {
  const { authorized, isLoading } = useRoleGuard(["admin"]);
  const { toast } = useToast();

  const [shifts, setShifts] = useState<ShiftRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  async function loadShifts() {
    setLoading(true);
    try {
      const list = await getDocuments<Shift>("shifts", []);
      list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
      setShifts(list as ShiftRec[]);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load shifts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authorized) loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  function handleOpen(shift?: ShiftRec) {
    if (shift) {
      setEditingId(shift.id);
      setForm({
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes ?? 0,
        isOvernight: !!shift.isOvernight,
        color: shift.color || "#0ea5e9",
        isActive: shift.isActive,
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    }
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form, isOvernight: form.endTime <= form.startTime ? true : form.isOvernight };
      if (editingId) {
        await updateDocument("shifts", editingId, data);
        toast("success", "Shift updated");
      } else {
        await createDocument("shifts", data);
        toast("success", "Shift created");
      }
      setDialogOpen(false);
      await loadShifts();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save shift");
    } finally {
      setSaving(false);
    }
  }

  async function executeDelete(id: string) {
    setConfirmDialog(null);
    try {
      await deleteDocument("shifts", id);
      toast("success", "Shift deleted");
      await loadShifts();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete shift");
    }
  }

  if (isLoading || !authorized) return <PageLoader />;
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="Shifts"
        description="Define work shifts that can be assigned to staff for attendance evaluation."
        action={
          <Button onClick={() => handleOpen()}>
            <Plus className="h-4 w-4" />
            Add Shift
          </Button>
        }
      />

      <ListingPanel title={`Shifts (${shifts.length})`} description="Grace minutes allow a buffer before a check-in is flagged late." contentClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Grace</TableHead>
              <TableHead>Overnight</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No shifts defined yet.
                </TableCell>
              </TableRow>
            ) : (
              shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-slate-950">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color || "#0ea5e9" }} />
                      {s.name}
                    </span>
                  </TableCell>
                  <TableCell>{s.startTime}</TableCell>
                  <TableCell>{s.endTime}</TableCell>
                  <TableCell>{s.graceMinutes ?? 0} min</TableCell>
                  <TableCell>{s.isOvernight ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpen(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDialog({ id: s.id })}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ListingPanel>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Shift" : "Add Shift"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Shift Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Morning Shift"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>End Time *</Label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Grace (minutes)</Label>
              <Input type="number" min={0} value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Colour</Label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" checked={form.isOvernight} onChange={(e) => setForm({ ...form, isOvernight: e.target.checked })} />
              Overnight shift
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Create"} Shift
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Shift"
        message="Are you sure you want to delete this shift? Staff assigned to it will fall back to the default schedule."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
