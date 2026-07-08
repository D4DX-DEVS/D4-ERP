"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, Timestamp } from "@/lib/firestore";
import { Banner, Department } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUpload } from "@/components/ui/file-upload";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Image as ImageIcon, Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from "lucide-react";

const emptyForm = {
  title: "",
  message: "",
  imageUrl: "",
  link: "",
  startDate: "",
  endDate: "",
  priority: 0,
  audience: "all" as Banner["audience"],
  departmentId: "",
  isActive: true,
};

function toDateInput(ts?: { seconds: number }): string {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds * 1000).toISOString().split("T")[0];
}

export default function BannersPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [banners, setBanners] = useState<(Banner & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<(Banner & { id: string }) | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [list, depts] = await Promise.all([
        getDocuments<Banner>("banners", [orderBy("priority", "desc")]),
        getDocuments<Department>("departments", [orderBy("name", "asc")]),
      ]);
      setBanners(list);
      setDepartments(depts);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function load() {
      await fetchData();
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (b: Banner & { id: string }) => {
    setEditing(b);
    setForm({
      title: b.title,
      message: b.message || "",
      imageUrl: b.imageUrl || "",
      link: b.link || "",
      startDate: toDateInput(b.startDate as { seconds: number } | undefined),
      endDate: toDateInput(b.endDate as { seconds: number } | undefined),
      priority: b.priority ?? 0,
      audience: b.audience || "all",
      departmentId: b.departmentId || "",
      isActive: b.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast("error", "Title is required");
      return;
    }
    if (!form.imageUrl && !form.message.trim()) {
      toast("error", "Add an image or a message");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        message: form.message.trim() || null,
        imageUrl: form.imageUrl || null,
        link: form.link.trim() || null,
        startDate: form.startDate ? Timestamp.fromDate(new Date(form.startDate)) : null,
        endDate: form.endDate ? Timestamp.fromDate(new Date(form.endDate)) : null,
        priority: Number(form.priority) || 0,
        audience: form.audience,
        departmentId: form.audience === "department" ? form.departmentId || null : null,
        isActive: form.isActive,
      };
      if (editing) {
        await updateDocument("banners", editing.id, { ...payload, updatedAt: Timestamp.now() });
        toast("success", "Banner updated");
      } else {
        await createDocument("banners", { ...payload, createdBy: user?.staffId || "", createdAt: Timestamp.now() });
        toast("success", "Banner created");
      }
      setDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save banner");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: Banner & { id: string }) => {
    try {
      await updateDocument("banners", b.id, { isActive: !b.isActive, updatedAt: Timestamp.now() });
      await fetchData();
    } catch {
      toast("error", "Failed to update banner");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDocument("banners", deleteId);
      toast("success", "Banner deleted");
      setDeleteId(null);
      await fetchData();
    } catch {
      toast("error", "Failed to delete banner");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Banners</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Banner
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent mx-auto" />
        </div>
      ) : banners.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ImageIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No banners yet. Create one for your staff portal.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {banners.map((b) => (
            <Card key={b.id} className={!b.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt={b.title} className="mb-3 h-32 w-full rounded-xl border border-slate-200 object-cover" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{b.title}</p>
                    {b.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{b.message}</p>}
                  </div>
                  <Badge variant={b.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                    {b.isActive ? "Active" : "Hidden"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
                  <span>Priority {b.priority ?? 0}</span>
                  <span>• {b.audience === "all" ? "All staff" : departments.find((d) => d.id === b.departmentId)?.name || "Department"}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(b)}>
                    {b.isActive ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {b.isActive ? "Hide" : "Show"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(b.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1 text-red-400" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Banner" : "New Banner"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Annual Day Celebration" />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Image</Label>
            <FileUpload value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} folder="banners" accept="image/*" preview="image" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value as Banner["audience"] })}
                options={[
                  { value: "all", label: "All staff" },
                  { value: "department", label: "Department" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} placeholder="e.g. 1" />
            </div>
          </div>
          {form.audience === "department" && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                placeholder="Select department"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start date (optional)</Label>
              <DatePicker value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End date (optional)</Label>
              <DatePicker value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Link (optional)</Label>
            <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active (visible to staff)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete banner?"
        message="This banner will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
