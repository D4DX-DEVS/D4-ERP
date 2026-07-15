"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Staff, Department, Company, SalaryHistory, StatusHistory, ContractHistory, ContractType, Asset, AssetAssignment } from "@/types";
import { getDocument, getSubDocuments, createSubDocument, updateDocument, orderBy, Timestamp, where, getDocuments } from "@/lib/firestore";
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
import { getStatusColor, formatCurrency, formatDate, getInitials } from "@/lib/utils";
import { FEATURES, roleHasFeature } from "@/lib/permissions";
import { getContractStatus, getDaysRemaining, computeContractEndDate, CONTRACT_DURATIONS, type ContractStatus } from "@/lib/contract-utils";
import { useAuthStore } from "@/store/auth-store";
import { LetterGenerator } from "@/components/staff/letter-generator";
import { EmployeeDocuments } from "@/components/staff/employee-documents";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Building2,
  Briefcase,
  CreditCard,
  Shield,
  FileText,
  History,
  User,
  CalendarClock,
  Package,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

type TabKey = "overview" | "salary" | "access" | "documents" | "assets";

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
  const { user: currentUser } = useAuthStore();
  const [grantedFeatures, setGrantedFeatures] = useState<string[]>([]);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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
  const [returnAssetsOnTerminate, setReturnAssetsOnTerminate] = useState(false);

  const [contractHistory, setContractHistory] = useState<(ContractHistory & { id: string })[]>([]);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    contractType: "permanent" as ContractType,
    customEndDate: "",
    reason: "",
  });

  const fetchData = async () => {
    try {
      const staffData = await getDocument<Staff>("staff", staffId);
      if (!staffData) {
        router.push("/dashboard/staff");
        return;
      }
      setStaff(staffData);
      setGrantedFeatures(
        Array.isArray(staffData.grantedFeatures) ? staffData.grantedFeatures : []
      );

      const [dept, comp, salHist, statHist, conHist] = await Promise.all([
        staffData.departmentId ? getDocument<Department>("departments", staffData.departmentId) : null,
        staffData.companyId ? getDocument<Company>("companies", staffData.companyId) : null,
        getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<StatusHistory>("staff", staffId, "statusHistory", [orderBy("createdAt", "desc")]),
        getSubDocuments<ContractHistory>("staff", staffId, "contractHistory", [orderBy("createdAt", "desc")]),
      ]);

      setDepartment(dept);
      setCompany(comp);
      setSalaryHistory(salHist);
      setStatusHistory(statHist);
      setContractHistory(conHist);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load staff profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        approvedBy: currentUser?.staffId || "",
      });

      // Map StatusHistory type to Staff status field
      let newStatus: Staff["status"] = "active";
      if (statusForm.type === "termination") {
        newStatus = "terminated";
      } else if (statusForm.type === "suspension") {
        newStatus = "suspended";
      } else if (statusForm.type === "notice-period") {
        newStatus = "notice-period";
      } else if (statusForm.type === "relieved") {
        newStatus = "relieved";
      }

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        isActive: !["terminated", "relieved"].includes(newStatus),
      };

      await updateDocument("staff", staffId, updatePayload);

      // If terminating and user wants to return assets, close all open assignments
      if (statusForm.type === "termination" && returnAssetsOnTerminate) {
        try {
          const allAssets = await getDocuments<Asset>("assets", [where("currentAssigneeId", "==", staffId)]);
          for (const asset of allAssets) {
            const assignments = await getSubDocuments<AssetAssignment>("assets", asset.id, "assignments", [where("staffId", "==", staffId)]);
            for (const assignment of assignments) {
              if (!assignment.returnDate) {
                await updateDocument(`assets/${asset.id}/assignments`, assignment.id, {
                  returnDate: Timestamp.now(),
                });
              }
            }
            // Mark asset as available
            await updateDocument("assets", asset.id, { status: "available", currentAssigneeId: null });
          }
          toast("success", "Assets returned and marked as available");
        } catch (err) {
          console.error("Error returning assets:", err);
        }
      }

      setStatusDialogOpen(false);
      setReturnAssetsOnTerminate(false);
      toast("success", "Staff status updated");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update staff status");
    } finally {
      setSaving(false);
    }
  };

  const handleExtendContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    setSaving(true);
    try {
      const customEnd = contractForm.customEndDate ? new Date(contractForm.customEndDate) : undefined;
      const newEnd = computeContractEndDate(new Date(), contractForm.contractType, customEnd);

      await createSubDocument("staff", staffId, "contractHistory", {
        previousEndDate: staff.contractEndDate || null,
        newEndDate: newEnd ? Timestamp.fromDate(newEnd) : null,
        contractType: contractForm.contractType,
        reason: contractForm.reason,
        extendedOn: Timestamp.now(),
      });

      await updateDocument("staff", staffId, {
        contractType: contractForm.contractType,
        contractEndDate: newEnd ? Timestamp.fromDate(newEnd) : null,
      });

      setContractDialogOpen(false);
      toast("success", "Contract updated");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update contract");
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (key: string) => {
    setGrantedFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const handleSaveFeatures = async () => {
    setSavingFeatures(true);
    try {
      await updateDocument("staff", staffId, { grantedFeatures });
      toast("success", "Access updated");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update access");
    } finally {
      setSavingFeatures(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!staff) return null;

  const canEditFeatures = currentUser?.role === "admin";

  const contractEndDate = staff.contractEndDate ? new Date(staff.contractEndDate.seconds * 1000) : null;
  const contractStatus = getContractStatus(contractEndDate);
  const contractDaysRemaining = getDaysRemaining(contractEndDate);
  const contractTypeLabel = CONTRACT_DURATIONS.find((d) => d.value === staff.contractType)?.label || "Permanent";
  const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
    none: "bg-gray-50 text-gray-700",
    active: "bg-green-50 text-green-700",
    "expiring-soon": "bg-amber-50 text-amber-700",
    expired: "bg-red-50 text-red-700",
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <User className="h-4 w-4" /> },
    { key: "salary", label: "Salary & Status", icon: <History className="h-4 w-4" /> },
    { key: "access", label: "Access & Features", icon: <Shield className="h-4 w-4" /> },
    { key: "documents", label: "Documents", icon: <FileText className="h-4 w-4" /> },
    { key: "assets", label: "Assets", icon: <Package className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header with profile summary */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" className="mt-1" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 flex items-center gap-4">
          {/* Avatar */}
          <div className="h-16 w-16 rounded-full overflow-hidden bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0">
            {staff.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={staff.profileImage}
                alt={`${staff.firstName} ${staff.lastName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(staff.firstName, staff.lastName)
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {staff.firstName} {staff.lastName}
              </h1>
              <Badge variant={getStatusColor(staff.status)}>{staff.status}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {staff.designation}
              </span>
              {department && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {department.name}
                </span>
              )}
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                {staff.employeeCode}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => {
            setIncrementForm({ ...incrementForm, newSalary: staff.currentSalary });
            setIncrementOpen(true);
          }}>
            <TrendingUp className="h-4 w-4 mr-1.5" />
            Salary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(true)}>
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Status
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setContractForm({ contractType: staff.contractType || "permanent", customEndDate: "", reason: "" });
            setContractDialogOpen(true);
          }}>
            <CalendarClock className="h-4 w-4 mr-1.5" />
            Contract
          </Button>
          {canEditFeatures && (
            <LetterGenerator
              staff={staff}
              staffId={staffId}
              departmentName={department?.name}
              companyName={company?.name}
              companyAddress={company?.address || ""}
              uploadedBy={currentUser?.uid}
            />
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ───── Tab: Overview ───── */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InfoItem icon={<Mail className="h-4 w-4" />} label="Email" value={staff.email} />
                <InfoItem icon={<Phone className="h-4 w-4" />} label="Mobile" value={staff.mobile} />
                <InfoItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="Date of Birth"
                  value={staff.dateOfBirth ? formatDate(new Date(staff.dateOfBirth.seconds * 1000)) : "—"}
                />
                <InfoItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="Date of Joining"
                  value={staff.dateOfJoining ? formatDate(new Date(staff.dateOfJoining.seconds * 1000)) : "—"}
                />
                <InfoItem
                  icon={<MapPin className="h-4 w-4" />}
                  label="Address"
                  value={staff.address ? `${staff.address.street}, ${staff.address.city}, ${staff.address.state} - ${staff.address.pincode}` : "—"}
                />
                <InfoItem icon={<User className="h-4 w-4" />} label="Gender" value={staff.gender} />
              </div>
              {staff.jobDescription && (
                <div className="mt-5 pt-5 border-t">
                  <p className="text-xs text-gray-500 mb-1">Job Description</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{staff.jobDescription}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Current Salary</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(staff.currentSalary)}</p>
                  <p className="text-xs text-gray-400 mt-1">Base: {formatCurrency(staff.baseSalary)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className={`pt-6 rounded-b-lg ${CONTRACT_STATUS_COLORS[contractStatus]}`}>
                <p className="text-xs uppercase tracking-wider opacity-70 mb-1">Contract</p>
                <p className="text-lg font-bold">{contractTypeLabel}</p>
                {contractEndDate ? (
                  <>
                    <p className="text-sm mt-1">Ends {formatDate(contractEndDate)}</p>
                    <p className="text-xs mt-0.5 font-medium">
                      {contractStatus === "expired"
                        ? `Expired ${Math.abs(contractDaysRemaining ?? 0)}d ago`
                        : `${contractDaysRemaining}d remaining`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm mt-1">No end date</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Role</span>
                  <Badge>{staff.role}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Company</span>
                  <span className="text-sm font-medium">{company?.name || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Department</span>
                  <span className="text-sm font-medium">{department?.name || "—"}</span>
                </div>
                {staff.bankDetails && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500 uppercase">Bank Details</span>
                    </div>
                    <p className="text-sm">{staff.bankDetails.bankName}</p>
                    <p className="text-xs text-gray-500 font-mono">{staff.bankDetails.accountNo}</p>
                    <p className="text-xs text-gray-500">IFSC: {staff.bankDetails.ifscCode}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ───── Tab: Salary & Status ───── */}
      {activeTab === "salary" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Salary History</CardTitle>
              <div className="flex gap-2">
                {(currentUser?.role === "admin" || currentUser?.role === "accounts") && (
                  <Link href={`/dashboard/payroll/staff/${staffId}`}>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <DollarSign className="h-4 w-4" />
                      Dossier
                    </Button>
                  </Link>
                )}
                <Button variant="outline" size="sm" onClick={() => {
                  setIncrementForm({ ...incrementForm, newSalary: staff.currentSalary });
                  setIncrementOpen(true);
                }}>
                  <TrendingUp className="h-4 w-4 mr-1.5" />
                  Add Change
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {salaryHistory.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No salary changes recorded</p>
                </div>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Status History</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setStatusDialogOpen(true)}>
                <AlertTriangle className="h-4 w-4 mr-1.5" />
                Change Status
              </Button>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No status changes recorded</p>
                </div>
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contract History</CardTitle>
              <Button variant="outline" size="sm" onClick={() => {
                setContractForm({ contractType: staff.contractType || "permanent", customEndDate: "", reason: "" });
                setContractDialogOpen(true);
              }}>
                <CalendarClock className="h-4 w-4 mr-1.5" />
                Extend
              </Button>
            </CardHeader>
            <CardContent>
              {contractHistory.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarClock className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No contract changes recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contractHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium">
                          {CONTRACT_DURATIONS.find((d) => d.value === h.contractType)?.label || h.contractType}
                        </p>
                        <p className="text-xs text-gray-500">{h.reason}</p>
                        <p className="text-xs text-gray-400">
                          {h.extendedOn ? formatDate(new Date(h.extendedOn.seconds * 1000)) : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>{h.previousEndDate ? formatDate(new Date(h.previousEndDate.seconds * 1000)) : "—"}</p>
                        <p>→ {h.newEndDate ? formatDate(new Date(h.newEndDate.seconds * 1000)) : "Permanent"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ───── Tab: Access & Features ───── */}
      {activeTab === "access" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Access &amp; Features</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Features granted by the <span className="font-semibold">{staff.role}</span> role are enabled automatically. Grant extra features below.
              </p>
            </div>
            {canEditFeatures && staff.role !== "admin" && (
              <Button onClick={handleSaveFeatures} disabled={savingFeatures} size="sm">
                {savingFeatures ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Access
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {staff.role === "admin" ? (
              <div className="text-center py-8">
                <Shield className="h-8 w-8 text-teal-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 font-medium">Admins have access to all features</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURES.map((f) => {
                  const auto = roleHasFeature(staff.role as Parameters<typeof roleHasFeature>[0], f.key);
                  const granted = grantedFeatures.includes(f.key);
                  return (
                    <label
                      key={f.key}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        auto
                          ? "bg-teal-50/50 border-teal-200"
                          : granted
                          ? "border-teal-500 bg-teal-50/30"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={auto || granted}
                        disabled={auto || !canEditFeatures}
                        onChange={() => toggleFeature(f.key)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {f.label}
                          {auto && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded">
                              Role default
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{f.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ───── Tab: Documents ───── */}
      {activeTab === "documents" && (
        <EmployeeDocuments staffId={staffId} canManage={canEditFeatures} uploadedBy={currentUser?.uid} />
      )}

      {/* ───── Tab: Assets ───── */}
      {activeTab === "assets" && (
        <Card>
          <CardHeader>
            <CardTitle>Assigned Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">Current and historical asset assignments for this staff member.</p>
            <div className="space-y-3">
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">Assets assigned to this staff member will appear here.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Salary Change Dialog ───── */}
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

      {/* ───── Status Change Dialog ───── */}
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
                { value: "notice-period", label: "Place on Notice Period" },
                { value: "relieved", label: "Mark as Relieved" },
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
          {(statusForm.type === "suspension" || statusForm.type === "notice-period") && (
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
              placeholder="Provide a brief reason for this status change"
            />
          </div>

          {statusForm.type === "termination" && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Asset Management</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnAssetsOnTerminate}
                  onChange={(e) => setReturnAssetsOnTerminate(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Return all assigned assets</p>
                  <p className="text-xs text-gray-500">Automatically close all asset assignments and mark them as available</p>
                </div>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => {
              setStatusDialogOpen(false);
              setReturnAssetsOnTerminate(false);
            }}>Cancel</Button>
            <Button type="submit" disabled={saving} variant={["termination", "relieved"].includes(statusForm.type) ? "destructive" : "default"}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ───── Extend Contract Dialog ───── */}
      <Dialog open={contractDialogOpen} onClose={() => setContractDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>Extend Contract</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleExtendContract} className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-gray-500">Current</p>
            <p className="font-medium">
              {contractTypeLabel}
              {contractEndDate ? ` — ends ${formatDate(contractEndDate)}` : ""}
            </p>
          </div>
          <div className="space-y-2">
            <Label>New Contract Duration *</Label>
            <Select
              value={contractForm.contractType}
              onChange={(e) => setContractForm({ ...contractForm, contractType: e.target.value as ContractType })}
              options={CONTRACT_DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
          </div>
          {contractForm.contractType === "custom" && (
            <div className="space-y-2">
              <Label>New End Date *</Label>
              <DatePicker
                value={contractForm.customEndDate}
                onChange={(e) => setContractForm({ ...contractForm, customEndDate: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={contractForm.reason}
              onChange={(e) => setContractForm({ ...contractForm, reason: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setContractDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Contract
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
