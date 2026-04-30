"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Staff, Company, Department } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint, type QueryConstraint } from "@/lib/firestore";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { getStatusColor, formatCurrency, generateEmployeeCode } from "@/lib/utils";
import { Users, Plus, Pencil, Trash2, Loader2, Eye, Search } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";

export default function StaffPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const constraints = useMemo(() => {
    const nextConstraints: QueryConstraint[] = [];
    if (search.trim()) {
      nextConstraints.push(searchConstraint(["firstName", "lastName", "email", "employeeCode"], search.trim()));
    }
    if (filterDept) {
      nextConstraints.push(where("departmentId", "==", filterDept));
    }
    if (filterStatus) {
      nextConstraints.push(where("status", "==", filterStatus));
    }
    return nextConstraints;
  }, [search, filterDept, filterStatus]);
  const {
    data: staffList,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Staff>("staff", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    address: { street: "", city: "", state: "", pincode: "" },
    dateOfBirth: "",
    gender: "Male" as "Male" | "Female" | "Other",
    dateOfJoining: "",
    departmentId: "",
    companyId: "",
    designation: "",
    baseSalary: 0,
    currentSalary: 0,
    role: "staff" as "admin" | "department-head" | "accounts" | "staff",
    status: "active" as "active" | "suspended" | "terminated" | "on-leave",
    isActive: true,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLookups() {
      try {
        const [comps, depts] = await Promise.all([
          getDocuments<Company>("companies", [where("isActive", "==", true)]),
          getDocuments<Department>("departments", [where("isActive", "==", true)]),
        ]);
        if (!isMounted) return;
        setCompanies(comps);
        setDepartments(depts);
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

  const handleOpen = (staff?: Staff & { id: string }) => {
    if (staff) {
      setEditingId(staff.id);
      setForm({
        employeeCode: staff.employeeCode,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        mobile: staff.mobile,
        address: staff.address || { street: "", city: "", state: "", pincode: "" },
        dateOfBirth: staff.dateOfBirth ? new Date(staff.dateOfBirth.seconds * 1000).toISOString().split("T")[0] : "",
        gender: staff.gender || "Male",
        dateOfJoining: staff.dateOfJoining ? new Date(staff.dateOfJoining.seconds * 1000).toISOString().split("T")[0] : "",
        departmentId: staff.departmentId,
        companyId: staff.companyId,
        designation: staff.designation,
        baseSalary: staff.baseSalary,
        currentSalary: staff.currentSalary,
        role: staff.role || "staff",
        status: staff.status || "active",
        isActive: staff.isActive,
      });
    } else {
      setEditingId(null);
      setForm({
        employeeCode: generateEmployeeCode(),
        firstName: "",
        lastName: "",
        email: "",
        mobile: "",
        address: { street: "", city: "", state: "", pincode: "" },
        dateOfBirth: "",
        gender: "Male",
        dateOfJoining: new Date().toISOString().split("T")[0],
        departmentId: "",
        companyId: "",
        designation: "",
        baseSalary: 0,
        currentSalary: 0,
        role: "staff",
        status: "active",
        isActive: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...form,
        dateOfBirth: Timestamp.fromDate(new Date(form.dateOfBirth)),
        dateOfJoining: Timestamp.fromDate(new Date(form.dateOfJoining)),
        currentSalary: form.currentSalary || form.baseSalary,
      };
      if (editingId) {
        await updateDocument("staff", editingId, data);
        toast("success", "Staff member updated successfully");
      } else {
        await createDocument("staff", data);
        toast("success", "Staff member added successfully");
      }
      setDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Error saving staff:", error);
      toast("error", "Failed to save staff member. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this staff member?")) return;
    try {
      await deleteDocument("staff", id);
      toast("success", "Staff member deleted");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to delete staff member");
    }
  };

  const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || "—";
  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500 mt-1">{totalCount} total staff members</p>
        </div>
        <Button onClick={() => handleOpen()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              options={[{ value: "", label: "All Departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
              className="w-[200px]"
            />
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: "", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "terminated", label: "Terminated" },
              ]}
              className="w-[180px]"
            />
          </div>
        </CardContent>
      </Card>

      {totalCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="No staff found"
              description={search ? "Try a different search term" : "Add your first staff member"}
              action={
                !search ? (
                  <Button onClick={() => handleOpen()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Staff
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map((staff) => {
                  const detailHref = `/dashboard/staff/${staff.id}`;

                  return (
                  <TableRow
                    key={staff.id}
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
                    <TableCell>
                      <div>
                        <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                        <p className="text-xs text-gray-500">{staff.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{staff.employeeCode}</TableCell>
                    <TableCell>{getDeptName(staff.departmentId)}</TableCell>
                    <TableCell>{staff.designation || "—"}</TableCell>
                    <TableCell>{formatCurrency(staff.currentSalary || staff.baseSalary)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(staff.status)}>
                        {staff.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleOpen(staff)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(staff.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={nextPage}
              onPrev={prevPage}
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}

      {/* Staff Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Staff" : "Add Staff"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee Code</Label>
              <Input value={form.employeeCode} disabled className="bg-gray-50 font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Staff["role"] })}
                options={[
                  { value: "staff", label: "Staff" },
                  { value: "department-head", label: "Department Head" },
                  { value: "accounts", label: "Accounts" },
                  { value: "admin", label: "Admin" },
                ]}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Mobile *</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as Staff["gender"] })}
                options={[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                ]}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date of Joining *</Label>
              <Input type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label>Department *</Label>
              <Select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                placeholder="Select department"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Designation *</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Base Salary *</Label>
              <Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value), currentSalary: Number(e.target.value) })} required />
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

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? "Update" : "Add"} Staff
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
