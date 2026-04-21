"use client";

import { useEffect, useState } from "react";
import { Invoice, Client, Company } from "@/types";
import { getDocuments, createDocument, updateDocument, deleteDocument, orderBy, where, Timestamp } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileText, Plus, Trash2, Search, Eye, Copy } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<(Invoice & { id: string })[]>([]);
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const [form, setForm] = useState({
    companyId: "",
    clientId: "",
    validUntil: "",
    items: [{ description: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }],
    taxType: "gst" as "gst" | "non-gst",
    gstRate: 18,
    isInterState: false,
    discount: { type: "fixed" as "fixed" | "percentage", value: 0 },
    notes: "",
    terms: "This quotation is valid for 30 days from the date of issue.",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [q, c, co] = await Promise.all([
        getDocuments<Invoice>("invoices", [where("type", "==", "quotation")]),
        getDocuments<Client>("clients"),
        getDocuments<Company>("companies"),
      ]);
      setQuotations(q);
      setClients(c);
      setCompanies(co);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

  const updateItem = (idx: number, field: string, value: string | number) => {
    const newItems = [...form.items];
    (newItems[idx] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "rate") {
      newItems[idx].amount = newItems[idx].quantity * newItems[idx].rate;
    }
    setForm({ ...form, items: newItems });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }] });
  };

  const removeItem = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const subtotal = form.items.reduce((sum, it) => sum + it.amount, 0);
  const discountAmount = form.discount.type === "percentage" ? (subtotal * form.discount.value) / 100 : form.discount.value;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = form.taxType === "gst" ? (afterDiscount * form.gstRate) / 100 : 0;
  const total = afterDiscount + taxAmount;

  const handleSave = async () => {
    if (!form.companyId || !form.clientId || !form.items[0]?.description) return;
    setSaving(true);
    try {
      const prefix = "QTN";
      const number = `${prefix}-${Date.now().toString(36).toUpperCase()}`;

      await createDocument("invoices", {
        type: "quotation",
        invoiceNumber: number,
        companyId: form.companyId,
        clientId: form.clientId,
        items: form.items,
        subtotal,
        discount: form.discount,
        discountAmount,
        taxType: form.taxType,
        gstRate: form.taxType === "gst" ? form.gstRate : 0,
        isInterState: form.isInterState,
        cgst: !form.isInterState ? taxAmount / 2 : 0,
        sgst: !form.isInterState ? taxAmount / 2 : 0,
        igst: form.isInterState ? taxAmount : 0,
        taxAmount,
        totalAmount: total,
        status: "draft",
        dueDate: form.validUntil ? Timestamp.fromDate(new Date(form.validUntil)) : null,
        notes: form.notes,
        terms: form.terms,
        createdAt: Timestamp.now(),
      });
      setShowAdd(false);
      toast("success", "Quotation created successfully");
      setForm({
        companyId: "", clientId: "", validUntil: "",
        items: [{ description: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }],
        taxType: "gst", gstRate: 18, isInterState: false,
        discount: { type: "fixed", value: 0 }, notes: "",
        terms: "This quotation is valid for 30 days from the date of issue.",
      });
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async (quotation: Invoice & { id: string }) => {
    if (!confirm("Convert this quotation to an invoice?")) return;
    const invNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    await createDocument("invoices", {
      ...quotation,
      type: "invoice",
      invoiceNumber: invNumber,
      status: "sent",
      createdAt: Timestamp.now(),
    });
    await updateDocument("invoices", quotation.id, { status: "accepted" });
    toast("success", "Quotation converted to invoice");
    fetchData();
  };

  const filtered = quotations.filter((q) => {
    if (search) {
      const client = clientMap[q.clientId];
      const matchSearch = q.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
        client?.companyName?.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusColor = (s: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      sent: "bg-blue-100 text-blue-700",
      accepted: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
      expired: "bg-orange-100 text-orange-700",
    };
    return colors[s] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quotations</h1>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Quotation</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Quotation</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Company</Label>
                  <SelectRoot value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </SelectRoot>
                </div>
                <div>
                  <Label>Client</Label>
                  <SelectRoot value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                    </SelectContent>
                  </SelectRoot>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Valid Until</Label>
                  <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </div>
                <div>
                  <Label>Tax Type</Label>
                  <SelectRoot value={form.taxType} onValueChange={(v) => setForm({ ...form, taxType: v as "gst" | "non-gst" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gst">GST</SelectItem>
                      <SelectItem value="non-gst">Non-GST</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </div>
                {form.taxType === "gst" && (
                  <div>
                    <Label>GST Rate %</Label>
                    <Input type="number" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })} />
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <Label>Items</Label>
                <div className="space-y-2 mt-1">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <Input className="col-span-5" placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                      <Input className="col-span-2" type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                      <Input className="col-span-2" type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateItem(idx, "rate", Number(e.target.value))} />
                      <div className="col-span-2 text-sm font-medium text-right pt-2">{formatCurrency(item.amount)}</div>
                      <Button variant="ghost" size="sm" className="col-span-1" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                </div>
              </div>

              {/* Totals */}
              <div className="text-right space-y-1 text-sm">
                <p>Subtotal: <span className="font-medium">{formatCurrency(subtotal)}</span></p>
                {discountAmount > 0 && <p>Discount: <span className="text-red-500">-{formatCurrency(discountAmount)}</span></p>}
                {taxAmount > 0 && <p>Tax ({form.gstRate}%): <span>{formatCurrency(taxAmount)}</span></p>}
                <p className="text-lg font-bold">Total: {formatCurrency(total)}</p>
              </div>

              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div><Label>Terms</Label><Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Create Quotation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search quotations..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">Number</th>
                    <th className="p-3 font-medium">Client</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((q) => (
                    <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{q.invoiceNumber}</td>
                      <td className="p-3">{clientMap[q.clientId]?.companyName || q.clientId}</td>
                      <td className="p-3 font-medium">{formatCurrency(q.totalAmount)}</td>
                      <td className="p-3"><Badge variant={statusColor(q.status)}>{q.status}</Badge></td>
                      <td className="p-3 text-xs text-gray-500">{q.createdAt?.seconds ? formatDate(new Date(q.createdAt.seconds * 1000)) : "—"}</td>
                      <td className="p-3 flex gap-1">
                        <Link href={`/dashboard/invoices/${q.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                        {q.status === "draft" && (
                          <Button variant="ghost" size="sm" title="Convert to Invoice" onClick={() => handleConvertToInvoice(q)}>
                            <Copy className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-500">No quotations found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} totalCount={filtered.length} hasNext={page < totalPages - 1} hasPrev={page > 0} onNext={() => setPage(page + 1)} onPrev={() => setPage(page - 1)} pageSize={PAGE_SIZE} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
