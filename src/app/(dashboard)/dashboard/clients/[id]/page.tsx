"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Client, Invoice } from "@/types";
import { getDocument, getDocuments, where } from "@/lib/firestore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { ArrowLeft, FileText, Phone, UserRound, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<(Client & { id: string }) | null>(null);
  const [invoices, setInvoices] = useState<(Invoice & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [clientData, invoiceData] = await Promise.all([
          getDocument<Client>("clients", clientId),
          getDocuments<Invoice>("invoices", [where("clientId", "==", clientId)]),
        ]);

        setClient(clientData);
        setInvoices(invoiceData);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [clientId]);

  if (loading) return <PageLoader />;
  if (!client) return null;

  const totalBilling = invoices.reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      <ListingHeader
        title={client.companyName}
        description="Client profile, contact information, and commercial snapshot."
        action={
          <Link href="/dashboard/clients">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to clients
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<UserRound className="h-5 w-5" />} label="Contact Person" value={client.contactPerson} toneClassName="bg-sky-50 text-sky-700" meta={client.category} />
        <ListingStatCard icon={<Phone className="h-5 w-5" />} label="Primary Phone" value={client.phone} toneClassName="bg-emerald-50 text-emerald-700" meta={client.email} />
        <ListingStatCard icon={<FileText className="h-5 w-5" />} label="Invoices" value={invoices.length} toneClassName="bg-indigo-50 text-indigo-700" meta="Linked billing records" />
        <ListingStatCard icon={<Wallet className="h-5 w-5" />} label="Billing Volume" value={formatCurrency(totalBilling)} toneClassName="bg-amber-50 text-amber-700" meta="Across all linked invoices" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ListingPanel title="Client Information" description="Core profile, communication, and compliance details.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Company" value={client.companyName} />
            <DetailField label="Contact Person" value={client.contactPerson} />
            <DetailField label="Email" value={client.email} />
            <DetailField label="Phone" value={client.phone} />
            <DetailField label="GST Number" value={client.gstNumber || "—"} />
            <DetailField label="Category" value={<Badge>{client.category}</Badge>} />
            <div className="md:col-span-2">
              <DetailField label="Address" value={`${client.address.street}, ${client.address.city}, ${client.address.state} ${client.address.pincode}`.replace(/^,\s*/, "")} />
            </div>
            <div className="md:col-span-2">
              <DetailField label="Notes" value={client.notes || "—"} />
            </div>
          </div>
        </ListingPanel>

        <ListingPanel title="Billing Snapshot" description="Recent commercial context for this client.">
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices linked yet.</p>
            ) : (
              invoices.slice(0, 6).map((invoice) => (
                <div key={invoice.id} className="rounded-[20px] border border-white/70 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-slate-950">{invoice.invoiceNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">{invoice.type} · {invoice.status}</p>
                  <p className="mt-2 text-sm text-slate-700">{formatCurrency(invoice.totalAmount)}</p>
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