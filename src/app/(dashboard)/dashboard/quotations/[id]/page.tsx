"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Invoice, Company, Client, Item } from "@/types";
import { getDocument, getDocuments, updateDocument, createDocument, Timestamp } from "@/lib/firestore";
import { AppSettings, getAppSettings } from "@/lib/settings";
import { generateDocNumber } from "@/lib/numbering";
import { generateDocumentPdfBlob, downloadPdfBlob, printPdfBlob } from "@/lib/document-pdf";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { ItemPicker } from "@/components/ui/item-picker";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate, getStatusColor, numberToWords } from "@/lib/utils";
import { ArrowLeft, Receipt, Download, Loader2, MessageCircle, Pencil, Plus, Printer, Send, Share2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

type QuotationDoc = Invoice & { id: string };

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const quotationId = params.id as string;
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [quotation, setQuotation] = useState<QuotationDoc | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [allCompanies, setAllCompanies] = useState<(Company & { id: string })[]>([]);
  const [allClients, setAllClients] = useState<(Client & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [exportAction, setExportAction] = useState<null | "download" | "print" | "share" | "whatsapp">(null);

  const [editForm, setEditForm] = useState({
    companyId: "",
    clientId: "",
    validUntil: "",
    items: [{ description: "", subDescription: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }],
    taxType: "gst" as "gst" | "non-gst",
    gstRate: 18,
    isInterState: false,
    discount: { type: "fixed" as "fixed" | "percentage", value: 0 },
    notes: "",
    terms: "",
  });

  const docLabel = quotation?.type === "estimate" ? "Estimate" : "Quotation";

  const fetchData = async () => {
    try {
      const doc = await getDocument<Invoice>("invoices", quotationId);
      if (!doc) {
        setLoading(false);
        return;
      }
      // Guard: invoices belong to the invoice route.
      if (doc.type === "invoice") {
        router.replace(`/dashboard/invoices/${quotationId}`);
        return;
      }
      const [comp, cl, sett, comps, cls] = await Promise.all([
        doc.companyId ? getDocument<Company>("companies", doc.companyId) : null,
        doc.clientId ? getDocument<Client>("clients", doc.clientId) : null,
        getAppSettings(),
        getDocuments<Company>("companies"),
        getDocuments<Client>("clients"),
      ]);
      setQuotation(doc as QuotationDoc);
      setCompany(comp);
      setClient(cl);
      setSettings(sett);
      setAllCompanies(comps);
      setAllClients(cls);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load quotation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  const handleStatusUpdate = async (status: Invoice["status"]) => {
    if (!quotation) return;
    try {
      await updateDocument("invoices", quotationId, { status });
      toast("success", `${docLabel} marked as ${status}`);
      void fetchData();
    } catch {
      toast("error", "Failed to update status");
    }
  };

  const openEdit = () => {
    if (!quotation) return;
    setEditForm({
      companyId: quotation.companyId,
      clientId: quotation.clientId,
      validUntil: quotation.dueDate?.seconds
        ? new Date(quotation.dueDate.seconds * 1000).toISOString().split("T")[0]
        : "",
      items: (quotation.items || []).map((it) => ({
        description: it.description,
        subDescription: it.subDescription || "",
        quantity: it.quantity,
        rate: it.rate,
        amount: it.amount,
        sacCode: it.sacCode || "",
      })),
      taxType: quotation.taxType ?? "gst",
      gstRate: quotation.gstDetails?.gstRate ?? 18,
      isInterState: quotation.gstDetails?.isInterState ?? false,
      discount: quotation.discount ?? { type: "fixed", value: 0 },
      notes: quotation.notes || "",
      terms: quotation.terms || "",
    });
    setEditOpen(true);
  };

  const updateEditItem = (idx: number, field: string, value: string | number) => {
    const items = [...editForm.items];
    (items[idx] as Record<string, unknown>)[field] = value;
    if (field === "quantity" || field === "rate") {
      items[idx].amount = items[idx].quantity * items[idx].rate;
    }
    setEditForm({ ...editForm, items });
  };

  const addEditItem = () => {
    setEditForm({ ...editForm, items: [...editForm.items, { description: "", subDescription: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }] });
  };

  const removeEditItem = (idx: number) => {
    if (editForm.items.length <= 1) return;
    setEditForm({ ...editForm, items: editForm.items.filter((_, i) => i !== idx) });
  };

  const addEditFromMaster = (item: Item & { id: string }) => {
    const line = {
      description: item.name,
      subDescription: item.description || "",
      quantity: 1,
      rate: item.rate,
      amount: item.rate,
      sacCode: item.sacCode || item.hsnCode || "",
    };
    setEditForm((f) => {
      const items = [...f.items];
      const lastIdx = items.length - 1;
      const last = items[lastIdx];
      if (last && !last.description && !last.rate) items[lastIdx] = line;
      else items.push(line);
      return { ...f, items };
    });
  };

  const handleEditSave = async () => {
    if (!quotation) return;
    setEditSaving(true);
    try {
      const subtotal = editForm.items.reduce((s, it) => s + it.amount, 0);
      const discountAmount = editForm.discount.type === "percentage"
        ? (subtotal * editForm.discount.value) / 100
        : editForm.discount.value;
      const taxable = subtotal - discountAmount;
      let cgst = 0, sgst = 0, igst = 0;
      if (editForm.taxType === "gst") {
        if (editForm.isInterState) igst = (taxable * editForm.gstRate) / 100;
        else { cgst = (taxable * editForm.gstRate) / 200; sgst = (taxable * editForm.gstRate) / 200; }
      }
      const totalAmount = taxable + cgst + sgst + igst;

      await updateDocument("invoices", quotationId, {
        companyId: editForm.companyId,
        clientId: editForm.clientId,
        clientName: allClients.find((c) => c.id === editForm.clientId)?.companyName || "",
        dueDate: editForm.validUntil ? Timestamp.fromDate(new Date(editForm.validUntil)) : null,
        items: editForm.items,
        subtotal,
        discount: editForm.discount,
        taxType: editForm.taxType,
        gstDetails: editForm.taxType === "gst" ? {
          gstRate: editForm.gstRate, cgst, sgst, igst, isInterState: editForm.isInterState,
        } : null,
        totalAmount,
        balanceAmount: totalAmount,
        notes: editForm.notes,
        terms: editForm.terms,
      });

      setEditOpen(false);
      toast("success", `${docLabel} updated successfully`);
      void fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update quotation");
    } finally {
      setEditSaving(false);
    }
  };

  const executeConvert = async () => {
    setConfirmConvert(false);
    if (!quotation) return;
    if (quotation.convertedToInvoiceId) {
      toast("error", "This quotation has already been converted to an invoice");
      return;
    }
    try {
      const invNumber = await generateDocNumber({ series: "invoice", company: company ?? undefined, settings: settings ?? undefined });
      const rest: Record<string, unknown> = { ...quotation };
      for (const key of ["id", "status", "invoiceNumber", "createdAt", "updatedAt", "convertedFrom", "convertedToInvoiceId", "paidAmount", "balanceAmount"]) {
        delete rest[key];
      }
      const invoiceId = await createDocument("invoices", {
        ...rest,
        type: "invoice",
        invoiceNumber: invNumber,
        status: "sent",
        paidAmount: 0,
        balanceAmount: quotation.totalAmount,
        convertedFrom: quotation.id,
        createdBy: user?.staffId || quotation.createdBy || "",
        date: Timestamp.now(),
        createdAt: Timestamp.now(),
      });
      await updateDocument("invoices", quotationId, { status: "converted", convertedToInvoiceId: invoiceId });
      toast("success", "Quotation converted to invoice");
      router.push(`/dashboard/invoices/${invoiceId}`);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to convert quotation");
    }
  };

  const pdfFileName = () => `${quotation?.invoiceNumber || docLabel}.pdf`;

  const buildShareText = () => {
    if (!quotation) return window.location.href;
    return `${docLabel} ${quotation.invoiceNumber}\nClient: ${client?.companyName || "Client"}\nAmount: ${formatCurrency(quotation.totalAmount)}\n${window.location.href}`;
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;
    setExportAction("download");
    try {
      const blob = await generateDocumentPdfBlob(previewRef.current, docLabel);
      downloadPdfBlob(blob, pdfFileName());
      toast("success", `${docLabel} PDF downloaded`);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to download PDF");
    } finally {
      setExportAction(null);
    }
  };

  const handlePrintPdf = async () => {
    if (!previewRef.current) return;
    setExportAction("print");
    try {
      const blob = await generateDocumentPdfBlob(previewRef.current, docLabel);
      printPdfBlob(blob);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to prepare PDF for printing");
    } finally {
      setExportAction(null);
    }
  };

  const handleNativeShare = async () => {
    if (!previewRef.current) return;
    setExportAction("share");
    try {
      const blob = await generateDocumentPdfBlob(previewRef.current, docLabel);
      const file = new File([blob], pdfFileName(), { type: "application/pdf" });
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: quotation?.invoiceNumber || docLabel, text: buildShareText(), files: [file] });
        setShareOpen(false);
        toast("success", `${docLabel} shared`);
        return;
      }
      downloadPdfBlob(blob, pdfFileName());
      toast("error", "Native file sharing is not available on this device. PDF downloaded instead.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Error:", error);
      toast("error", "Failed to share PDF");
    } finally {
      setExportAction(null);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!previewRef.current) return;
    setExportAction("whatsapp");
    try {
      const blob = await generateDocumentPdfBlob(previewRef.current, docLabel);
      const file = new File([blob], pdfFileName(), { type: "application/pdf" });
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: quotation?.invoiceNumber || docLabel, text: `${buildShareText()}\n\nPDF attached if your device supports file sharing.`, files: [file] });
        setShareOpen(false);
        toast("success", `${docLabel} shared`);
        return;
      }
      downloadPdfBlob(blob, pdfFileName());
      window.open(`https://wa.me/?text=${encodeURIComponent(`${buildShareText()}\n\nPDF downloaded as ${pdfFileName()}. Attach it in WhatsApp.`)}`, "_blank", "noopener,noreferrer");
      setShareOpen(false);
      toast("success", "WhatsApp share opened and the PDF was downloaded");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Error:", error);
      toast("error", "Failed to open WhatsApp sharing");
    } finally {
      setExportAction(null);
    }
  };

  if (loading) return <PageLoader />;
  if (!quotation) return null;

  const alreadyConverted = quotation.status === "converted" || !!quotation.convertedToInvoiceId;
  const editTotals = (() => {
    const subtotal = editForm.items.reduce((s, it) => s + it.amount, 0);
    const discountAmount = editForm.discount.type === "percentage" ? (subtotal * editForm.discount.value) / 100 : editForm.discount.value;
    const taxable = subtotal - discountAmount;
    const tax = editForm.taxType === "gst" ? (taxable * editForm.gstRate) / 100 : 0;
    return { subtotal, discountAmount, total: taxable + tax, tax };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/quotations">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{quotation.invoiceNumber}</h1>
          <p className="flex items-center gap-2 text-sm text-gray-500">
            {docLabel}
            <Badge variant={getStatusColor(quotation.status)}>{quotation.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quotation.status === "draft" && (
            <Button variant="outline" onClick={() => handleStatusUpdate("sent")}>
              <Send className="h-4 w-4 mr-2" /> Mark as Sent
            </Button>
          )}
          {(quotation.status === "draft" || quotation.status === "sent") && (
            <>
              <Button variant="outline" onClick={() => handleStatusUpdate("accepted")}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Accept
              </Button>
              <Button variant="outline" onClick={() => handleStatusUpdate("rejected")}>
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
            </>
          )}
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
          {!alreadyConverted && quotation.status !== "rejected" && quotation.status !== "expired" && (
            <Button variant="outline" onClick={() => setConfirmConvert(true)}>
              <Receipt className="h-4 w-4 mr-2 text-green-600" /> Convert to Invoice
            </Button>
          )}
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
          <Button variant="outline" onClick={handlePrintPdf} disabled={exportAction !== null}>
            {exportAction === "print" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
            Print PDF
          </Button>
        </div>
      </div>

      {/* Preview */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          <div ref={previewRef} className="mx-auto w-full max-w-[794px] rounded-[28px] bg-white p-8 text-slate-900 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-8 flex justify-between gap-6">
              <div>
                {settings?.companyProfile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.companyProfile.logoUrl} alt="Company logo" className="mb-2 h-12 w-auto object-contain" />
                ) : null}
                <h2 className="text-2xl font-bold text-blue-600">{company?.name || settings?.companyName || "D4 Media"}</h2>
                <p className="mt-1 text-sm text-gray-500">{company?.address || settings?.companyProfile.address}</p>
                <p className="text-sm text-gray-500">
                  {(company?.phone || settings?.companyProfile.phone) ?? ""} | {(company?.email || settings?.companyProfile.email) ?? ""}
                </p>
                {settings?.gstNumber && <p className="text-sm text-gray-500">GST: {settings.gstNumber}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold uppercase">{docLabel}</h3>
                <p className="mt-1 text-sm text-gray-600">#{quotation.invoiceNumber}</p>
                <p className="text-sm text-gray-500">Date: {(quotation.date || quotation.createdAt) ? formatDate(new Date(((quotation.date || quotation.createdAt)!).seconds * 1000)) : "—"}</p>
                {quotation.dueDate && <p className="text-sm text-gray-500">Valid Until: {formatDate(new Date(quotation.dueDate.seconds * 1000))}</p>}
              </div>
            </div>

            <div className="mb-8 rounded-lg bg-gray-50 p-4">
              <p className="mb-1 text-xs uppercase text-gray-500">Bill To</p>
              <p className="font-semibold">{client?.companyName}</p>
              <p className="text-sm text-gray-600">{client?.contactPerson}</p>
              {client?.address && <p className="text-sm text-gray-500">{client.address.street}, {client.address.city}, {client.address.state} - {client.address.pincode}</p>}
              {client?.gstNumber && <p className="text-sm text-gray-500">GST: {client.gstNumber}</p>}
            </div>

            <table className="mb-6 w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-3 text-left text-sm font-semibold">#</th>
                  <th className="py-3 text-left text-sm font-semibold">Description</th>
                  <th className="py-3 text-right text-sm font-semibold">Qty</th>
                  <th className="py-3 text-right text-sm font-semibold">Rate</th>
                  <th className="py-3 text-right text-sm font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items?.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 align-top text-sm">{idx + 1}</td>
                    <td className="py-3 align-top text-sm">
                      <div>{item.description}</div>
                      {item.subDescription && <div className="mt-0.5 text-xs leading-relaxed text-gray-400">{item.subDescription}</div>}
                    </td>
                    <td className="py-3 align-top text-sm text-right">{item.quantity}</td>
                    <td className="py-3 align-top text-sm text-right">{formatCurrency(item.rate)}</td>
                    <td className="py-3 align-top text-sm text-right font-medium">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-80 max-w-full space-y-2.5">
                <div className="flex items-baseline justify-between gap-8 text-sm">
                  <span className="whitespace-nowrap">Subtotal</span><span className="whitespace-nowrap">{formatCurrency(quotation.subtotal)}</span>
                </div>
                {quotation.discount?.value > 0 && (
                  <div className="flex items-baseline justify-between gap-8 text-sm text-red-600">
                    <span className="whitespace-nowrap">Discount</span><span className="whitespace-nowrap">-{formatCurrency(quotation.discount.value)}</span>
                  </div>
                )}
                {quotation.gstDetails && !quotation.gstDetails.isInterState && (
                  <>
                    <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">CGST</span><span className="whitespace-nowrap">{formatCurrency(quotation.gstDetails.cgst)}</span></div>
                    <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">SGST</span><span className="whitespace-nowrap">{formatCurrency(quotation.gstDetails.sgst)}</span></div>
                  </>
                )}
                {quotation.gstDetails?.isInterState && (
                  <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">IGST</span><span className="whitespace-nowrap">{formatCurrency(quotation.gstDetails.igst)}</span></div>
                )}
                <div className="flex items-baseline justify-between gap-8 border-t pt-2.5 text-lg font-bold">
                  <span className="whitespace-nowrap">Total</span><span className="whitespace-nowrap">{formatCurrency(quotation.totalAmount)}</span>
                </div>
              </div>
            </div>

            <p className="mt-4 border-t border-gray-100 pt-3 text-sm font-semibold italic leading-relaxed text-slate-700">{numberToWords(quotation.totalAmount)}</p>

            {quotation.notes && <div className="mt-6 text-sm"><p className="mb-1 font-semibold">Notes:</p><div className="rich-text-content leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: quotation.notes.includes("<") ? quotation.notes : quotation.notes.replace(/\n/g, "<br>") }} /></div>}
            {quotation.terms && <div className="mt-4 text-sm"><p className="mb-1 font-semibold">Terms &amp; Conditions:</p><div className="rich-text-content leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: quotation.terms.includes("<") ? quotation.terms : quotation.terms.replace(/\n/g, "<br>") }} /></div>}

            {company?.bankDetails && (
              <div className="mt-6 rounded-lg bg-gray-50 p-4 text-sm">
                <p className="mb-2 font-semibold">Bank Details:</p>
                <p>Bank: {company.bankDetails.bankName}</p>
                <p>Account No: {company.bankDetails.accountNo}</p>
                <p>IFSC: {company.bankDetails.ifscCode}</p>
                <p>Branch: {company.bankDetails.branchName}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)}>
        <DialogHeader>
          <DialogTitle>Share {docLabel}</DialogTitle>
          <DialogDescription>Share the PDF directly or open WhatsApp with the details prefilled.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleNativeShare} disabled={exportAction !== null}>
            {exportAction === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share PDF
          </Button>
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleWhatsAppShare} disabled={exportAction !== null}>
            {exportAction === "whatsapp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Share on WhatsApp
          </Button>
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleDownloadPdf} disabled={exportAction !== null}>
            {exportAction === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} className="max-w-3xl">
        <DialogHeader><DialogTitle>Edit {docLabel}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 dialog-scroll">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Company</Label>
              <SelectRoot value={editForm.companyId} onValueChange={(v) => setEditForm({ ...editForm, companyId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Company">{allCompanies.find((c) => c.id === editForm.companyId)?.name}</SelectValue></SelectTrigger>
                <SelectContent>{allCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </SelectRoot>
            </div>
            <div className="space-y-1">
              <Label>Client</Label>
              <SelectRoot value={editForm.clientId} onValueChange={(v) => setEditForm({ ...editForm, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Select Client">{allClients.find((c) => c.id === editForm.clientId)?.companyName}</SelectValue></SelectTrigger>
                <SelectContent>{allClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
              </SelectRoot>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Valid Until</Label>
              <DatePicker value={editForm.validUntil} onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tax Type</Label>
              <SelectRoot value={editForm.taxType} onValueChange={(v) => setEditForm({ ...editForm, taxType: v as "gst" | "non-gst" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gst">GST</SelectItem>
                  <SelectItem value="non-gst">Non-GST</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            {editForm.taxType === "gst" && (
              <div className="space-y-1">
                <Label>GST Rate %</Label>
                <Input type="number" value={editForm.gstRate} onChange={(e) => setEditForm({ ...editForm, gstRate: Number(e.target.value) })} placeholder="e.g. 18" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addEditItem}><Plus className="mr-1 h-3 w-3" /> Add Item</Button>
                <ItemPicker onSelect={addEditFromMaster} className="inline-block" />
              </div>
            </div>
            <div className="mt-1 space-y-2">
              {editForm.items.map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2">
                  <div className="grid grid-cols-12 items-end gap-2">
                    <Input className="col-span-5" placeholder="Description" value={item.description} onChange={(e) => updateEditItem(idx, "description", e.target.value)} />
                    <Input className="col-span-2" type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateEditItem(idx, "quantity", Number(e.target.value))} />
                    <Input className="col-span-2" type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateEditItem(idx, "rate", Number(e.target.value))} />
                    <div className="col-span-2 pt-2 text-right text-sm font-medium">{formatCurrency(item.amount)}</div>
                    <Button variant="ghost" size="sm" className="col-span-1" onClick={() => removeEditItem(idx)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                  <Input
                    className="h-7 text-xs text-gray-500 border-dashed border-gray-300"
                    placeholder="Item description (optional)"
                    value={item.subDescription || ""}
                    onChange={(e) => updateEditItem(idx, "subDescription", e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-right text-sm space-y-1">
            <p>Subtotal: <span className="font-medium">{formatCurrency(editTotals.subtotal)}</span></p>
            {editTotals.discountAmount > 0 && <p>Discount: <span className="text-red-500">-{formatCurrency(editTotals.discountAmount)}</span></p>}
            {editTotals.tax > 0 && <p>Tax ({editForm.gstRate}%): <span>{formatCurrency(editTotals.tax)}</span></p>}
            <p className="text-lg font-bold">Total: {formatCurrency(editTotals.total)}</p>
          </div>

          <div><Label>Notes</Label><RichTextEditor value={editForm.notes} onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))} placeholder="Add notes..." /></div>
          <div><Label>Terms</Label><RichTextEditor value={editForm.terms} onChange={(v) => setEditForm((f) => ({ ...f, terms: v }))} placeholder="Add terms & conditions..." /></div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmConvert}
        title="Convert to Invoice"
        message="Are you sure you want to convert this quotation to an invoice? This action cannot be undone."
        confirmLabel="Convert"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={executeConvert}
        onCancel={() => setConfirmConvert(false)}
      />
    </div>
  );
}
