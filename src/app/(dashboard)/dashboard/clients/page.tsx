"use client";

import { useEffect, useState } from "react";
import { Client } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
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
import { UserCheck, Plus, Pencil, Trash2, Loader2, Search, Eye } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";

export default function ClientsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    alternatePhone: "",
    gstNumber: "",
    panNumber: "",
    address: { street: "", city: "", state: "", pincode: "" },
    category: "project" as Client["category"],
    notes: "",
    isActive: true,
    createdBy: "",
  });

  const fetchClients = async () => {
    try {
      const data = await getDocuments<Client>("clients", [orderBy("createdAt", "desc")]);
      setClients(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleOpen = (client?: Client & { id: string }) => {
    if (client) {
      setEditingId(client.id);
      setForm({
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        email: client.email,
        phone: client.phone,
        alternatePhone: client.alternatePhone || "",
        gstNumber: client.gstNumber || "",
        panNumber: client.panNumber || "",
        address: client.address || { street: "", city: "", state: "", pincode: "" },
        category: client.category,
        notes: client.notes || "",
        isActive: client.isActive,
        createdBy: client.createdBy,
      });
    } else {
      setEditingId(null);
      setForm({
        companyName: "",
        contactPerson: "",
        email: "",
        phone: "",
        alternatePhone: "",
        gstNumber: "",
        panNumber: "",
        address: { street: "", city: "", state: "", pincode: "" },
        category: "project",
        notes: "",
        isActive: true,
        createdBy: user?.staffId || "",
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateDocument("clients", editingId, form);
      } else {
        await createDocument("clients", { ...form, createdBy: user?.staffId || "" });
      }
      setDialogOpen(false);
      toast("success", editingId ? "Client updated" : "Client added");
      fetchClients();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save client");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteDocument("clients", id);
      toast("success", "Client deleted");
      fetchClients();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete client");
    }
  };

  const filtered = clients.filter((c) =>
    !search || `${c.companyName} ${c.contactPerson} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Management</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} total clients</p>
        </div>
        <Button onClick={() => handleOpen()}>
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={<UserCheck className="h-12 w-12" />} title="No clients found" action={
              !search ? <Button onClick={() => handleOpen()}><Plus className="h-4 w-4 mr-2" />Add Client</Button> : undefined
            } />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.companyName}</TableCell>
                    <TableCell>{c.contactPerson}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell>{c.email}</TableCell>
                    <TableCell><Badge>{c.category}</Badge></TableCell>
                    <TableCell>{c.gstNumber || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={filtered.length} hasNext={page < totalPages - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Client" : "Add Client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Contact Person *</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Client["category"] })}
                options={[
                  { value: "retainer", label: "Retainer" },
                  { value: "project", label: "Project Based" },
                  { value: "one-time", label: "One Time" },
                ]}
              />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Address</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Street</Label>
                <Input value={form.address.street} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.address.city} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.address.state} onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>Pincode</Label>
                <Input value={form.address.pincode} onChange={(e) => setForm({ ...form, address: { ...form.address, pincode: e.target.value } })} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Add"} Client
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
