"use client";

import { useEffect, useMemo, useState } from "react";
import { AssetCategoryItem } from "@/types";
import { createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Tag, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { logAssetActivity } from "@/lib/asset-activity-logger";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AssetCategoriesPage() {
  const { user } = useAuthStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const constraints = useMemo(() => {
    const c: ReturnType<typeof where>[] = [];
    if (search.trim()) {
      c.push(searchConstraint(["name", "description"], search.trim()));
    }
    return c;
  }, [search]);

  const { data: categories, loading, totalCount, page, totalPages, hasNext, hasPrev, nextPage, prevPage, refresh } = usePagination<AssetCategoryItem>("asset-categories", {
    pageSize: 20,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState({ name: "", description: "", isActive: true });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Check for duplicate name
      const data = { ...form, createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
      if (editingId) {
        await updateDocument("asset-categories", editingId, { ...form, updatedAt: Timestamp.now() });
        toast("success", "Category updated");
        logAssetActivity({ userName: user?.firstName || "System", action: "UPDATE", module: "Categories", resourceId: editingId, details: `Updated category "${form.name}"` });
      } else {
        const id = await createDocument("asset-categories", data);
        toast("success", "Category created");
        logAssetActivity({ userName: user?.firstName || "System", action: "CREATE", module: "Categories", resourceId: id, details: `Created category "${form.name}"` });
      }
      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmDialog({ id, name });
  };

  const executeDelete = async (id: string, name: string) => {
    setConfirmDialog(null);
    try {
      await deleteDocument("asset-categories", id);
      toast("success", "Category deleted");
      logAssetActivity({ userName: user?.firstName || "System", action: "DELETE", module: "Categories", resourceId: id, details: `Deleted category "${name}"` });
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete category");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Categories</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} categories</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm({ name: "", description: "", isActive: true }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Category
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {totalCount === 0 ? (
        <Card><CardContent><EmptyState icon={<Tag className="h-12 w-12" />} title="No categories found" /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-gray-500">{cat.description || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={cat.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {cat.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingId(cat.id);
                        setForm({ name: cat.name, description: cat.description || "", isActive: cat.isActive });
                        setDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cat.id, cat.name)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={20} />
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-lg">
        <DialogHeader><DialogTitle>{editingId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cameras" required /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" /></div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="catActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
            <Label htmlFor="catActive">Active</Label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? "Update" : "Add"}</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Category"
        message={confirmDialog ? `Are you sure you want to delete "${confirmDialog.name}"? This action cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id, confirmDialog.name)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
