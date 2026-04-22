"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocuments, createDocument, Timestamp } from "@/lib/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Client } from "@/types";
import { MessageSquare, Send, Search, CheckCheck, Clock, Eye } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { ListingHeader, ListingPanel, ListingStatCard, ListingStatGrid } from "@/components/ui/listing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface WhatsAppMessage {
  id: string;
  clientId: string;
  phone: string;
  message: string;
  type: "outgoing" | "incoming";
  status: "sent" | "delivered" | "read" | "failed";
  template?: string;
  createdAt: { seconds: number };
}

const TEMPLATES = [
  { id: "payment_reminder", name: "Payment Reminder", body: "Dear {client}, this is a reminder for your pending payment of {amount}. Please process at your earliest convenience. Thank you - D4 Media" },
  { id: "invoice_sent", name: "Invoice Sent", body: "Dear {client}, your invoice #{invoice_no} has been generated. Total amount: {amount}. Please check your email for details. - D4 Media" },
  { id: "project_update", name: "Project Update", body: "Dear {client}, here's an update on your project: {message}. Feel free to reach out for any queries. - D4 Media" },
  { id: "meeting_schedule", name: "Meeting Schedule", body: "Dear {client}, your meeting has been scheduled for {date} at {time}. Location: {location}. - D4 Media" },
  { id: "delivery_complete", name: "Delivery Complete", body: "Dear {client}, we're happy to inform you that your project has been delivered successfully. Please review and share your feedback. - D4 Media" },
];

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [form, setForm] = useState({
    clientId: "",
    phone: "",
    template: "",
    message: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [msgs, cls] = await Promise.all([
        getDocuments<WhatsAppMessage>("whatsapp_messages"),
        getDocuments<Client>("clients"),
      ]);
      setMessages(msgs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setClients(cls);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      setLoading(true);
      try {
        const [msgs, cls] = await Promise.all([
          getDocuments<WhatsAppMessage>("whatsapp_messages"),
          getDocuments<Client>("clients"),
        ]);

        if (!isMounted) return;

        setMessages(msgs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setClients(cls);
      } catch (error) {
        console.error("Error:", error);
        if (isMounted) {
          toast("error", "Failed to load messages");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [toast]);

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  const handleClientSelect = (clientId: string) => {
    const client = clientMap[clientId];
    setForm({
      ...form,
      clientId,
      phone: client?.phone || "",
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      const client = clientMap[form.clientId];
      let body = tpl.body;
      if (client) {
        body = body.replace("{client}", client.companyName || "");
      }
      setForm({ ...form, template: templateId, message: body });
    }
  };

  const handleSend = async () => {
    if (!form.phone || !form.message) return;
    setSending(true);
    try {
      // Store the message record (actual WhatsApp API integration would go here)
      await createDocument("whatsapp_messages", {
        clientId: form.clientId,
        phone: form.phone,
        message: form.message,
        type: "outgoing",
        status: "sent",
        template: form.template || null,
        createdAt: Timestamp.now(),
      });
      setForm({ clientId: "", phone: "", template: "", message: "" });
      setShowSend(false);
      toast("success", "Message sent");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const filtered = messages.filter((m) => {
    if (!search) return true;
    const client = clientMap[m.clientId];
    return (
      m.phone?.includes(search) ||
      m.message?.toLowerCase().includes(search.toLowerCase()) ||
      client?.companyName?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const statusIcon = (s: string) => {
    switch (s) {
      case "read": return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case "delivered": return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case "sent": return <Clock className="h-3 w-3 text-gray-400" />;
      default: return <span className="text-red-400 text-xs">!</span>;
    }
  };

  const totalOutbound = messages.filter((message) => message.type === "outgoing").length;
  const totalRead = messages.filter((message) => message.status === "read").length;
  const totalFailed = messages.filter((message) => message.status === "failed").length;

  return (
    <div className="space-y-6">
      <ListingHeader
        title="WhatsApp Messages"
        description="Template-driven outbound messaging and searchable conversation history in one uniform listing flow."
        action={
          <Dialog open={showSend} onOpenChange={setShowSend}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Send className="mr-2 h-4 w-4" />
                Send message
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send WhatsApp Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Client (optional)</Label>
                  <SelectRoot value={form.clientId} onValueChange={handleClientSelect}>
                    <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Template (optional)</Label>
                  <SelectRoot value={form.template} onValueChange={handleTemplateSelect}>
                    <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
                <Button onClick={handleSend} disabled={sending} className="w-full bg-green-600 hover:bg-green-700">
                  {sending ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <ListingStatGrid>
        <ListingStatCard icon={<MessageSquare className="h-5 w-5" />} label="Total Messages" value={messages.length} toneClassName="bg-slate-100 text-slate-700" meta="All recorded conversations" />
        <ListingStatCard icon={<Send className="h-5 w-5" />} label="Outbound" value={totalOutbound} toneClassName="bg-emerald-50 text-emerald-700" meta="Messages initiated by your team" />
        <ListingStatCard icon={<CheckCheck className="h-5 w-5" />} label="Read" value={totalRead} toneClassName="bg-sky-50 text-sky-700" meta="Messages seen by recipients" />
        <ListingStatCard icon={<Clock className="h-5 w-5" />} label="Failed" value={totalFailed} toneClassName="bg-rose-50 text-rose-700" meta="Delivery issues needing follow-up" />
      </ListingStatGrid>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ListingPanel title="Message Templates" description="Quick-start templates for the most common client conversations.">
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATES.map((template) => (
              <Card key={template.id} className="border border-dashed border-slate-200 bg-slate-50/70 shadow-none">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{template.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ListingPanel>

        <ListingPanel title="Message History" description="Searchable timeline with explicit view access and row click-through." contentClassName="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search by client, phone, or message" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <PageLoader />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="No messages found"
              description="Try a different search term or send the first WhatsApp message from this panel."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((message) => {
                  const detailHref = `/dashboard/whatsapp/${message.id}`;

                  return (
                    <TableRow
                      key={message.id}
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
                          <p className="font-medium text-slate-950">{clientMap[message.clientId]?.companyName || "Unknown client"}</p>
                          <p className="mt-1 text-xs text-slate-500">{message.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={message.type === "outgoing" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}>
                          {message.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusIcon(message.status)}
                          <span className="text-sm capitalize text-slate-600">{message.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <p className="line-clamp-2 text-sm text-slate-600">{message.message}</p>
                      </TableCell>
                      <TableCell>
                        {message.createdAt?.seconds ? new Date(message.createdAt.seconds * 1000).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => router.push(detailHref)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ListingPanel>
      </div>
    </div>
  );
}
