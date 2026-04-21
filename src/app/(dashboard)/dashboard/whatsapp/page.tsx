"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, Timestamp } from "@/lib/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Client } from "@/types";
import { MessageSquare, Send, Phone, Search, Plus, CheckCheck, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";

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

  useEffect(() => { fetchData(); }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">WhatsApp Messages</h1>
        <Dialog open={showSend} onOpenChange={setShowSend}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" /> Send Message
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Send WhatsApp Message</DialogTitle></DialogHeader>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{messages.length}</p>
            <p className="text-xs text-gray-500">Total Messages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{messages.filter((m) => m.status === "sent" || m.status === "delivered").length}</p>
            <p className="text-xs text-gray-500">Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{messages.filter((m) => m.status === "read").length}</p>
            <p className="text-xs text-gray-500">Read</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{messages.filter((m) => m.status === "failed").length}</p>
            <p className="text-xs text-gray-500">Failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search messages..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Templates Reference */}
      <Card>
        <CardHeader><CardTitle>Message Templates</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <div key={t.id} className="p-3 border rounded-lg">
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Message History */}
      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle>Message History</CardTitle></CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No messages yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.slice(0, 50).map((m) => (
                  <div key={m.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className={`p-2 rounded-full ${m.type === "outgoing" ? "bg-green-100" : "bg-blue-100"}`}>
                      {m.type === "outgoing" ? <Send className="h-4 w-4 text-green-600" /> : <Phone className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{clientMap[m.clientId]?.companyName || "Unknown"}</span>
                        <span className="text-xs text-gray-400">{m.phone}</span>
                        {statusIcon(m.status)}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{m.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleString("en-IN") : "—"}
                      </p>
                    </div>
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
