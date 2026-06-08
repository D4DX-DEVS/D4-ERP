"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument } from "@/lib/firestore";
import { Staff, Department, Company } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmployeeDocuments } from "@/components/staff/employee-documents";
import { Camera, Loader2, User, Phone, Mail, Briefcase, Building, Calendar, IndianRupee } from "lucide-react";

export default function StaffProfilePage() {
  const { user } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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
            const [dept, comp] = await Promise.all([
              data.departmentId ? getDocument<Department>("departments", data.departmentId) : null,
              data.companyId ? getDocument<Company>("companies", data.companyId) : null,
            ]);
            if (isMounted) {
              setDepartment(dept ?? null);
              setCompany(comp ?? null);
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

      {user?.staffId && <EmployeeDocuments staffId={user.staffId} canManage={false} />}
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
