"use client";

import { useEffect, useMemo, useState } from "react";
import { Asset, AssetCategoryItem, Staff } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
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
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { Package, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function AssetsPage() {
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [assetCategories, setAssetCategories] = useState<(AssetCategoryItem & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const { toast } = useToast();
  const constraints = useMemo(() => {
    const nextConstraints: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [];
    if (search.trim()) {
      nextConstraints.push(searchConstraint(["name", "brand", "serialNumber"], search.trim()));
    }
    if (filterCategory) {
      nextConstraints.push(where("category", "==", filterCategory));
    }
    return nextConstraints;
  }, [search, filterCategory]);
  const {
    data: assets,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Asset>("assets", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState({
    name: "", category: "", brand: "", model: "",
    serialNumber: "", purchaseDate: "", purchasePrice: 0, currentValue: 0,
    companyId: "", status: "available" as Asset["status"],
    currentAssigneeId: "", notes: "", isActive: true,
    productCode: "", allowOutside: false, warrantyDetails: "",
    warrantyExpiryDate: "", noWarranty: false, billUrl: "",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLookups() {
      try {
        const [staff, cats] = await Promise.all([
          getDocuments<Staff>("staff", [where("isActive", "==", true)]),
          getDocuments<AssetCategoryItem>("asset-categories", [where("isActive", "==", true)]),
        ]);
        if (!isMounted) return;
        setStaffList(staff);
        setAssetCategories(cats);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) {
          setLookupsLoading(false);
        }
      }
    }

    void loadLookups();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...form,
        purchaseDate: form.purchaseDate ? Timestamp.fromDate(new Date(form.purchaseDate)) : Timestamp.now(),
        warrantyExpiryDate: form.warrantyExpiryDate ? Timestamp.fromDate(new Date(form.warrantyExpiryDate)) : undefined,
      };
      if (editingId) {
        await updateDocument("assets", editingId, data);
      } else {
        await createDocument("assets", data);
      }
      setDialogOpen(false);
      toast("success", editingId ? "Asset updated" : "Asset added");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({ id });
  };

  const executeDelete = async (id: string) => {
    setConfirmDialog(null);
    try {
      await deleteDocument("assets", id);
      toast("success", "Asset deleted");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete asset");
    }
  };

  const getStaffName = (id?: string) => {
    if (!id) return "—";
    const s = staffList.find((s) => s.id === id);
    return s ? `${s.firstName} ${s.lastName}` : "—";
  };

  const categoryOptions = assetCategories.map((c) => ({ value: c.name, label: c.name }));

  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} assets tracked</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm({ name: "", category: categoryOptions[0]?.value ?? "", brand: "", model: "", serialNumber: "", purchaseDate: "", purchasePrice: 0, currentValue: 0, companyId: "", status: "available", currentAssigneeId: "", notes: "", isActive: true, productCode: "", allowOutside: false, warrantyDetails: "", warrantyExpiryDate: "", noWarranty: false, billUrl: "" }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Asset
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          options={[{ value: "", label: "All Categories" }, ...categoryOptions]} className="w-[180px]" />
      </div>

      {totalCount === 0 ? (
        <Card><CardContent><EmptyState icon={<Package className="h-12 w-12" />} title="No assets found" /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand/Model</TableHead>
                <TableHead>Serial No</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outside</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell><Badge>{asset.category}</Badge></TableCell>
                  <TableCell>{asset.brand} {asset.model}</TableCell>
                  <TableCell className="font-mono text-sm">{asset.serialNumber}</TableCell>
                  <TableCell>{formatCurrency(asset.currentValue || asset.purchasePrice)}</TableCell>
                  <TableCell>{getStaffName(asset.currentAssigneeId)}</TableCell>
                  <TableCell><Badge variant={getStatusColor(asset.status)}>{asset.status}</Badge></TableCell>
                  <TableCell>{asset.allowOutside ? <Badge variant="bg-green-100 text-green-800">Yes</Badge> : <Badge variant="bg-gray-100 text-gray-800">No</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => {
                        setEditingId(asset.id);
                        setForm({
                          name: asset.name,
                          category: asset.category,
                          brand: asset.brand || "",
                          model: asset.model || "",
                          serialNumber: asset.serialNumber,
                          purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate.seconds * 1000).toISOString().split("T")[0] : "",
                          purchasePrice: asset.purchasePrice || 0,
                          currentValue: asset.currentValue || 0,
                          companyId: asset.companyId || "",
                          status: asset.status,
                          currentAssigneeId: asset.currentAssigneeId || "",
                          notes: asset.notes || "",
                          isActive: asset.isActive,
                          productCode: asset.productCode || "",
                          allowOutside: asset.allowOutside || false,
                          warrantyDetails: asset.warrantyDetails || "",
                          warrantyExpiryDate: asset.warrantyExpiryDate ? new Date(asset.warrantyExpiryDate.seconds * 1000).toISOString().split("T")[0] : "",
                          noWarranty: asset.noWarranty || false,
                          billUrl: asset.billUrl || "",
                        });
                        setDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(asset.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader><DialogTitle>{editingId ? "Edit Asset" : "Add Asset"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Category *</Label><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={categoryOptions} placeholder={categoryOptions.length === 0 ? "No categories yet" : "Select category"} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div className="space-y-2"><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Serial Number *</Label><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Purchase Price</Label><Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Current Value</Label><Input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Status</Label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Asset["status"] })} options={[{ value: "available", label: "Available" }, { value: "assigned", label: "Assigned" }, { value: "maintenance", label: "Maintenance" }, { value: "retired", label: "Retired" }]} /></div>
          </div>
          {form.status === "assigned" && (
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={form.currentAssigneeId} onChange={(e) => setForm({ ...form, currentAssigneeId: e.target.value })}
                options={staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))} placeholder="Select" />
            </div>
          )}
          <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Product Code</Label><Input value={form.productCode} onChange={(e) => setForm({ ...form, productCode: e.target.value })} placeholder="SKU / Barcode" /></div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="allowOutside" checked={form.allowOutside} onChange={(e) => setForm({ ...form, allowOutside: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="allowOutside">Allow Outside (for event checkout)</Label>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="noWarranty" checked={form.noWarranty} onChange={(e) => setForm({ ...form, noWarranty: e.target.checked, warrantyDetails: e.target.checked ? "" : form.warrantyDetails, warrantyExpiryDate: e.target.checked ? "" : form.warrantyExpiryDate })} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="noWarranty">No Warranty</Label>
            </div>
            {!form.noWarranty && (
              <>
                <div className="space-y-2"><Label>Warranty Details</Label><Input value={form.warrantyDetails} onChange={(e) => setForm({ ...form, warrantyDetails: e.target.value })} /></div>
                <div className="space-y-2"><Label>Warranty Expiry</Label><Input type="date" value={form.warrantyExpiryDate} onChange={(e) => setForm({ ...form, warrantyExpiryDate: e.target.value })} /></div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? "Update" : "Add"} Asset</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Asset"
        message="Are you sure you want to delete this asset? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
