"use client";

import { useEffect, useMemo, useState } from "react";
import { Invoice, Client, Company } from "@/types";
import { getDocuments, createDocument, updateDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { Plus, Trash2, Search, Eye, Copy, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";

export default function QuotationsPage() {
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const { toast } = useToast();
  const constraints = useMemo(() => {
    const nextConstraints: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [where("type", "==", "quotation")];
    if (filterStatus) {
      nextConstraints.push(where("status", "==", filterStatus));
    }
    if (search.trim()) {
      nextConstraints.push(searchConstraint(["invoiceNumber"], search.trim()));
    }
    return nextConstraints;
  }, [filterStatus, search]);
  const {
    data: quotations,
    loading,
    totalCount,
    page,
    totalPages,
    hasNext,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
  } = usePagination<Invoice>("invoices", {
    pageSize: 10,
    orderByField: "createdAt",
    orderDirection: "desc",
    constraints,
  });

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

  useEffect(() => {
    let isMounted = true;

    async function loadLookups() {
      try {
        const [c, co] = await Promise.all([
          getDocuments<Client>("clients"),
          getDocuments<Company>("companies"),
        ]);
        if (!isMounted) return;
        setClients(c);
        setCompanies(co);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        if (isMounted) {
          setLookupsLoading(false);
        }
      }
    }

    void loadLookups();

    return () => {
      isMounted = false;
    };
  }, []);

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const companyMap = Object.fromEntries(companies.map((company) => [company.id, company]));

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
      const number = `${prefix}-${Timestamp.now().seconds.toString(36).toUpperCase()}`;

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
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async (quotation: Invoice & { id: string }) => {
    if (!confirm("Convert this quotation to an invoice?")) return;
    const invNumber = `INV-${Timestamp.now().seconds.toString(36).toUpperCase()}`;
    await createDocument("invoices", {
      ...quotation,
      type: "invoice",
      invoiceNumber: invNumber,
      status: "sent",
      createdAt: Timestamp.now(),
    });
    await updateDocument("invoices", quotation.id, { status: "accepted" });
    toast("success", "Quotation converted to invoice");
    refresh();
  };

  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="mt-1 text-sm text-gray-500">Create, search, and convert quotations to invoices</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Quotation</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Quotation</DialogTitle>
            </DialogHeader>
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
                <div className="mt-1 space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3">
                      <Input className="col-span-5" placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                      <Input className="col-span-2" type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                      <Input className="col-span-2" type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateItem(idx, "rate", Number(e.target.value))} />
                      <div className="col-span-2 pt-2 text-right text-sm font-medium">{formatCurrency(item.amount)}</div>
                      <Button variant="ghost" size="sm" className="col-span-1" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addItem}><Plus className="mr-1 h-3 w-3" /> Add Item</Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-right text-sm space-y-1">
                <p>Subtotal: <span className="font-medium">{formatCurrency(subtotal)}</span></p>
                {discountAmount > 0 && <p>Discount: <span className="text-red-500">-{formatCurrency(discountAmount)}</span></p>}
                {taxAmount > 0 && <p>Tax ({form.gstRate}%): <span>{formatCurrency(taxAmount)}</span></p>}
                <p className="text-lg font-bold">Total: {formatCurrency(total)}</p>
              </div>

              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div><Label>Terms</Label><Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : "Create Quotation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search quotations..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          options={[
            { value: "", label: "All Status" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "expired", label: "Expired" },
          ]}
          className="w-[180px]"
        />
      </div>

      {totalCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No quotations found"
              description="Create your first quotation or adjust your filters to see results."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono font-medium">{q.invoiceNumber}</TableCell>
                    <TableCell>{clientMap[q.clientId]?.companyName || q.clientId}</TableCell>
                    <TableCell>{companyMap[q.companyId]?.name || "—"}</TableCell>
                    <TableCell>{q.dueDate?.seconds ? formatDate(new Date(q.dueDate.seconds * 1000)) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(q.totalAmount)}</TableCell>
                    <TableCell><Badge variant={getStatusColor(q.status)}>{q.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/invoices/${q.id}`}>
                        <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                      </Link>
                      {q.status === "draft" && (
                        <Button variant="ghost" size="icon" title="Convert to Invoice" onClick={() => handleConvertToInvoice(q)}>
                          <Copy className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
