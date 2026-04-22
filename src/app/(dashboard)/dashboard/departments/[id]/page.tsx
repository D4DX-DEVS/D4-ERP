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
import { ArrowLeft, Building2, Layers, UserRound, Users } from "lucide-react";
import { getStatusColor } from "@/lib/utils";

export default function DepartmentDetailPage() {
  const params = useParams();
  const departmentId = params.id as string;

  const [department, setDepartment] = useState<(Department & { id: string }) | null>(null);
  const [company, setCompany] = useState<(Company & { id: string }) | null>(null);
  const [head, setHead] = useState<(Staff & { id: string }) | null>(null);
  const [teamMembers, setTeamMembers] = useState<(Staff & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const departmentData = await getDocument<Department>("departments", departmentId);
        setDepartment(departmentData);

        if (!departmentData) return;

        const [companyData, teamData, headData] = await Promise.all([
          getDocument<Company>("companies", departmentData.companyId),
          getDocuments<Staff>("staff", [where("departmentId", "==", departmentId)]),
          departmentData.headId ? getDocument<Staff>("staff", departmentData.headId) : Promise.resolve(null),
        ]);

        setCompany(companyData);
        setTeamMembers(teamData);
        setHead(headData);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [departmentId]);

  if (loading) return <PageLoader />;
  if (!department) return null;

  return (
    <div className="space-y-6">
      <ListingHeader
        title={department.name}
        description="Department profile with reporting context, assigned head, and active team size."
        action={
          <Link href="/dashboard/departments">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to departments
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<Layers className="h-5 w-5" />} label="Status" value={department.isActive ? "Active" : "Inactive"} toneClassName="bg-emerald-50 text-emerald-700" meta="Department availability" />
        <ListingStatCard icon={<Building2 className="h-5 w-5" />} label="Company" value={company?.name || "—"} toneClassName="bg-sky-50 text-sky-700" meta="Owning business unit" />
        <ListingStatCard icon={<UserRound className="h-5 w-5" />} label="Department Head" value={head ? `${head.firstName} ${head.lastName}` : "—"} toneClassName="bg-indigo-50 text-indigo-700" meta={head?.designation || "Not assigned"} />
        <ListingStatCard icon={<Users className="h-5 w-5" />} label="Team Members" value={teamMembers.length} toneClassName="bg-amber-50 text-amber-700" meta="Staff linked to this department" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Department Summary" description="Main profile, ownership, and status.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Department Name" value={department.name} />
            <DetailField label="Status" value={<Badge variant={getStatusColor(department.isActive ? "active" : "terminated")}>{department.isActive ? "Active" : "Inactive"}</Badge>} />
            <DetailField label="Company" value={company?.name || "—"} />
            <DetailField label="Head" value={head ? `${head.firstName} ${head.lastName}` : "—"} />
            <div className="md:col-span-2">
              <DetailField label="Description" value={department.description || "—"} />
            </div>
          </div>
        </ListingPanel>

        <ListingPanel title="Team Snapshot" description="Quick look at staff currently assigned to this department.">
          <div className="space-y-3">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-slate-500">No staff members assigned yet.</p>
            ) : (
              teamMembers.slice(0, 8).map((member) => (
                <div key={member.id} className="rounded-[20px] border border-white/70 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">{member.firstName} {member.lastName}</p>
                  <p className="mt-1 text-xs text-slate-500">{member.designation || member.role}</p>
                </div>
              ))
            )}
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