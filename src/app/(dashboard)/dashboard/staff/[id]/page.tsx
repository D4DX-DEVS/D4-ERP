"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Staff, Department, Company, SalaryHistory, StatusHistory } from "@/types";
import { getDocument, getSubDocuments, createSubDocument, updateDocument, orderBy, Timestamp } from "@/lib/firestore";
import { getDocuments, where } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { getStatusColor, formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Ban,
  UserCheck,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

export default function StaffProfilePage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;

  const [staff, setStaff] = useState<(Staff & { id: string }) | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<(SalaryHistory & { id: string })[]>([]);
  const [statusHistory, setStatusHistory] = useState<(StatusHistory & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [incrementOpen, setIncrementOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [incrementForm, setIncrementForm] = useState({
    type: "increment" as SalaryHistory["type"],
    newSalary: 0,
    reason: "",
    effectiveDate: new Date().toISOString().split("T")[0],
  });

  const [statusForm, setStatusForm] = useState({
    type: "suspension" as StatusHistory["type"],
    reason: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });

  const fetchData = async () => {
    try {
      const staffData = await getDocument<Staff>("staff", staffId);
      if (!staffData) {
        router.push("/dashboard/staff");
        return;
      }
      setStaff(staffData);

      const [dept, comp, salHist, statHist] = await Promise.all([
        staffData.departmentId ? getDocument<Department>("departments", staffData.departmentId) : null,
        staffData.companyId ? getDocument<Company>("companies", staffData.companyId) : null,
        getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<StatusHistory>("staff", staffId, "statusHistory", [orderBy("createdAt", "desc")]),
      ]);

      setDepartment(dept);
      setCompany(comp);
      setSalaryHistory(salHist);
      setStatusHistory(statHist);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load staff profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [staffId]);

  const handleIncrement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setSaving(true);
    try {
      await createSubDocument("staff", staffId, "salaryHistory", {
        type: incrementForm.type,
        previousSalary: staff.currentSalary,
        newSalary: incrementForm.newSalary,
        reason: incrementForm.reason,
        effectiveDate: Timestamp.fromDate(new Date(incrementForm.effectiveDate)),
        approvedBy: "",
      });
      await updateDocument("staff", staffId, { currentSalary: incrementForm.newSalary });
      setIncrementOpen(false);
      toast("success", "Salary updated successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update salary");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setSaving(true);
    try {
      await createSubDocument("staff", staffId, "statusHistory", {
        type: statusForm.type,
        reason: statusForm.reason,
        startDate: Timestamp.fromDate(new Date(statusForm.startDate)),
        endDate: statusForm.endDate ? Timestamp.fromDate(new Date(statusForm.endDate)) : null,
        approvedBy: "",
      });

      const newStatus =
        statusForm.type === "termination"
          ? "terminated"
          : statusForm.type === "suspension"
          ? "suspended"
          : "active";

      await updateDocument("staff", staffId, {
        status: newStatus,
        isActive: newStatus !== "terminated",
      });

      setStatusDialogOpen(false);
      toast("success", "Staff status updated");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update staff status");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!staff) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {staff.firstName} {staff.lastName}
          </h1>
          <p className="text-sm text-gray-500">
            {staff.designation} · {department?.name} · {company?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            setIncrementForm({ ...incrementForm, newSalary: staff.currentSalary });
            setIncrementOpen(true);
          }}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Salary Change
          </Button>
          <Button variant="outline" onClick={() => setStatusDialogOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Status Change
          </Button>
        </div>
      </div>

      {/* Profile Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium">{staff.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Mobile</p>
                <p className="text-sm font-medium">{staff.mobile}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Date of Birth</p>
                <p className="text-sm font-medium">
                  {staff.dateOfBirth ? formatDate(new Date(staff.dateOfBirth.seconds * 1000)) : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Date of Joining</p>
                <p className="text-sm font-medium">
                  {staff.dateOfJoining ? formatDate(new Date(staff.dateOfJoining.seconds * 1000)) : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Address</p>
                <p className="text-sm font-medium">
                  {staff.address ? `${staff.address.street}, ${staff.address.city}, ${staff.address.state} - ${staff.address.pincode}` : "—"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Gender</p>
              <p className="text-sm font-medium">{staff.gender}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Employee Code</span>
              <span className="font-mono font-semibold">{staff.employeeCode}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Role</span>
              <Badge>{staff.role}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Status</span>
              <Badge variant={getStatusColor(staff.status)}>{staff.status}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Base Salary</span>
              <span className="font-semibold">{formatCurrency(staff.baseSalary)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Current Salary</span>
              <span className="font-semibold text-green-600">{formatCurrency(staff.currentSalary)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salary History */}
      <Card>
        <CardHeader>
          <CardTitle>Salary History</CardTitle>
        </CardHeader>
        <CardContent>
          {salaryHistory.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No salary changes recorded</p>
          ) : (
            <div className="space-y-3">
              {salaryHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium capitalize">{h.type}</p>
                    <p className="text-xs text-gray-500">{h.reason}</p>
                    <p className="text-xs text-gray-400">
                      {h.effectiveDate ? formatDate(new Date(h.effectiveDate.seconds * 1000)) : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 line-through">{formatCurrency(h.previousSalary)}</p>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(h.newSalary)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status History */}
      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {statusHistory.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No status changes recorded</p>
          ) : (
            <div className="space-y-3">
              {statusHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <Badge variant={getStatusColor(h.type === "termination" ? "terminated" : h.type === "suspension" ? "suspended" : "active")}>
                      {h.type}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">{h.reason}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>{h.startDate ? formatDate(new Date(h.startDate.seconds * 1000)) : ""}</p>
                    {h.endDate && <p>to {formatDate(new Date(h.endDate.seconds * 1000))}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Increment Dialog */}
      <Dialog open={incrementOpen} onClose={() => setIncrementOpen(false)}>
        <DialogHeader>
          <DialogTitle>Salary Change</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleIncrement} className="space-y-4">
          <div className="space-y-2">
            <Label>Change Type *</Label>
            <Select
              value={incrementForm.type}
              onChange={(e) => setIncrementForm({ ...incrementForm, type: e.target.value as SalaryHistory["type"] })}
              options={[
                { value: "increment", label: "Increment" },
                { value: "decrement", label: "Decrement" },
                { value: "upgradation", label: "Upgradation" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Current Salary</Label>
            <Input value={formatCurrency(staff.currentSalary)} disabled className="bg-gray-50" />
          </div>
          <div className="space-y-2">
            <Label>New Salary *</Label>
            <Input
              type="number"
              value={incrementForm.newSalary}
              onChange={(e) => setIncrementForm({ ...incrementForm, newSalary: Number(e.target.value) })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Effective Date *</Label>
            <DatePicker
              value={incrementForm.effectiveDate}
              onChange={(e) => setIncrementForm({ ...incrementForm, effectiveDate: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={incrementForm.reason}
              onChange={(e) => setIncrementForm({ ...incrementForm, reason: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setIncrementOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Change
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>Change Staff Status</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleStatusChange} className="space-y-4">
          <div className="space-y-2">
            <Label>Action *</Label>
            <Select
              value={statusForm.type}
              onChange={(e) => setStatusForm({ ...statusForm, type: e.target.value as StatusHistory["type"] })}
              options={[
                { value: "suspension", label: "Suspend" },
                { value: "termination", label: "Terminate" },
                { value: "reinstatement", label: "Reinstate" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Start Date *</Label>
            <DatePicker
              value={statusForm.startDate}
              onChange={(e) => setStatusForm({ ...statusForm, startDate: e.target.value })}
              required
            />
          </div>
          {statusForm.type === "suspension" && (
            <div className="space-y-2">
              <Label>End Date</Label>
              <DatePicker
                value={statusForm.endDate}
                onChange={(e) => setStatusForm({ ...statusForm, endDate: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={statusForm.reason}
              onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} variant={statusForm.type === "termination" ? "destructive" : "default"}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm {statusForm.type}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
