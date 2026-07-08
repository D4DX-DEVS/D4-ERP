"use client";

import { useMemo, useState } from "react";
import { AssetPerson } from "@/types";
import { createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Users, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { logAssetActivity } from "@/lib/asset-activity-logger";
import { useAuthStore } from "@/store/auth-store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AssetPersonsPage() {
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
      c.push(searchConstraint(["name", "email", "department"], search.trim()));
    }
    return c;
  }, [search]);

  const { data: persons, loading, totalCount, page, totalPages, hasNext, hasPrev, nextPage, prevPage, refresh } = usePagination<AssetPerson>("asset-persons", {
    pageSize: 20,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState({ name: "", phone: "", email: "", department: "", isActive: true });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateDocument("asset-persons", editingId, { ...form, updatedAt: Timestamp.now() });
        toast("success", "Person updated");
        logAssetActivity({ userName: user?.firstName || "System", action: "UPDATE", module: "Persons", resourceId: editingId, details: `Updated person "${form.name}"` });
      } else {
        const id = await createDocument("asset-persons", { ...form, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
        toast("success", "Person created");
        logAssetActivity({ userName: user?.firstName || "System", action: "CREATE", module: "Persons", resourceId: id, details: `Created person "${form.name}"` });
      }
      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save person");
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
      await deleteDocument("asset-persons", id);
      toast("success", "Person deleted");
      logAssetActivity({ userName: user?.firstName || "System", action: "DELETE", module: "Persons", resourceId: id, details: `Deleted person "${name}"` });
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete person");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Persons</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} persons</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm({ name: "", phone: "", email: "", department: "", isActive: true }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Person
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search persons..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {totalCount === 0 ? (
        <Card><CardContent><EmptyState icon={<Users className="h-12 w-12" />} title="No persons found" /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {persons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.name}</TableCell>
                  <TableCell>{person.phone || "—"}</TableCell>
                  <TableCell>{person.email || "—"}</TableCell>
                  <TableCell>{person.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={person.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {person.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingId(person.id);
                        setForm({ name: person.name, phone: person.phone || "", email: person.email || "", department: person.department || "", isActive: person.isActive });
                        setDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(person.id, person.name)}>
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
        <DialogHeader><DialogTitle>{editingId ? "Edit Person" : "Add Person"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nihal K" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></div>
          </div>
          <div className="space-y-2"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Operations" /></div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="personActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
            <Label htmlFor="personActive">Active</Label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? "Update" : "Add"}</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Person"
        message={confirmDialog ? `Are you sure you want to delete "${confirmDialog.name}"? This action cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id, confirmDialog.name)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
