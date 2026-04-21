"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { getDocument } from "@/lib/firestore";
import { Staff } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { User, Phone, Mail, Briefcase, Building, Calendar, IndianRupee } from "lucide-react";

export default function StaffProfilePage() {
  const { user } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!user?.staffId) return;
      try {
        const data = await getDocument<Staff>("staff", user.staffId);
        setStaff(data);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

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
          <div className="h-20 w-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
            {staff.firstName?.charAt(0) || "?"}
          </div>
          <h2 className="text-lg font-bold mt-3">{staff.firstName} {staff.lastName}</h2>
          <p className="text-sm text-gray-500">{staff.designation}</p>
          <Badge variant={statusColor} className="mt-2">{staff.status}</Badge>
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
          <InfoRow icon={<MapPinIcon />} label="Address" value={staff.address ? `${staff.address.street || ""}, ${staff.address.city || ""}, ${staff.address.state || ""}` : "—"} />
        </CardContent>
      </Card>

      {/* Employment Info */}
      <Card>
        <CardHeader><CardTitle>Employment Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Department" value={staff.departmentId || "—"} />
          <InfoRow icon={<Building className="h-4 w-4" />} label="Company" value={staff.companyId || "—"} />
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
