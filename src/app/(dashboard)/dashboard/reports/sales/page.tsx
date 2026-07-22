"use client";
import { useWorkspaceBase } from "@/hooks/use-workspace-base";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Invoice, Client, Company, InvoicePayment, Receipt } from "@/types";
import { getDocuments } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/asset-export-utils";
import { ArrowLeft, FileSpreadsheet, FileText, Download, ClipboardList, ReceiptText, AlertCircle, Wallet, X } from "lucide-react";

type ReportType = "quotations" | "invoices" | "pending" | "collection" | "receipts";
type ReportRow = Record<string, string | number>;

const TABS: { key: ReportType; label: string; icon: typeof FileText }[] = [
  { key: "quotations", label: "Quotation List", icon: ClipboardList },
  { key: "invoices", label: "Invoice Report", icon: FileText },
  { key: "pending", label: "Pending Payment", icon: AlertCircle },
  { key: "collection", label: "Payment Collection", icon: Wallet },
  { key: "receipts", label: "Receipt Register", icon: ReceiptText },
];

const toDate = (ts?: { seconds: number } | null): Date | null =>
  ts && typeof ts.seconds === "number" ? new Date(ts.seconds * 1000) : null;

export default function SalesReportsPage() {
  const base = useWorkspaceBase();
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>("quotations");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [invoices, setInvoices] = useState<(Invoice & { id: string })[]>([]);
  const [payments, setPayments] = useState<(InvoicePayment & { id: string })[]>([]);
  const [receipts, setReceipts] = useState<(Receipt & { id: string })[]>([]);
  const [clients, setClients] = useState<(Client & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);

  const [fromDate, setFromDate] = useState("");
  const [toDateStr, setToDateStr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  // Captured once on mount so the render stays pure (no Date.now() in render).
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const load = async () => {
      try {
        const [inv, pays, recs, cls, comps] = await Promise.all([
          getDocuments<Invoice>("invoices"),
          getDocuments<InvoicePayment>("invoicePayments"),
          getDocuments<Receipt>("receipts"),
          getDocuments<Client>("clients"),
          getDocuments<Company>("companies"),
        ]);
        setInvoices(inv);
        setPayments(pays);
        setReceipts(recs);
        setClients(cls);
        setCompanies(comps);
      } catch (error) {
        console.error("Error:", error);
        toast("error", "Failed to load report data");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [toast]);

  const clientName = useCallback(
    (id?: string, fallback?: string) => clients.find((c) => c.id === id)?.companyName || fallback || "—",
    [clients]
  );
  const companyName = useCallback(
    (id?: string) => companies.find((c) => c.id === id)?.name || "—",
    [companies]
  );

  const inRange = useCallback(
    (d: Date | null): boolean => {
      if (!d) return !fromDate && !toDateStr;
      if (fromDate && d < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDateStr && d > new Date(`${toDateStr}T23:59:59`)) return false;
      return true;
    },
    [fromDate, toDateStr]
  );

  const matchesSearch = useCallback(
    (...values: (string | undefined)[]) => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) return true;
      return values.some((v) => (v || "").toLowerCase().includes(q));
    },
    [searchTerm]
  );

  const statusOptions = useMemo(() => {
    if (reportType === "quotations") {
      return ["draft", "sent", "accepted", "rejected", "expired", "converted"];
    }
    if (reportType === "invoices") {
      return ["draft", "sent", "paid", "partial", "overdue", "cancelled"];
    }
    return [];
  }, [reportType]);

  const rows: ReportRow[] = useMemo(() => {
    switch (reportType) {
      case "quotations": {
        return invoices
          .filter((i) => i.type === "quotation" || i.type === "estimate")
          .filter((i) => (statusFilter ? i.status === statusFilter : true))
          .filter((i) => (companyFilter ? i.companyId === companyFilter : true))
          .filter((i) => inRange(toDate(i.date || i.createdAt)))
          .filter((i) => matchesSearch(i.invoiceNumber, clientName(i.clientId, i.clientName)))
          .sort((a, b) => (toDate(b.date || b.createdAt)?.getTime() || 0) - (toDate(a.date || a.createdAt)?.getTime() || 0))
          .map((i) => ({
            "Number": i.invoiceNumber || "—",
            "Type": i.type === "estimate" ? "Estimate" : "Quotation",
            "Date": (toDate(i.date || i.createdAt) && formatDate(toDate(i.date || i.createdAt)!)) || "—",
            "Client": clientName(i.clientId, i.clientName),
            "Company": companyName(i.companyId),
            "Valid Until": (toDate(i.dueDate) && formatDate(toDate(i.dueDate)!)) || "—",
            "Status": i.status,
            "Amount": formatCurrency(i.totalAmount || 0),
          }));
      }
      case "invoices": {
        return invoices
          .filter((i) => i.type === "invoice")
          .filter((i) => (statusFilter ? i.status === statusFilter : true))
          .filter((i) => (companyFilter ? i.companyId === companyFilter : true))
          .filter((i) => inRange(toDate(i.date || i.createdAt)))
          .filter((i) => matchesSearch(i.invoiceNumber, clientName(i.clientId, i.clientName)))
          .sort((a, b) => (toDate(b.date || b.createdAt)?.getTime() || 0) - (toDate(a.date || a.createdAt)?.getTime() || 0))
          .map((i) => ({
            "Number": i.invoiceNumber || "—",
            "Date": (toDate(i.date || i.createdAt) && formatDate(toDate(i.date || i.createdAt)!)) || "—",
            "Client": clientName(i.clientId, i.clientName),
            "Company": companyName(i.companyId),
            "Status": i.status,
            "Total": formatCurrency(i.totalAmount || 0),
            "Paid": formatCurrency(i.paidAmount || 0),
            "Balance": formatCurrency(i.balanceAmount ?? (i.totalAmount || 0) - (i.paidAmount || 0)),
          }));
      }
      case "pending": {
        return invoices
          .filter((i) => i.type === "invoice")
          .filter((i) => (i.balanceAmount ?? (i.totalAmount || 0) - (i.paidAmount || 0)) > 0)
          .filter((i) => i.status !== "cancelled")
          .filter((i) => (companyFilter ? i.companyId === companyFilter : true))
          .filter((i) => inRange(toDate(i.date || i.createdAt)))
          .filter((i) => matchesSearch(i.invoiceNumber, clientName(i.clientId, i.clientName)))
          .sort((a, b) => (toDate(a.dueDate)?.getTime() || 0) - (toDate(b.dueDate)?.getTime() || 0))
          .map((i) => {
            const balance = i.balanceAmount ?? (i.totalAmount || 0) - (i.paidAmount || 0);
            const due = toDate(i.dueDate);
            const overdue = !!due && due.getTime() < now;
            return {
              "Number": i.invoiceNumber || "—",
              "Client": clientName(i.clientId, i.clientName),
              "Company": companyName(i.companyId),
              "Invoice Date": (toDate(i.date || i.createdAt) && formatDate(toDate(i.date || i.createdAt)!)) || "—",
              "Due Date": due ? formatDate(due) : "—",
              "Total": formatCurrency(i.totalAmount || 0),
              "Paid": formatCurrency(i.paidAmount || 0),
              "Balance": formatCurrency(balance),
              "Status": overdue ? "Overdue" : "Pending",
            };
          });
      }
      case "collection": {
        const invMap = new Map(invoices.map((i) => [i.id, i]));
        return payments
          .filter((p) => (statusFilter ? p.paymentMode === statusFilter : true))
          .filter((p) => inRange(toDate(p.date)))
          .map((p) => {
            const inv = invMap.get(p.invoiceId);
            return { p, inv };
          })
          .filter(({ inv }) => (companyFilter ? inv?.companyId === companyFilter : true))
          .filter(({ p, inv }) => matchesSearch(p.receiptNumber, inv?.invoiceNumber, clientName(inv?.clientId, inv?.clientName)))
          .sort((a, b) => (toDate(b.p.date)?.getTime() || 0) - (toDate(a.p.date)?.getTime() || 0))
          .map(({ p, inv }) => ({
            "Date": (toDate(p.date) && formatDate(toDate(p.date)!)) || "—",
            "Receipt No": p.receiptNumber || "—",
            "Invoice": inv?.invoiceNumber || "—",
            "Client": clientName(inv?.clientId, inv?.clientName),
            "Mode": p.paymentMode,
            "Reference": p.referenceNo || "—",
            "Amount": formatCurrency(p.amount || 0),
          }));
      }
      case "receipts": {
        return receipts
          .filter((r) => (statusFilter ? r.paymentMode === statusFilter : true))
          .filter((r) => (companyFilter ? r.companyId === companyFilter : true))
          .filter((r) => inRange(toDate(r.date)))
          .filter((r) => matchesSearch(r.receiptNumber, r.invoiceNumber, clientName(r.clientId, r.clientName)))
          .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0))
          .map((r) => ({
            "Receipt No": r.receiptNumber || "—",
            "Date": (toDate(r.date) && formatDate(toDate(r.date)!)) || "—",
            "Client": clientName(r.clientId, r.clientName),
            "Invoice": r.invoiceNumber || "—",
            "Mode": r.paymentMode,
            "Reference": r.referenceNo || "—",
            "Amount": formatCurrency(r.amount || 0),
          }));
      }
      default:
        return [];
    }
  }, [reportType, invoices, payments, receipts, statusFilter, companyFilter, inRange, matchesSearch, clientName, companyName, now]);

  const headers = rows.length ? Object.keys(rows[0]) : [];

  const totalAmount = useMemo(() => {
    const key =
      reportType === "pending" ? "Balance"
        : reportType === "invoices" ? "Total"
          : reportType === "quotations" ? "Amount"
            : "Amount";
    if (!rows.length || !(key in rows[0])) return null;
    return rows.reduce((sum, r) => {
      const n = Number(String(r[key]).replace(/[^0-9.-]/g, ""));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rows, reportType]);

  const clearFilters = () => {
    setFromDate(""); setToDateStr(""); setStatusFilter(""); setCompanyFilter(""); setSearchTerm("");
  };
  const hasFilters = fromDate || toDateStr || statusFilter || companyFilter || searchTerm;

  const activeLabel = TABS.find((t) => t.key === reportType)?.label || "Report";
  const fileName = `${activeLabel.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

  const handleExport = async (kind: "csv" | "excel" | "pdf") => {
    if (!rows.length) {
      toast("error", "Nothing to export");
      return;
    }
    setExporting(true);
    try {
      if (kind === "csv") exportToCSV(rows, fileName);
      else if (kind === "excel") await exportToExcel(rows, fileName);
      else await exportToPDF(rows, activeLabel, fileName);
      toast("success", `${activeLabel} exported`);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`${base}/reports`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Sales &amp; Payment Reports</h1>
          <p className="text-sm text-gray-500">Quotations, invoices, pending payments, collections and receipts.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = reportType === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setReportType(t.key); setStatusFilter(""); }}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label>From</Label>
              <DatePicker value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <DatePicker value={toDateStr} onChange={(e) => setToDateStr(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Company</Label>
              <Select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                options={[{ value: "", label: "All Companies" }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
            <div className="space-y-1">
              <Label>{reportType === "collection" || reportType === "receipts" ? "Mode" : "Status"}</Label>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "All" },
                  ...(reportType === "collection" || reportType === "receipts"
                    ? [
                        { value: "cash", label: "Cash" },
                        { value: "bank", label: "Bank" },
                        { value: "upi", label: "UPI" },
                        { value: "cheque", label: "Cheque" },
                      ]
                    : statusOptions.map((s) => ({ value: s, label: s }))),
                ]}
              />
            </div>
            <div className="space-y-1">
              <Label>Search</Label>
              <Input placeholder="Number / client" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" /> Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {rows.length} record{rows.length === 1 ? "" : "s"}
          {totalAmount !== null && <> &middot; Total: <span className="font-semibold text-slate-700">{formatCurrency(totalAmount)}</span></>}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting || !rows.length}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("excel")} disabled={exporting || !rows.length}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={exporting || !rows.length}>
            <FileText className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10">
              <EmptyState title="No records found" description="Try adjusting the filters or date range." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h} className={h.match(/amount|total|paid|balance/i) ? "text-right" : ""}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={idx}>
                      {headers.map((h) => (
                        <TableCell key={h} className={h.match(/amount|total|paid|balance/i) ? "text-right font-medium" : ""}>{r[h]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
