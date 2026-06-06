"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Company } from "@/types";
import { createDocument, updateDocument, deleteDocument } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { getStatusColor } from "@/lib/utils";
import { Building2, Eye, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const emptyCompany: Omit<Company, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  code: "",
  address: "",
  gstNumber: "",
  panNumber: "",
  bankDetails: { bankName: "", accountNo: "", ifscCode: "", branchName: "" },
  logo: "",
  invoicePrefix: "",
  phone: "",
  email: "",
  website: "",
  isActive: true,
};

export default function CompaniesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCompany);
  const { toast } = useToast();
  const router = useRouter();
  const {
    data: companies,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Company>("companies", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const handleOpen = (company?: Company & { id: string }) => {
    if (company) {
      setEditingId(company.id);
      setForm({
        name: company.name,
        code: company.code || "",
        address: company.address,
        gstNumber: company.gstNumber || "",
        panNumber: company.panNumber,
        bankDetails: company.bankDetails || { bankName: "", accountNo: "", ifscCode: "", branchName: "" },
        logo: company.logo || "",
        invoicePrefix: company.invoicePrefix,
        phone: company.phone,
        email: company.email,
        website: company.website || "",
        isActive: company.isActive,
      });
    } else {
      setEditingId(null);
      setForm(emptyCompany);
    }
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateDocument("companies", editingId, form);
      } else {
        await createDocument("companies", form);
      }
      setDialogOpen(false);
      toast("success", editingId ? "Company updated" : "Company created");
      refresh();
    } catch (error) {
      console.error("Error saving company:", error);
      toast("error", "Failed to save company");
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
      await deleteDocument("companies", id);
      toast("success", "Company deleted");
      refresh();
    } catch (error) {
      console.error("Error deleting company:", error);
      toast("error", "Failed to delete company");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your sub-companies</p>
        </div>
        <Button onClick={() => handleOpen()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Company
        </Button>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Building2 className="h-12 w-12" />}
              title="No companies yet"
              description="Add your first company to get started"
              action={
                <Button onClick={() => handleOpen()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Company
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Companies ({totalCount})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const detailHref = `/dashboard/companies/${company.id}`;

                  return (
                  <TableRow
                    key={company.id}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(detailHref)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(detailHref);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>{company.email}</TableCell>
                    <TableCell>{company.phone}</TableCell>
                    <TableCell>{company.gstNumber || "—"}</TableCell>
                    <TableCell>{company.invoicePrefix}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(company.isActive ? "active" : "terminated")}>
                        {company.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(company)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(company.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}

      {/* Company Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Company" : "Add Company"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice Prefix *</Label>
              <Input
                value={form.invoicePrefix}
                onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                placeholder="e.g., D4M"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company Code</Label>
              <Input
                value={form.code || ""}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g., DM (used in document numbers)"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input
                value={form.gstNumber}
                onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>PAN Number *</Label>
              <Input
                value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Address *</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Website</Label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Bank Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={form.bankDetails.bankName}
                  onChange={(e) =>
                    setForm({ ...form, bankDetails: { ...form.bankDetails, bankName: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Account No</Label>
                <Input
                  value={form.bankDetails.accountNo}
                  onChange={(e) =>
                    setForm({ ...form, bankDetails: { ...form.bankDetails, accountNo: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>IFSC Code</Label>
                <Input
                  value={form.bankDetails.ifscCode}
                  onChange={(e) =>
                    setForm({ ...form, bankDetails: { ...form.bankDetails, ifscCode: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Branch Name</Label>
                <Input
                  value={form.bankDetails.branchName}
                  onChange={(e) =>
                    setForm({ ...form, bankDetails: { ...form.bankDetails, branchName: e.target.value } })
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Create"} Company
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Company"
        message="Are you sure you want to delete this company? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
