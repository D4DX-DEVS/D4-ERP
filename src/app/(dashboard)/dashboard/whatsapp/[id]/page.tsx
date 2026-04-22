"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getDocument } from "@/lib/firestore";
import { Client } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { ArrowLeft, CheckCheck, MessageSquare, Phone, Send } from "lucide-react";

interface WhatsAppMessage {
  id: string;
  clientId: string;
  phone: string;
  message: string;
  type: "outgoing" | "incoming";
  status: "sent" | "delivered" | "read" | "failed";
  template?: string;
  createdAt?: { seconds: number };
}

export default function WhatsAppMessageDetailPage() {
  const params = useParams();
  const messageId = params.id as string;

  const [message, setMessage] = useState<WhatsAppMessage | null>(null);
  const [client, setClient] = useState<(Client & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadMessage() {
      try {
        const messageData = await getDocument<WhatsAppMessage>("whatsapp_messages", messageId);
        if (!isMounted) return;

        setMessage(messageData);

        if (messageData?.clientId) {
          const clientData = await getDocument<Client>("clients", messageData.clientId);
          if (!isMounted) return;
          setClient(clientData);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadMessage();

    return () => {
      isMounted = false;
    };
  }, [messageId]);

  if (loading) return <PageLoader />;
  if (!message) return null;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="WhatsApp Message"
        description="Full conversation record with recipient context and delivery metadata."
        action={
          <Link href="/dashboard/whatsapp">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to WhatsApp
            </Button>
          </Link>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<MessageSquare className="h-5 w-5" />} label="Direction" value={message.type} toneClassName="bg-slate-100 text-slate-700" meta="Message flow" />
        <ListingStatCard icon={<CheckCheck className="h-5 w-5" />} label="Status" value={message.status} toneClassName="bg-emerald-50 text-emerald-700" meta="Delivery state" />
        <ListingStatCard icon={<Phone className="h-5 w-5" />} label="Phone" value={message.phone} toneClassName="bg-sky-50 text-sky-700" meta="Recipient number" />
        <ListingStatCard icon={<Send className="h-5 w-5" />} label="Template" value={message.template || "Custom"} toneClassName="bg-amber-50 text-amber-700" meta="Message source" />
      </ListingStatGrid>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <ListingPanel title="Recipient Context" description="Linked client and send metadata.">
          <div className="space-y-4">
            <DetailField label="Client" value={client?.companyName || "Unknown client"} />
            <DetailField label="Contact Person" value={client?.contactPerson || "—"} />
            <DetailField label="Phone" value={message.phone} />
            <DetailField label="Sent At" value={message.createdAt?.seconds ? new Date(message.createdAt.seconds * 1000).toLocaleString("en-IN") : "—"} />
            <DetailField label="Status" value={<Badge variant="bg-slate-100 text-slate-700">{message.status}</Badge>} />
          </div>
        </ListingPanel>

        <ListingPanel title="Message Body" description="Full message content as sent or received.">
          <div className="rounded-[24px] border border-white/70 bg-slate-950 p-6 text-sm leading-7 text-slate-100 shadow-[0_24px_56px_rgba(15,23,42,0.16)]">
            {message.message}
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