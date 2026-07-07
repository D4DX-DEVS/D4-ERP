"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Staff, Company, Department, Shift, ContractType } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, where, Timestamp, search as searchConstraint, type QueryConstraint } from "@/lib/firestore";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { Pagination } from "@/components/ui/pagination";
import { getStatusColor, formatCurrency, generateEmployeeCode } from "@/lib/utils";
import { CONTRACT_DURATIONS, computeContractEndDate } from "@/lib/contract-utils";
import { Users, Plus, Pencil, Trash2, Loader2, Eye, Search } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function StaffPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [shifts, setShifts] = useState<(Shift & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string } | null>(null);
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

  const [formStep, setFormStep] = useState(1);
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
    shiftId: "",
    isActive: true,
    jobDescription: "",
    contractType: "permanent" as ContractType,
    contractEndDate: "",
    grantedFeatures: [] as string[],
  });

  const setContractType = (type: ContractType) => {
    const start = form.dateOfJoining ? new Date(form.dateOfJoining) : new Date();
    const computed = computeContractEndDate(start, type);
    setForm((f) => ({
      ...f,
      contractType: type,
      contractEndDate: computed ? computed.toISOString().split("T")[0] : "",
    }));
  };

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
        getDocuments<Shift>("shifts", [where("isActive", "==", true)])
          .then((list) => { if (isMounted) setShifts(list); })
          .catch((error) => console.error("Error:", error));
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
        shiftId: staff.shiftId || "",
        isActive: staff.isActive,
        jobDescription: staff.jobDescription || "",
        contractType: staff.contractType || "permanent",
        contractEndDate: staff.contractEndDate ? new Date(staff.contractEndDate.seconds * 1000).toISOString().split("T")[0] : "",
        grantedFeatures: staff.grantedFeatures || [],
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
        shiftId: "",
        isActive: true,
        jobDescription: "",
        contractType: "permanent",
        contractEndDate: "",
        grantedFeatures: [],
      });
    }
    setFormStep(1);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...form,
        dateOfBirth: form.dateOfBirth ? Timestamp.fromDate(new Date(form.dateOfBirth)) : null,
        dateOfJoining: form.dateOfJoining ? Timestamp.fromDate(new Date(form.dateOfJoining)) : null,
        currentSalary: form.currentSalary || form.baseSalary,
        contractEndDate: form.contractEndDate ? Timestamp.fromDate(new Date(form.contractEndDate)) : null,
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
    setConfirmDialog({ id });
  };

  const executeDelete = async (id: string) => {
    setConfirmDialog(null);
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

        {/* Step Tabs */}
        <div className="flex border-b mb-4">
          <button
            type="button"
            onClick={() => setFormStep(1)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 1 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            1. Personal Info
          </button>
          <button
            type="button"
            onClick={() => setFormStep(2)}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${formStep === 2 ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            2. Work & Address
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Step 1: Personal Info */}
          {formStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee Code *</Label>
                  <Input
                    value={form.employeeCode}
                    onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                    className="font-mono"
                    required
                  />
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
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mobile *</Label>
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <DatePicker value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as Staff["gender"] })}
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "Other", label: "Other" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Joining</Label>
                  <DatePicker value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button type="button" onClick={() => setFormStep(2)}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Work & Address */}
          {formStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Select
                    value={form.companyId}
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select company"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    placeholder="Select department"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Designation</Label>
                  <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Base Salary</Label>
                  <Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value), currentSalary: Number(e.target.value) })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Job Description</Label>
                <Textarea
                  value={form.jobDescription}
                  onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                  placeholder="Key responsibilities for this role..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Duration</Label>
                  <Select
                    value={form.contractType}
                    onChange={(e) => setContractType(e.target.value as ContractType)}
                    options={CONTRACT_DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>
                {form.contractType !== "permanent" && (
                  <div className="space-y-2">
                    <Label>Contract End Date</Label>
                    <DatePicker
                      value={form.contractEndDate}
                      onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })}
                      min={form.dateOfJoining || undefined}
                    />
                  </div>
                )}
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

              <div className="flex justify-between pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setFormStep(1)}>
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {editingId ? "Update" : "Add"} Staff
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDialog}
        title="Delete Staff Member"
        message="Are you sure you want to delete this staff member? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDialog && executeDelete(confirmDialog.id)}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
