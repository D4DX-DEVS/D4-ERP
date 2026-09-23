"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Department, Company, Staff } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, where } from "@/lib/firestore";
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
import { Layers, Plus, Pencil, Trash2, Loader2, Eye } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { departmentHeadStatus, type HeadIssue } from "@/lib/department-heads";

/** What the head column says when the named head and the approvers disagree. */
const HEAD_ISSUE_TEXT: Record<HeadIssue, string> = {
  "head-not-approver": "Role is not Department Head — cannot approve",
  "head-other-department": "Belongs to another department — cannot approve here",
  "head-not-set": "Not named — approvals go to",
  "no-approver": "No one can approve — requests wait for admin",
};

export default function DepartmentsPage() {
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [staffList, setStaffList] = useState<(Staff & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", companyId: "", headId: "", isActive: true });
  // Approvals follow the staff role, not this field: offer to grant it when the
  // chosen head does not already hold it.
  const [promoteHead, setPromoteHead] = useState(true);
  const { toast } = useToast();
  const router = useRouter();
  const {
    data: departments,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Department>("departments", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLookups() {
      try {
        const [comps, staff] = await Promise.all([
          getDocuments<Company>("companies", [where("isActive", "==", true)]),
          getDocuments<Staff>("staff", [where("isActive", "==", true)]),
        ]);
        if (!isMounted) return;
        setCompanies(comps);
        setStaffList(staff);
      } catch (error) {
        console.error("Error fetching departments:", error);
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
    setPromoteHead(true);
    setDialogOpen(true);
  };

  const staffName = (id?: string) => {
    const s = staffList.find((x) => x.id === id);
    return s ? `${s.firstName} ${s.lastName}` : "";
  };

  // The head picked in the form, and whether they can approve for this department.
  const chosenHead = staffList.find((s) => s.id === form.headId);
  const headNeedsRole = Boolean(chosenHead && chosenHead.role !== "department-head" && chosenHead.role !== "admin");
  const headInOtherDept = Boolean(chosenHead && editingId && chosenHead.departmentId !== editingId);
  const formApprovers = editingId ? departmentHeadStatus({ id: editingId, headId: null }, staffList).approverIds : [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let departmentId = editingId;
      if (editingId) {
        await updateDocument("departments", editingId, form);
      } else {
        departmentId = await createDocument("departments", form);
      }
      // A head only approves if their staff role says so — keep the two in step.
      if (chosenHead && headNeedsRole && promoteHead && departmentId) {
        await updateDocument("staff", chosenHead.id, {
          role: "department-head",
          ...(chosenHead.departmentId ? {} : { departmentId }),
        });
        setStaffList((prev) => prev.map((s) => (s.id === chosenHead.id ? { ...s, role: "department-head" } : s)));
      }
      setDialogOpen(false);
      toast("success", editingId ? "Department updated" : "Department created");
      refresh();
    } catch (error) {
      console.error("Error saving department:", error);
      toast("error", "Failed to save department");
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
      await deleteDocument("departments", id);
      toast("success", "Department deleted");
      refresh();
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

  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl text-gray-900">Departments</h1>
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
            <CardTitle>All Departments ({totalCount})</CardTitle>
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
                {departments.map((dept) => {
                  const detailHref = `/dashboard/departments/${dept.id}`;

                  return (
                  <TableRow
                    key={dept.id}
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
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell>{getCompanyName(dept.companyId)}</TableCell>
                    <TableCell>
                      {(() => {
                        const { approverIds, issue } = departmentHeadStatus(dept, staffList);
                        return (
                          <div className="space-y-0.5">
                            <p>{getHeadName(dept.headId)}</p>
                            {issue ? (
                              <p
                                className={`text-xs ${issue === "no-approver" ? "text-slate-500" : "text-amber-700"}`}
                              >
                                {HEAD_ISSUE_TEXT[issue]}
                                {issue === "head-not-set" ? ` ${approverIds.map(staffName).join(", ")}` : ""}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{dept.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(dept.isActive ? "active" : "terminated")}>
                        {dept.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(dept)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(dept.id)}>
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
            {!form.headId && formApprovers.length > 0 ? (
              <p className="text-xs text-slate-600">
                Approves this department&apos;s requests by role:{" "}
                {formApprovers.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="mr-2 font-medium text-indigo-600 underline-offset-2 hover:underline"
                    onClick={() => setForm({ ...form, headId: id })}
                  >
                    Set {staffName(id)} as head
                  </button>
                ))}
              </p>
            ) : null}
            {headNeedsRole ? (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                  checked={promoteHead}
                  onChange={(e) => setPromoteHead(e.target.checked)}
                />
                <span>
                  {chosenHead?.firstName}&apos;s role is <b>{chosenHead?.role}</b>, so they cannot approve leave or
                  review tasks yet. Give them the <b>Department Head</b> role when saving.
                </span>
              </label>
            ) : null}
            {headInOtherDept && !headNeedsRole ? (
              <p className="text-xs text-amber-700">
                {chosenHead?.firstName} belongs to another department — they approve that department&apos;s requests,
                not this one&apos;s. Move them in Staff if they should lead this team.
              </p>
            ) : null}
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

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Department"
        message="Are you sure you want to delete this department? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
