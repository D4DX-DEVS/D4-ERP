"use client";

import { useEffect, useMemo, useState } from "react";
import { Invoice, Client, Company } from "@/types";
import { getDocuments, createDocument, where, Timestamp, search as searchConstraint } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { cn, formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { FileText, Plus, Trash2, Loader2, Eye, Search } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export default function InvoicesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const constraints = useMemo(() => {
    const nextConstraints: Array<ReturnType<typeof where> | ReturnType<typeof searchConstraint>> = [where("type", "==", "invoice")];
    if (filterStatus) {
      nextConstraints.push(where("status", "==", filterStatus));
    }
    if (search.trim()) {
      nextConstraints.push(searchConstraint(["invoiceNumber", "clientName"], search.trim()));
    }
    return nextConstraints;
  }, [filterStatus, search]);
  const {
    data: invoices,
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
    type: "invoice" as Invoice["type"],
    companyId: "",
    clientId: "",
    dueDate: "",
    items: [{ description: "", quantity: 1, rate: 0, amount: 0, sacCode: "", subDescription: "" }],
    taxType: "gst" as Invoice["taxType"],
    gstRate: 18,
    isInterState: false,
    discount: { type: "fixed" as "fixed" | "percentage", value: 0 },
    notes: "",
    terms: "Payment due within 30 days.",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLookups() {
      try {
        const [cls, comps] = await Promise.all([
          getDocuments<Client>("clients", [where("isActive", "==", true)]),
          getDocuments<Company>("companies", [where("isActive", "==", true)]),
        ]);

        if (!isMounted) return;

        setClients(cls);
        setCompanies(comps);
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

  const updateItem = (idx: number, field: string, value: string | number) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === "quantity" || field === "rate") {
      items[idx].amount = items[idx].quantity * items[idx].rate;
    }
    setForm({ ...form, items });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { description: "", quantity: 1, rate: 0, amount: 0, sacCode: "", subDescription: "" }] });
  };

  const removeItem = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const calculateTotals = () => {
    const subtotal = form.items.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = form.discount.type === "percentage" ? (subtotal * form.discount.value) / 100 : form.discount.value;
    const taxable = subtotal - discountAmount;
    let cgst = 0, sgst = 0, igst = 0;
    if (form.taxType === "gst") {
      if (form.isInterState) {
        igst = (taxable * form.gstRate) / 100;
      } else {
        cgst = (taxable * form.gstRate) / 200;
        sgst = (taxable * form.gstRate) / 200;
      }
    }
    const totalAmount = taxable + cgst + sgst + igst;
    return { subtotal, discountAmount, cgst, sgst, igst, totalAmount };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const totals = calculateTotals();
      const comp = companies.find((c) => c.id === form.companyId);
      const client = clients.find((c) => c.id === form.clientId);
      const count = invoices.filter((i) => i.companyId === form.companyId && i.type === form.type).length;
      const prefix = comp?.invoicePrefix || "INV";
      const invoiceNumber = `${prefix}-${String(count + 1).padStart(4, "0")}`;

      await createDocument("invoices", {
        invoiceNumber,
        type: form.type,
        companyId: form.companyId,
        clientId: form.clientId,
        clientName: client?.companyName || "",
        date: Timestamp.now(),
        dueDate: form.dueDate ? Timestamp.fromDate(new Date(form.dueDate)) : Timestamp.now(),
        items: form.items,
        subtotal: totals.subtotal,
        discount: form.discount,
        taxType: form.taxType,
        gstDetails: form.taxType === "gst" ? {
          gstRate: form.gstRate,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          isInterState: form.isInterState,
        } : null,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        balanceAmount: totals.totalAmount,
        status: "draft",
        notes: form.notes,
        terms: form.terms,
        createdBy: user?.staffId || "",
      });
      setDialogOpen(false);
      toast("success", "Invoice created successfully");
      refresh();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const getClientName = (id: string) => clients.find((c) => c.id === id)?.companyName || "—";
  const getCompanyName = (id: string) => companies.find((c) => c.id === id)?.name || "—";

  const handleBulletKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    onChange: (v: string) => void
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const insert = "\n• ";
    const newVal = value.slice(0, start) + insert + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const totals = calculateTotals();

  if (loading || lookupsLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage invoices</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create Invoice
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <SelectRoot value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status">
              {filterStatus ? (
                <span className="flex items-center gap-2">
                  <span className={cn("inline-block h-2 w-2 rounded-full", {
                    "bg-slate-400": filterStatus === "draft",
                    "bg-blue-500": filterStatus === "sent",
                    "bg-emerald-500": filterStatus === "paid",
                    "bg-amber-500": filterStatus === "partial",
                    "bg-red-500": filterStatus === "overdue",
                  })} />
                  {filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
                </span>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="draft">
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                Draft
              </span>
            </SelectItem>
            <SelectItem value="sent">
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                Sent
              </span>
            </SelectItem>
            <SelectItem value="paid">
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Paid
              </span>
            </SelectItem>
            <SelectItem value="partial">
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Partial
              </span>
            </SelectItem>
            <SelectItem value="overdue">
              <span className="flex items-center gap-2.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Overdue
              </span>
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>

      {totalCount === 0 ? (
        <Card><CardContent>
          <EmptyState icon={<FileText className="h-12 w-12" />} title="No invoices found" />
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/clients/${inv.clientId}`} className="text-blue-600 hover:underline">
                      {inv.clientName || getClientName(inv.clientId)}
                    </Link>
                  </TableCell>
                  <TableCell>{getCompanyName(inv.companyId)}</TableCell>
                  <TableCell>{inv.date ? formatDate(new Date(inv.date.seconds * 1000)) : "—"}</TableCell>
                  <TableCell><Badge>{inv.taxType === "gst" ? "GST" : "No Tax"}</Badge></TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(inv.totalAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inv.paidAmount)}</TableCell>
                  <TableCell><Badge variant={getStatusColor(inv.status)}>{inv.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/dashboard/invoices/${inv.id}`}>
                      <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} totalPages={totalPages} totalCount={totalCount} hasNext={hasNext} hasPrev={hasPrev} onNext={nextPage} onPrev={prevPage} pageSize={10} />
        </CardContent></Card>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-3xl">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 dialog-scroll">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Company *</Label>
              <Select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                options={companies.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select" required />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                options={clients.map((c) => ({ value: c.id, label: c.companyName }))} placeholder="Select" required
                footerAction={{ label: "New Client", href: "/dashboard/clients?new=1" }} />
            </div>
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <DatePicker value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
            </div>
          </div>

          {/* Items */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-sm">Line Items</h4>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="space-y-1.5 border border-gray-100 rounded-lg p-2">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Label className="text-xs">Description</Label>
                    <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} required />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} min={1} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Rate</Label>
                    <Input type="number" value={item.rate} onChange={(e) => updateItem(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Amount</Label>
                    <Input value={formatCurrency(item.amount)} disabled className="bg-gray-50" />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
                <Input
                  className="h-7 text-xs text-gray-500 border-dashed border-gray-300"
                  placeholder="Item description (optional)"
                  value={item.subDescription || ""}
                  onChange={(e) => updateItem(idx, "subDescription", e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Tax Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tax Type</Label>
              <Select value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value as Invoice["taxType"] })}
                options={[{ value: "gst", label: "GST" }, { value: "non-gst", label: "No Tax" }]} />
            </div>
            {form.taxType === "gst" && (
              <>
                <div className="space-y-2">
                  <Label>GST Rate (%)</Label>
                  <Select value={String(form.gstRate)} onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })}
                    options={[{ value: "5", label: "5%" }, { value: "12", label: "12%" }, { value: "18", label: "18%" }, { value: "28", label: "28%" }]} />
                </div>
                <div className="space-y-2">
                  <Label>Supply Type</Label>
                  <Select value={form.isInterState ? "inter" : "intra"} onChange={(e) => setForm({ ...form, isInterState: e.target.value === "inter" })}
                    options={[{ value: "intra", label: "Intra-State (CGST+SGST)" }, { value: "inter", label: "Inter-State (IGST)" }]} />
                </div>
              </>
            )}
          </div>

          {/* Totals */}
          <div className="border rounded-lg p-4 bg-gray-50 space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">{formatCurrency(totals.subtotal)}</span></div>
            {form.discount.value > 0 && (
              <div className="flex justify-between text-red-600"><span>Discount</span><span>-{formatCurrency(totals.discountAmount)}</span></div>
            )}
            {form.taxType === "gst" && !form.isInterState && (
              <>
                <div className="flex justify-between"><span>CGST ({form.gstRate / 2}%)</span><span>{formatCurrency(totals.cgst)}</span></div>
                <div className="flex justify-between"><span>SGST ({form.gstRate / 2}%)</span><span>{formatCurrency(totals.sgst)}</span></div>
              </>
            )}
            {form.taxType === "gst" && form.isInterState && (
              <div className="flex justify-between"><span>IGST ({form.gstRate}%)</span><span>{formatCurrency(totals.igst)}</span></div>
            )}
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span><span>{formatCurrency(totals.totalAmount)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <RichTextEditor
              value={form.notes}
              onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="Add notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Invoice
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
