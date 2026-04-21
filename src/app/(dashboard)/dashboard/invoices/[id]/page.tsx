"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Invoice, Company, Client, InvoicePayment } from "@/types";
import { getDocument, getDocuments, updateDocument, createDocument, where, Timestamp } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { formatCurrency, formatDate, getStatusColor, numberToWords } from "@/lib/utils";
import { ArrowLeft, Printer, DollarSign, Loader2, Send, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

export default function InvoiceDetailPage() {
  const params = useParams();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<(Invoice & { id: string }) | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<(InvoicePayment & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    paymentMode: "bank" as InvoicePayment["paymentMode"],
    referenceNo: "",
    notes: "",
  });

  const fetchData = async () => {
    try {
      const inv = await getDocument<Invoice>("invoices", invoiceId);
      if (!inv) return;
      setInvoice(inv);

      const [comp, cl, pays] = await Promise.all([
        inv.companyId ? getDocument<Company>("companies", inv.companyId) : null,
        inv.clientId ? getDocument<Client>("clients", inv.clientId) : null,
        getDocuments<InvoicePayment>("invoicePayments", [where("invoiceId", "==", invoiceId)]),
      ]);
      setCompany(comp);
      setClient(cl);
      setPayments(pays);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [invoiceId]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    setSaving(true);
    try {
      await createDocument("invoicePayments", {
        invoiceId,
        amount: payForm.amount,
        date: Timestamp.fromDate(new Date(payForm.date)),
        paymentMode: payForm.paymentMode,
        referenceNo: payForm.referenceNo,
        notes: payForm.notes,
        createdBy: user?.staffId || "",
      });

      const newPaid = invoice.paidAmount + payForm.amount;
      const newBalance = invoice.totalAmount - newPaid;
      const newStatus = newBalance <= 0 ? "paid" : "partial";

      await updateDocument("invoices", invoiceId, {
        paidAmount: newPaid,
        balanceAmount: Math.max(0, newBalance),
        status: newStatus,
      });

      setPaymentOpen(false);
      toast("success", "Payment recorded successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (status: Invoice["status"]) => {
    if (!invoice) return;
    try {
      await updateDocument("invoices", invoiceId, { status });
      toast("success", `Invoice marked as ${status}`);
      fetchData();
    } catch (error) {
      toast("error", "Failed to update invoice status");
    }
  };

  if (loading) return <PageLoader />;
  if (!invoice) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-gray-500">{invoice.type === "quotation" ? "Quotation" : "Invoice"}</p>
        </div>
        <div className="flex gap-2">
          {invoice.status === "draft" && (
            <Button variant="outline" onClick={() => handleStatusUpdate("sent")}>
              <Send className="h-4 w-4 mr-2" /> Mark as Sent
            </Button>
          )}
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            <DollarSign className="h-4 w-4 mr-2" /> Record Payment
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Invoice Preview */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-blue-600">{company?.name || "D4 Media"}</h2>
              <p className="text-sm text-gray-500 mt-1">{company?.address}</p>
              <p className="text-sm text-gray-500">{company?.phone} | {company?.email}</p>
              {company?.gstNumber && <p className="text-sm text-gray-500">GST: {company.gstNumber}</p>}
            </div>
            <div className="text-right">
              <h3 className="text-xl font-bold">{invoice.type === "quotation" ? "QUOTATION" : "INVOICE"}</h3>
              <p className="text-sm text-gray-600 mt-1">#{invoice.invoiceNumber}</p>
              <p className="text-sm text-gray-500">Date: {invoice.date ? formatDate(new Date(invoice.date.seconds * 1000)) : "—"}</p>
              {invoice.dueDate && <p className="text-sm text-gray-500">Due: {formatDate(new Date(invoice.dueDate.seconds * 1000))}</p>}
              <Badge variant={getStatusColor(invoice.status)} className="mt-2">{invoice.status}</Badge>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 uppercase mb-1">Bill To</p>
            <p className="font-semibold">{client?.companyName}</p>
            <p className="text-sm text-gray-600">{client?.contactPerson}</p>
            {client?.address && <p className="text-sm text-gray-500">{client.address.street}, {client.address.city}, {client.address.state} - {client.address.pincode}</p>}
            {client?.gstNumber && <p className="text-sm text-gray-500">GST: {client.gstNumber}</p>}
          </div>

          {/* Items Table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 text-sm font-semibold">#</th>
                <th className="text-left py-3 text-sm font-semibold">Description</th>
                <th className="text-right py-3 text-sm font-semibold">Qty</th>
                <th className="text-right py-3 text-sm font-semibold">Rate</th>
                <th className="text-right py-3 text-sm font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-3 text-sm">{idx + 1}</td>
                  <td className="py-3 text-sm">{item.description}</td>
                  <td className="py-3 text-sm text-right">{item.quantity}</td>
                  <td className="py-3 text-sm text-right">{formatCurrency(item.rate)}</td>
                  <td className="py-3 text-sm text-right font-medium">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount?.value > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Discount</span><span>-{formatCurrency(invoice.discount.value)}</span>
                </div>
              )}
              {invoice.gstDetails && !invoice.gstDetails.isInterState && (
                <>
                  <div className="flex justify-between text-sm"><span>CGST</span><span>{formatCurrency(invoice.gstDetails.cgst)}</span></div>
                  <div className="flex justify-between text-sm"><span>SGST</span><span>{formatCurrency(invoice.gstDetails.sgst)}</span></div>
                </>
              )}
              {invoice.gstDetails?.isInterState && (
                <div className="flex justify-between text-sm"><span>IGST</span><span>{formatCurrency(invoice.gstDetails.igst)}</span></div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span><span>{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Paid</span><span>{formatCurrency(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Balance Due</span><span>{formatCurrency(invoice.balanceAmount)}</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500 italic">{numberToWords(invoice.totalAmount)}</p>

          {invoice.notes && <div className="mt-6 text-sm"><p className="font-semibold mb-1">Notes:</p><p className="text-gray-600">{invoice.notes}</p></div>}
          {invoice.terms && <div className="mt-4 text-sm"><p className="font-semibold mb-1">Terms & Conditions:</p><p className="text-gray-600">{invoice.terms}</p></div>}

          {/* Bank Details */}
          {company?.bankDetails && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm">
              <p className="font-semibold mb-2">Bank Details:</p>
              <p>Bank: {company.bankDetails.bankName}</p>
              <p>Account No: {company.bankDetails.accountNo}</p>
              <p>IFSC: {company.bankDetails.ifscCode}</p>
              <p>Branch: {company.bankDetails.branchName}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      {payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-gray-500 capitalize">{p.paymentMode} {p.referenceNo && `· ${p.referenceNo}`}</p>
                  </div>
                  <p className="text-sm text-gray-500">{p.date ? formatDate(new Date(p.date.seconds * 1000)) : "—"}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)}>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm">
            Balance Due: <span className="font-bold">{formatCurrency(invoice.balanceAmount)}</span>
          </div>
          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input type="number" max={invoice.balanceAmount} value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={payForm.paymentMode} onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value as InvoicePayment["paymentMode"] })}
                options={[{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "cheque", label: "Cheque" }]} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reference No</Label>
            <Input value={payForm.referenceNo} onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
