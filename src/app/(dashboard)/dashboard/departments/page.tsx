"use client";

import { useEffect, useState } from "react";
import { Department, Company, Staff } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, where } from "@/lib/firestore";
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
import { getStatusColor } from "@/lib/utils";
import { Layers, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", companyId: "", headId: "", isActive: true });
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchData = async () => {
    try {
      const [depts, comps, staff] = await Promise.all([
        getDocuments<Department>("departments", [orderBy("createdAt", "desc")]),
        getDocuments<Company>("companies", [where("isActive", "==", true)]),
        getDocuments<Staff>("staff", [where("isActive", "==", true)]),
      ]);
      setDepartments(depts);
      setCompanies(comps);
      setStaffList(staff);
    } catch (error) {
      console.error("Error fetching departments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpen = (dept?: Department & { id: string }) => {
    if (dept) {
      setEditingId(dept.id);
      setForm({
        name: dept.name,
        description: dept.description,
        companyId: dept.companyId,
        headId: dept.headId || "",
        isActive: dept.isActive,
      });
    } else {
      setEditingId(null);
      setForm({ name: "", description: "", companyId: "", headId: "", isActive: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateDocument("departments", editingId, form);
      } else {
        await createDocument("departments", form);
      }
      setDialogOpen(false);
      toast("success", editingId ? "Department updated" : "Department created");
      fetchData();
    } catch (error) {
      console.error("Error saving department:", error);
      toast("error", "Failed to save department");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      await deleteDocument("departments", id);
      toast("success", "Department deleted");
      fetchData();
    } catch (error) {
      console.error("Error deleting department:", error);
      toast("error", "Failed to delete department");
    }
  };

  const getCompanyName = (companyId: string) =>
    companies.find((c) => c.id === companyId)?.name || "—";

  const getHeadName = (headId?: string) => {
    if (!headId) return "—";
    const s = staffList.find((s) => s.id === headId);
    return s ? `${s.firstName} ${s.lastName}` : "—";
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">Manage organization departments</p>
        </div>
        <Button onClick={() => handleOpen()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Department
        </Button>
      </div>

      {departments.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No departments yet"
              description="Create your first department"
              action={
                <Button onClick={() => handleOpen()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Department
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Departments ({departments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell>{getCompanyName(dept.companyId)}</TableCell>
                    <TableCell>{getHeadName(dept.headId)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{dept.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(dept.isActive ? "active" : "terminated")}>
                        {dept.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(dept)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(dept.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={Math.ceil(departments.length / PAGE_SIZE)} totalCount={departments.length} hasNext={page < Math.ceil(departments.length / PAGE_SIZE) - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Department" : "Add Department"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Department Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Digital Marketing"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Company *</Label>
            <Select
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select company"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Department Head</Label>
            <Select
              value={form.headId}
              onChange={(e) => setForm({ ...form, headId: e.target.value })}
              options={[
                { value: "", label: "None" },
                ...staffList.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
              ]}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Department description"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Create"} Department
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
