"use client";

import { useEffect, useState } from "react";
import { Asset, Staff } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { formatCurrency, getStatusColor } from "@/lib/utils";
import { Package, Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";

export default function AssetsPage() {
  const [assets, setAssets] = useState<(Asset & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [form, setForm] = useState({
    name: "", category: "camera" as Asset["category"], brand: "", model: "",
    serialNumber: "", purchaseDate: "", purchasePrice: 0, currentValue: 0,
    companyId: "", status: "available" as Asset["status"],
    currentAssigneeId: "", notes: "", isActive: true,
  });

  const fetchData = async () => {
    try {
      const [assetList, staff] = await Promise.all([
        getDocuments<Asset>("assets", [orderBy("createdAt", "desc")]),
        getDocuments<Staff>("staff", [where("isActive", "==", true)]),
      ]);
      setAssets(assetList);
      setStaffList(staff);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...form,
        purchaseDate: form.purchaseDate ? Timestamp.fromDate(new Date(form.purchaseDate)) : Timestamp.now(),
      };
      if (editingId) {
        await updateDocument("assets", editingId, data);
      } else {
        await createDocument("assets", data);
      }
      setDialogOpen(false);
      toast("success", editingId ? "Asset updated" : "Asset added");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    try {
      await deleteDocument("assets", id);
      toast("success", "Asset deleted");
      fetchData();
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

  const filtered = assets.filter((a) => {
    const matchSearch = !search || `${a.name} ${a.brand} ${a.serialNumber}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || a.category === filterCategory;
    return matchSearch && matchCat;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const categories = [
    { value: "camera", label: "Camera" }, { value: "lens", label: "Lens" },
    { value: "light", label: "Light" }, { value: "drone", label: "Drone" },
    { value: "vehicle", label: "Vehicle" }, { value: "laptop", label: "Laptop" },
    { value: "other", label: "Other" },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <p className="text-sm text-gray-500 mt-1">{assets.length} assets tracked</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm({ name: "", category: "camera", brand: "", model: "", serialNumber: "", purchaseDate: "", purchasePrice: 0, currentValue: 0, companyId: "", status: "available", currentAssigneeId: "", notes: "", isActive: true }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Asset
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          options={[{ value: "", label: "All Categories" }, ...categories]} className="w-[180px]" />
      </div>

      {filtered.length === 0 ? (
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell><Badge>{asset.category}</Badge></TableCell>
                  <TableCell>{asset.brand} {asset.model}</TableCell>
                  <TableCell className="font-mono text-sm">{asset.serialNumber}</TableCell>
                  <TableCell>{formatCurrency(asset.currentValue || asset.purchasePrice)}</TableCell>
                  <TableCell>{getStaffName(asset.currentAssigneeId)}</TableCell>
                  <TableCell><Badge variant={getStatusColor(asset.status)}>{asset.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingId(asset.id); setForm({ ...asset as any, purchaseDate: asset.purchaseDate ? new Date(asset.purchaseDate.seconds * 1000).toISOString().split("T")[0] : "" }); setDialogOpen(true); }}>
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
          <Pagination page={page} totalPages={totalPages} totalCount={filtered.length} hasNext={page < totalPages - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
        </CardContent></Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader><DialogTitle>{editingId ? "Edit Asset" : "Add Asset"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Category *</Label><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Asset["category"] })} options={categories} /></div>
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
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? "Update" : "Add"} Asset</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
