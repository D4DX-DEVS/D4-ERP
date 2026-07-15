"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument, getSubDocuments, getDocuments, where, orderBy } from "@/lib/firestore";
import { Staff, Department, Company, SalaryHistory, Payroll, AssetAssignment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmployeeDocuments } from "@/components/staff/employee-documents";
import { Camera, Loader2, User, Phone, Mail, Briefcase, Building, Calendar, IndianRupee } from "lucide-react";

type TabKey = "overview" | "salary" | "documents" | "assets";

export default function StaffProfilePage() {
  const { user } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<(SalaryHistory & { id: string })[]>([]);
  const [payrolls, setPayrolls] = useState<(Payroll & { id: string })[]>([]);
  const [assignments, setAssignments] = useState<(AssetAssignment & { id: string; assetName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const staffId = user?.staffId;
    let isMounted = true;

    async function load() {
      if (!staffId) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const data = await getDocument<Staff>("staff", staffId);
        if (isMounted) {
          setStaff(data);
          if (data) {
            const [dept, comp, salHist, payrollList] = await Promise.all([
              data.departmentId ? getDocument<Department>("departments", data.departmentId) : null,
              data.companyId ? getDocument<Company>("companies", data.companyId) : null,
              getSubDocuments<SalaryHistory>("staff", staffId, "salaryHistory", [orderBy("createdAt", "desc")]),
              getDocuments<Payroll>("payroll", [where("staffId", "==", staffId)]),
            ]);
            if (isMounted) {
              setDepartment(dept ?? null);
              setCompany(comp ?? null);
              setSalaryHistory(salHist);
              setPayrolls(payrollList);
            }
          }
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "profiles");

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Upload failed");
      }
      const { url } = (await uploadRes.json()) as { url: string };

      const saveRes = await fetch("/api/staff/profile-image", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileImage: url }),
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Save failed");
      }

      setStaff((prev) => (prev ? { ...prev, profileImage: url } : prev));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!staff) {
    return <p className="text-center text-gray-500 py-8">Profile not found.</p>;
  }

  const statusColor = staff.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Profile</h1>

      {/* Avatar & Name */}
      <Card>
        <CardContent className="p-6 text-center">
          {/* Clickable avatar with camera overlay */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="group relative h-24 w-24 rounded-full overflow-hidden ring-4 ring-emerald-100 focus:outline-none focus-visible:ring-emerald-400"
              aria-label="Change profile photo"
            >
              {staff.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={staff.profileImage}
                  alt={`${staff.firstName} ${staff.lastName}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-emerald-100 text-emerald-700 text-3xl font-bold">
                  {staff.firstName?.charAt(0) || "?"}
                </span>
              )}
              {/* Hover overlay */}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-white" />
                    <span className="text-[10px] font-semibold text-white">Change</span>
                  </>
                )}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>

          <h2 className="text-lg font-bold mt-3">{staff.firstName} {staff.lastName}</h2>
          <p className="text-sm text-gray-500">{staff.designation}</p>
          <Badge variant={statusColor} className="mt-2">{staff.status}</Badge>
          {uploadError && (
            <p className="mt-2 text-xs text-red-500">{uploadError}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">Tap photo to update your profile picture</p>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="border-b flex gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "overview" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("salary")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "salary" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Salary
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "documents" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Documents
        </button>
        <button
          onClick={() => setActiveTab("assets")}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "assets" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          My Assets
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Personal Info */}
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={<User className="h-4 w-4" />} label="Employee Code" value={staff.employeeCode} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={staff.mobile} />
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={staff.email || "—"} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date of Birth" value={staff.dateOfBirth ? formatDate(new Date(staff.dateOfBirth.seconds * 1000)) : "—"} />
              <InfoRow icon={<MapPinIcon />} label="Address" value={staff.address ? [staff.address.street, staff.address.city, staff.address.state, staff.address.pincode].filter(Boolean).join(", ") || "—" : "—"} />
            </CardContent>
          </Card>

          {/* Employment Info */}
          <Card>
            <CardHeader><CardTitle>Employment Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Department" value={department?.name || staff.departmentId || "—"} />
              <InfoRow icon={<Building className="h-4 w-4" />} label="Company" value={company?.name || staff.companyId || "—"} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Joining Date" value={staff.dateOfJoining ? formatDate(new Date(staff.dateOfJoining.seconds * 1000)) : "—"} />
              <InfoRow icon={<IndianRupee className="h-4 w-4" />} label="Current Salary" value={staff.currentSalary ? formatCurrency(staff.currentSalary) : "—"} />
            </CardContent>
          </Card>

          {/* Bank Info */}
          {staff.bankDetails && (
            <Card>
              <CardHeader><CardTitle>Bank Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="Bank" value={staff.bankDetails.bankName || "—"} />
                <InfoRow label="Account" value={staff.bankDetails.accountNo || "—"} />
                <InfoRow label="IFSC" value={staff.bankDetails.ifscCode || "—"} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Salary Tab */}
      {activeTab === "salary" && (
        <div className="space-y-4">
          {/* Current Salary */}
          <Card>
            <CardHeader><CardTitle>Current Salary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-600">{formatCurrency(staff.currentSalary || 0)}</p>
              <p className="text-xs text-gray-500 mt-2">Per Month</p>
            </CardContent>
          </Card>

          {/* Salary History */}
          {salaryHistory.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Salary History</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {salaryHistory.map((entry) => (
                    <div key={entry.id} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium capitalize">{entry.type}</p>
                        <p className="text-xs text-gray-500">{entry.reason}</p>
                        <p className="text-xs text-gray-400 mt-1">{entry.effectiveDate ? formatDate(new Date(entry.effectiveDate.seconds * 1000)) : "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatCurrency(entry.newSalary)}</p>
                        <p className="text-xs text-gray-500">
                          {entry.previousSalary ? `from ${formatCurrency(entry.previousSalary)}` : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payslips */}
          {payrolls.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Payslips</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {payrolls.map((payroll) => (
                    <div key={payroll.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{payroll.month}/{payroll.year}</p>
                        <p className="text-xs text-gray-500">Net Salary</p>
                      </div>
                      <p className="text-sm font-medium text-emerald-600">{formatCurrency(payroll.netSalary || 0)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {salaryHistory.length === 0 && payrolls.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-500 text-sm">No salary records yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === "documents" && (
        user?.staffId && <EmployeeDocuments staffId={user.staffId} canManage={false} />
      )}

      {/* Assets Tab */}
      {activeTab === "assets" && (
        <Card>
          <CardHeader><CardTitle>Assigned Assets</CardTitle></CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No assets assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium">{assignment.assetName || "Asset"}</p>
                    <div className="flex justify-between mt-2">
                      <div className="text-xs text-gray-500">
                        <p>Assigned: {assignment.assignedDate ? formatDate(new Date(assignment.assignedDate.seconds * 1000)) : "—"}</p>
                        {assignment.returnDate && (
                          <p>Returned: {formatDate(new Date(assignment.returnDate.seconds * 1000))}</p>
                        )}
                      </div>
                      <Badge variant={!assignment.returnDate ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}>
                        {!assignment.returnDate ? "Active" : "Returned"}
                      </Badge>
                    </div>
                    {assignment.condition && (
                      <p className="text-xs text-gray-500 mt-2 capitalize">Condition: {assignment.condition}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MapPinIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>;
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="mt-0.5 text-gray-400">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
