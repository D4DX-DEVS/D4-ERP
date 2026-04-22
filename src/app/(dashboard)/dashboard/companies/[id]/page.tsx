"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Company, Department, Staff } from "@/types";
import { getDocument, getDocuments, where } from "@/lib/firestore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { ArrowLeft, BriefcaseBusiness, Building2, Landmark, Users } from "lucide-react";
import { getStatusColor } from "@/lib/utils";

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = params.id as string;

  const [company, setCompany] = useState<(Company & { id: string }) | null>(null);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);
  const [staff, setStaff] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [companyData, departmentData, staffData] = await Promise.all([
          getDocument<Company>("companies", companyId),
          getDocuments<Department>("departments", [where("companyId", "==", companyId)]),
          getDocuments<Staff>("staff", [where("companyId", "==", companyId)]),
        ]);

        setCompany(companyData);
        setDepartments(departmentData);
        setStaff(staffData);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [companyId]);

  if (loading) return <PageLoader />;
  if (!company) return null;

  return (
    <div className="space-y-6">
      <ListingHeader
        title={company.name}
        description="Company profile, contact details, bank information, and connected team structure."
        action={
          <Link href="/dashboard/companies">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to companies
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<Building2 className="h-5 w-5" />} label="Status" value={company.isActive ? "Active" : "Inactive"} toneClassName="bg-emerald-50 text-emerald-700" meta={company.invoicePrefix ? `Prefix: ${company.invoicePrefix}` : undefined} />
        <ListingStatCard icon={<BriefcaseBusiness className="h-5 w-5" />} label="Departments" value={departments.length} toneClassName="bg-sky-50 text-sky-700" meta="Mapped to this company" />
        <ListingStatCard icon={<Users className="h-5 w-5" />} label="Staff" value={staff.length} toneClassName="bg-indigo-50 text-indigo-700" meta="Associated employees" />
        <ListingStatCard icon={<Landmark className="h-5 w-5" />} label="Bank" value={company.bankDetails.bankName || "—"} toneClassName="bg-amber-50 text-amber-700" meta={company.bankDetails.branchName || "No branch set"} />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Company Information" description="Primary identity, taxation, and business contact information.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Email" value={company.email} />
            <DetailField label="Phone" value={company.phone} />
            <DetailField label="GST Number" value={company.gstNumber || "—"} />
            <DetailField label="PAN Number" value={company.panNumber} />
            <DetailField label="Website" value={company.website || "—"} />
            <DetailField label="Status" value={<Badge variant={getStatusColor(company.isActive ? "active" : "terminated")}>{company.isActive ? "Active" : "Inactive"}</Badge>} />
            <div className="md:col-span-2">
              <DetailField label="Address" value={company.address} />
            </div>
          </div>
        </ListingPanel>

        <ListingPanel title="Bank Details" description="Payment and account information used for billing and operations.">
          <div className="space-y-4">
            <DetailField label="Bank Name" value={company.bankDetails.bankName || "—"} />
            <DetailField label="Account Number" value={company.bankDetails.accountNo || "—"} />
            <DetailField label="IFSC Code" value={company.bankDetails.ifscCode || "—"} />
            <DetailField label="Branch" value={company.bankDetails.branchName || "—"} />
          </div>
        </ListingPanel>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-2 text-sm text-slate-700">{value}</div>
    </div>
  );
}