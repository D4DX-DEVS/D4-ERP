"use client";

import { useMemo, useState } from "react";
import { Item } from "@/types";
import { createDocument, updateDocument, deleteDocument, search as searchConstraint } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Package, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** Generates a fallback item code from the name + a short random suffix. */
function suggestItemCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 4) || "ITEM";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${suffix}`;
}

const EMPTY_FORM = {
  name: "",
  itemCode: "",
  type: "service" as Item["type"],
  rate: 0,
  sacCode: "",
  hsnCode: "",
  unit: "",
  category: "",
  description: "",
  isActive: true,
};

export default function ItemsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const constraints = useMemo(() => {
    if (!search.trim()) return [];
    return [searchConstraint(["name", "itemCode", "sacCode", "hsnCode", "category"], search.trim())];
  }, [search]);
  const {
    data: items,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Item>("items", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState(EMPTY_FORM);

  const handleOpen = (item?: Item & { id: string }) => {
    if (item) {
      setEditingId(item.id);
      setForm({
        name: item.name,
        itemCode: item.itemCode,
        type: item.type,
        rate: item.rate,
        sacCode: item.sacCode || "",
        hsnCode: item.hsnCode || "",
        unit: item.unit || "",
        category: item.category || "",
        description: item.description || "",
        isActive: item.isActive,
      });
    } else {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("error", "Item name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        itemCode: form.itemCode.trim() || suggestItemCode(form.name),
        rate: Number(form.rate) || 0,
      };
      if (editingId) {
        await updateDocument("items", editingId, payload);
      } else {
        await createDocument("items", { ...payload, createdBy: user?.staffId || "" });
      }
      setDialogOpen(false);
      toast("success", editingId ? "Item updated" : "Item added");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (id: string) => {
    setConfirmDialog(null);
    try {
      await deleteDocument("items", id);
      toast("success", "Item deleted");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete item");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Master</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} products &amp; services</p>
        </div>
        <Button onClick={() => handleOpen()}>
          <Plus className="h-4 w-4 mr-2" /> Add Item
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search by name, code, SAC/HSN..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {totalCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title="No items found"
              description="Add products and services to reuse them on quotations and invoices."
              action={!search ? <Button onClick={() => handleOpen()}><Plus className="h-4 w-4 mr-2" />Add Item</Button> : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SAC / HSN</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="font-mono text-xs">{it.itemCode}</TableCell>
                    <TableCell><Badge>{it.type}</Badge></TableCell>
                    <TableCell>{it.sacCode || it.hsnCode || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(it.rate)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(it)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDialog({ id: it.id })}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Item Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Item Code</Label>
              <Input value={form.itemCode} placeholder="Auto-generated if blank" onChange={(e) => setForm({ ...form, itemCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Item["type"] })}
                options={[
                  { value: "service", label: "Service" },
                  { value: "product", label: "Product" },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Rate *</Label>
              <Input type="number" min={0} step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} required />
            </div>
            <div className="space-y-2">
              <Label>{form.type === "product" ? "HSN Code" : "SAC Code"}</Label>
              {form.type === "product" ? (
                <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
              ) : (
                <Input value={form.sacCode} onChange={(e) => setForm({ ...form, sacCode: e.target.value })} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input value={form.unit} placeholder="e.g. nos, hr, month" onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={form.category} placeholder="e.g. Design, Printing, Media" onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Add"} Item
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
