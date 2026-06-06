"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Invoice, Company, Client, InvoicePayment } from "@/types";
import { getDocument, getDocuments, updateDocument, createDocument, where, Timestamp } from "@/lib/firestore";
import { AppSettings, getAppSettings } from "@/lib/settings";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading";
import { formatCurrency, formatDate, numberToWords } from "@/lib/utils";
import { ArrowLeft, DollarSign, Download, Loader2, MessageCircle, Pencil, Plus, Printer, Receipt, Send, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { generateDocNumber } from "@/lib/numbering";
import { generateDocumentPdfBlob, downloadPdfBlob as savePdfBlob, printPdfBlob as printPdfDoc } from "@/lib/document-pdf";

export default function InvoiceDetailPage() {
  const params = useParams();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const invoiceId = params.id as string;
  const invoicePreviewRef = useRef<HTMLDivElement | null>(null);

  const [invoice, setInvoice] = useState<(Invoice & { id: string }) | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<(InvoicePayment & { id: string })[]>([]);
  const [appGstNumber, setAppGstNumber] = useState<string>("");
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [allCompanies, setAllCompanies] = useState<(Company & { id: string })[]>([]);
  const [allClients, setAllClients] = useState<(Client & { id: string })[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    companyId: "",
    clientId: "",
    dueDate: "",
    items: [{ description: "", subDescription: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }],
    taxType: "non-gst" as "gst" | "non-gst",
    gstRate: 18,
    isInterState: false,
    discount: { type: "fixed" as "fixed" | "percentage", value: 0 },
    notes: "",
    terms: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportAction, setExportAction] = useState<null | "download" | "print" | "share" | "whatsapp">(null);
  const [payForm, setPayForm] = useState({
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    paymentMode: "bank" as InvoicePayment["paymentMode"],
    referenceNo: "",
    notes: "",
  });
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [receiptData, setReceiptData] = useState<(InvoicePayment & { id: string }) | null>(null);
  const [receiptExport, setReceiptExport] = useState<null | "download" | "print">(null);

  const fetchData = async () => {
    try {
      const inv = await getDocument<Invoice>("invoices", invoiceId);
      if (!inv) return;
      setInvoice(inv);

      const [comp, cl, pays, settings] = await Promise.all([
        inv.companyId ? getDocument<Company>("companies", inv.companyId) : null,
        inv.clientId ? getDocument<Client>("clients", inv.clientId) : null,
        getDocuments<InvoicePayment>("invoicePayments", [where("invoiceId", "==", invoiceId)]),
        getAppSettings(),
      ]);
      setCompany(comp);
      setClient(cl);
      setPayments(pays);
      setAppSettings(settings);
      setAppGstNumber(settings.gstNumber || "");
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to load invoice details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadInvoice = async () => {
      try {
        const inv = await getDocument<Invoice>("invoices", invoiceId);
        if (!inv || !isMounted) return;

        const [comp, cl, pays, settings, allComps, allCls] = await Promise.all([
          inv.companyId ? getDocument<Company>("companies", inv.companyId) : null,
          inv.clientId ? getDocument<Client>("clients", inv.clientId) : null,
          getDocuments<InvoicePayment>("invoicePayments", [where("invoiceId", "==", invoiceId)]),
          getAppSettings(),
          getDocuments<Company>("companies"),
          getDocuments<Client>("clients"),
        ]);

        if (!isMounted) return;

        setInvoice(inv);
        setCompany(comp);
        setClient(cl);
        setPayments(pays);
        setAppSettings(settings);
        setAppGstNumber(settings.gstNumber || "");
        setAllCompanies(allComps);
        setAllClients(allCls);
      } catch (error) {
        console.error("Error:", error);
        if (isMounted) {
          toast("error", "Failed to load invoice details");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadInvoice();

    return () => {
      isMounted = false;
    };
  }, [invoiceId, toast]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    setSaving(true);
    try {
      const receiptNumber = await generateDocNumber({
        series: "receipt",
        company: company ?? undefined,
        settings: appSettings ?? undefined,
      });

      const paymentId = await createDocument("invoicePayments", {
        invoiceId,
        amount: payForm.amount,
        date: Timestamp.fromDate(new Date(payForm.date)),
        paymentMode: payForm.paymentMode,
        referenceNo: payForm.referenceNo,
        notes: payForm.notes,
        receiptNumber,
        createdBy: user?.staffId || "",
      });

      await createDocument("receipts", {
        receiptNumber,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        paymentId,
        companyId: invoice.companyId,
        clientId: invoice.clientId,
        clientName: client?.companyName || "",
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
      toast("success", `Payment recorded \u00b7 Receipt ${receiptNumber}`);
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const handleReceiptPdf = async (action: "download" | "print") => {
    if (!receiptRef.current) return;
    setReceiptExport(action);
    try {
      const blob = await generateDocumentPdfBlob(receiptRef.current, "Receipt");
      if (action === "download") {
        savePdfBlob(blob, `${receiptData?.receiptNumber || "receipt"}.pdf`);
        toast("success", "Receipt downloaded");
      } else {
        printPdfDoc(blob);
      }
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to generate receipt PDF");
    } finally {
      setReceiptExport(null);
    }
  };

  const handleStatusUpdate = async (status: Invoice["status"]) => {
    if (!invoice) return;
    try {
      await updateDocument("invoices", invoiceId, { status });
      toast("success", `Invoice marked as ${status}`);
      fetchData();
    } catch {
      toast("error", "Failed to update invoice status");
    }
  };

  const openEdit = () => {
    if (!invoice) return;
    setEditForm({
      companyId: invoice.companyId,
      clientId: invoice.clientId,
      dueDate: invoice.dueDate?.seconds
        ? new Date(invoice.dueDate.seconds * 1000).toISOString().split("T")[0]
        : "",
      items: (invoice.items || []).map((it) => ({
        description: it.description,
        subDescription: it.subDescription || "",
        quantity: it.quantity,
        rate: it.rate,
        amount: it.amount,
        sacCode: it.sacCode || "",
      })),
      taxType: invoice.taxType ?? "non-gst",
      gstRate: invoice.gstDetails?.gstRate ?? 18,
      isInterState: invoice.gstDetails?.isInterState ?? false,
      discount: invoice.discount ?? { type: "fixed", value: 0 },
      notes: invoice.notes || "",
      terms: invoice.terms || "",
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

  const handleEditSave = async () => {
    if (!invoice) return;
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
      const paidAmount = invoice.paidAmount ?? 0;

      await updateDocument("invoices", invoiceId, {
        companyId: editForm.companyId,
        clientId: editForm.clientId,
        dueDate: editForm.dueDate ? Timestamp.fromDate(new Date(editForm.dueDate)) : null,
        items: editForm.items,
        subtotal,
        discount: editForm.discount,
        taxType: editForm.taxType,
        gstDetails: editForm.taxType === "gst" ? {
          gstRate: editForm.gstRate,
          cgst,
          sgst,
          igst,
          isInterState: editForm.isInterState,
        } : null,
        totalAmount,
        balanceAmount: Math.max(0, totalAmount - paidAmount),
        notes: editForm.notes,
        terms: editForm.terms,
      });

      setEditOpen(false);
      toast("success", "Invoice updated successfully");
      fetchData();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to update invoice");
    } finally {
      setEditSaving(false);
    }
  };

  const cloneInvoiceForPdf = (source: HTMLElement, targetDocument: Document) => {
    const clone = source.cloneNode(true) as HTMLElement;
    const sourceElements = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
    const cloneElements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];

    sourceElements.forEach((sourceElement, index) => {
      const cloneElement = cloneElements[index];
      if (!cloneElement) return;

      cloneElement.className = "";

      const computedStyle = window.getComputedStyle(sourceElement);
      for (const property of Array.from(computedStyle)) {
        const value = computedStyle.getPropertyValue(property);
        if (!value || property.startsWith("--")) continue;
        if (value.includes("lab(") || value.includes("oklab(") || value.includes("color-mix(")) continue;
        cloneElement.style.setProperty(property, value, computedStyle.getPropertyPriority(property));
      }

      cloneElement.style.setProperty("color-scheme", "light");
      cloneElement.style.setProperty("animation", "none");
      cloneElement.style.setProperty("transition", "none");
      cloneElement.style.setProperty("backdrop-filter", "none");
      cloneElement.style.setProperty("filter", "none");
    });

    clone.style.margin = "0";
    clone.style.width = `${Math.ceil(source.getBoundingClientRect().width)}px`;
    clone.style.maxWidth = "none";
    clone.style.background = "#ffffff";
    targetDocument.body.appendChild(clone);

    return clone;
  };

  const createPdfSandbox = () => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const sandboxDocument = iframe.contentDocument;
    if (!sandboxDocument) {
      iframe.remove();
      throw new Error("Failed to prepare invoice PDF sandbox");
    }

    sandboxDocument.open();
    sandboxDocument.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Invoice PDF</title><style>html,body{margin:0;padding:0;background:#fff}*,*::before,*::after{box-sizing:border-box}table{border-collapse:collapse}td,th{vertical-align:top}</style></head><body></body></html>`);
    sandboxDocument.close();

    return {
      iframe,
      sandboxDocument,
      cleanup: () => iframe.remove(),
    };
  };

  const getInvoicePdfBlob = async () => {
    if (!invoicePreviewRef.current || !invoice) {
      throw new Error("Invoice preview is not ready");
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const { sandboxDocument, cleanup } = createPdfSandbox();

    try {
      const sandboxInvoice = cloneInvoiceForPdf(invoicePreviewRef.current, sandboxDocument);
      const canvas = await html2canvas(sandboxInvoice, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        windowWidth: sandboxInvoice.scrollWidth,
        windowHeight: sandboxInvoice.scrollHeight,
      });

      const pdf = new jsPDF({
        format: "a4",
        orientation: "portrait",
        unit: "pt",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      // Number of source-canvas pixels that fit inside one printable page.
      // Each page gets its own sliced image so content never overlaps or
      // repeats across the page break and the page margins stay blank.
      const pageCanvasHeight = Math.max(1, Math.floor((canvas.width / usableWidth) * usableHeight));

      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) {
          throw new Error("Failed to prepare invoice PDF page");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(
          canvas,
          0,
          renderedHeight,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        const sliceData = pageCanvas.toDataURL("image/png");
        const sliceImageHeight = (sliceHeight * usableWidth) / canvas.width;

        if (pageIndex > 0) {
          pdf.addPage();
        }
        pdf.addImage(sliceData, "PNG", margin, margin, usableWidth, sliceImageHeight, undefined, "FAST");

        renderedHeight += sliceHeight;
        pageIndex += 1;
      }

      return pdf.output("blob");
    } finally {
      cleanup();
    }
  };

  const getPdfFileName = () => `${invoice?.invoiceNumber || "invoice"}.pdf`;

  const downloadPdfBlob = (blob: Blob) => {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = getPdfFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const buildShareText = () => {
    if (!invoice) {
      return window.location.href;
    }

    const docType = invoice.type === "quotation" ? "Quotation" : "Invoice";
    const clientName = client?.companyName || "Client";
    const shareUrl = window.location.href;

    return `${docType} ${invoice.invoiceNumber}\nClient: ${clientName}\nAmount: ${formatCurrency(invoice.totalAmount)}\n${shareUrl}`;
  };

  const handleDownloadPdf = async () => {
    setExportAction("download");
    try {
      const blob = await getInvoicePdfBlob();
      downloadPdfBlob(blob);
      toast("success", "Invoice PDF downloaded");
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      toast("error", "Failed to download invoice PDF");
    } finally {
      setExportAction(null);
    }
  };

  const handlePrintPdf = async () => {
    setExportAction("print");
    try {
      const blob = await getInvoicePdfBlob();
      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");

      iframe.style.position = "fixed";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        window.setTimeout(() => {
          const printWindow = iframe.contentWindow;
          if (!printWindow) {
            window.open(blobUrl, "_blank", "noopener,noreferrer");
            return;
          }

          printWindow.focus();
          printWindow.print();

          window.setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            iframe.remove();
          }, 60000);
        }, 350);
      };
    } catch (error) {
      console.error("Error printing invoice PDF:", error);
      toast("error", "Failed to prepare invoice PDF for printing");
    } finally {
      setExportAction(null);
    }
  };

  const handleNativeShare = async () => {
    setExportAction("share");
    try {
      const blob = await getInvoicePdfBlob();
      const file = new File([blob], getPdfFileName(), { type: "application/pdf" });

      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: invoice?.invoiceNumber || "Invoice",
          text: buildShareText(),
          files: [file],
        });
        setShareOpen(false);
        toast("success", "Invoice shared");
        return;
      }

      downloadPdfBlob(blob);
      toast("error", "Native file sharing is not available on this device. PDF downloaded instead.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Error sharing invoice PDF:", error);
      toast("error", "Failed to share invoice PDF");
    } finally {
      setExportAction(null);
    }
  };

  const handleWhatsAppShare = async () => {
    setExportAction("whatsapp");
    try {
      const blob = await getInvoicePdfBlob();
      const file = new File([blob], getPdfFileName(), { type: "application/pdf" });
      const whatsappMessage = `${buildShareText()}\n\nPDF attached if your device supports file sharing.`;

      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: invoice?.invoiceNumber || "Invoice",
          text: whatsappMessage,
          files: [file],
        });
        setShareOpen(false);
        toast("success", "Invoice shared");
        return;
      }

      downloadPdfBlob(blob);
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${buildShareText()}\n\nPDF downloaded as ${getPdfFileName()}. Attach it in WhatsApp.`)}`,
        "_blank",
        "noopener,noreferrer"
      );
      setShareOpen(false);
      toast("success", "WhatsApp share opened and the PDF was downloaded");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Error sharing invoice on WhatsApp:", error);
      toast("error", "Failed to open WhatsApp sharing");
    } finally {
      setExportAction(null);
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
        <div className="flex flex-wrap gap-2">
          {invoice.status === "draft" && (
            <Button variant="outline" onClick={() => handleStatusUpdate("sent")}>
              <Send className="h-4 w-4 mr-2" /> Mark as Sent
            </Button>
          )}
          <Button variant="outline" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            <DollarSign className="h-4 w-4 mr-2" /> Record Payment
          </Button>
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
          <Button variant="outline" onClick={handlePrintPdf} disabled={exportAction !== null}>
            {exportAction === "print" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
            Print PDF
          </Button>
        </div>
      </div>

      {/* Invoice Preview */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          <div ref={invoicePreviewRef} className="mx-auto w-full max-w-[794px] rounded-[28px] bg-white p-8 text-slate-900 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            {/* Header */}
            <div className="mb-8 flex justify-between gap-6">
              <div>
                {appSettings?.companyProfile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={appSettings.companyProfile.logoUrl} alt="Company logo" className="mb-2 h-12 w-auto object-contain" />
                ) : null}
                <h2 className="text-2xl font-bold text-blue-600">{company?.name || appSettings?.companyName || "D4 Media"}</h2>
                <p className="mt-1 text-sm text-gray-500">{company?.address || appSettings?.companyProfile.address}</p>
                <p className="text-sm text-gray-500">
                  {(company?.phone || appSettings?.companyProfile.phone) ?? ""} | {(company?.email || appSettings?.companyProfile.email) ?? ""}
                </p>
                {appGstNumber && <p className="text-sm text-gray-500">GST: {appGstNumber}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-xl font-bold">{invoice.type === "quotation" ? "QUOTATION" : "INVOICE"}</h3>
                <p className="mt-1 text-sm text-gray-600">#{invoice.invoiceNumber}</p>
                <p className="text-sm text-gray-500">Date: {(invoice.date || invoice.createdAt) ? formatDate(new Date(((invoice.date || invoice.createdAt)!).seconds * 1000)) : "—"}</p>
                {invoice.dueDate && <p className="text-sm text-gray-500">Due: {formatDate(new Date(invoice.dueDate.seconds * 1000))}</p>}
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-8 rounded-lg bg-gray-50 p-4">
              <p className="mb-1 text-xs uppercase text-gray-500">Bill To</p>
              <p className="font-semibold">{client?.companyName}</p>
              <p className="text-sm text-gray-600">{client?.contactPerson}</p>
              {client?.address && <p className="text-sm text-gray-500">{client.address.street}, {client.address.city}, {client.address.state} - {client.address.pincode}</p>}
              {client?.gstNumber && <p className="text-sm text-gray-500">GST: {client.gstNumber}</p>}
            </div>

            {/* Items Table */}
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
                {invoice.items?.map((item, idx) => (
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

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-80 max-w-full space-y-2.5">
                <div className="flex items-baseline justify-between gap-8 text-sm">
                  <span className="whitespace-nowrap">Subtotal</span><span className="whitespace-nowrap">{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.discount?.value > 0 && (
                  <div className="flex items-baseline justify-between gap-8 text-sm text-red-600">
                    <span className="whitespace-nowrap">Discount</span><span className="whitespace-nowrap">-{formatCurrency(invoice.discount.value)}</span>
                  </div>
                )}
                {invoice.gstDetails && !invoice.gstDetails.isInterState && (
                  <>
                    <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">CGST</span><span className="whitespace-nowrap">{formatCurrency(invoice.gstDetails.cgst)}</span></div>
                    <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">SGST</span><span className="whitespace-nowrap">{formatCurrency(invoice.gstDetails.sgst)}</span></div>
                  </>
                )}
                {invoice.gstDetails?.isInterState && (
                  <div className="flex items-baseline justify-between gap-8 text-sm"><span className="whitespace-nowrap">IGST</span><span className="whitespace-nowrap">{formatCurrency(invoice.gstDetails.igst)}</span></div>
                )}
                <div className="flex items-baseline justify-between gap-8 border-t pt-2.5 text-lg font-bold">
                  <span className="whitespace-nowrap">Total</span><span className="whitespace-nowrap">{formatCurrency(invoice.totalAmount)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-8 text-sm text-green-600">
                  <span className="whitespace-nowrap">Paid</span><span className="whitespace-nowrap">{formatCurrency(invoice.paidAmount ?? 0)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-8 border-t pt-2.5 font-semibold">
                  <span className="whitespace-nowrap">Balance Due</span><span className="whitespace-nowrap">{formatCurrency(invoice.balanceAmount ?? (invoice.totalAmount - (invoice.paidAmount ?? 0)))}</span>
                </div>
              </div>
            </div>

            <p className="mt-4 border-t border-gray-100 pt-3 text-sm font-semibold italic leading-relaxed text-slate-700">{numberToWords(invoice.totalAmount)}</p>

            {invoice.notes && <div className="mt-6 text-sm"><p className="mb-1 font-semibold">Notes:</p><div className="rich-text-content leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: invoice.notes.includes("<") ? invoice.notes : invoice.notes.replace(/\n/g, "<br>") }} /></div>}
            {invoice.terms && <div className="mt-4 text-sm"><p className="mb-1 font-semibold">Terms & Conditions:</p><div className="rich-text-content leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: invoice.terms.includes("<") ? invoice.terms : invoice.terms.replace(/\n/g, "<br>") }} /></div>}

            {/* Bank Details */}
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
                    <p className="text-xs text-gray-500 capitalize">{p.paymentMode} {p.referenceNo && `\u00b7 ${p.referenceNo}`}{p.receiptNumber && ` \u00b7 ${p.receiptNumber}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-500">{p.date ? formatDate(new Date(p.date.seconds * 1000)) : "\u2014"}</p>
                    <Button variant="outline" size="sm" onClick={() => setReceiptData(p)}>
                      <Receipt className="h-4 w-4 mr-1" /> Receipt
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt Dialog */}
      <Dialog open={!!receiptData} onClose={() => setReceiptData(null)} className="max-w-2xl">
        <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
        {receiptData && (
          <div className="space-y-4">
            <div ref={receiptRef} className="mx-auto w-full max-w-[680px] rounded-2xl border border-slate-200 bg-white p-8 text-slate-900">
              <div className="flex items-start justify-between gap-6 border-b pb-4">
                <div>
                  {appSettings?.companyProfile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={appSettings.companyProfile.logoUrl} alt="Company logo" className="mb-2 h-10 w-auto object-contain" />
                  ) : null}
                  <h2 className="text-xl font-bold text-blue-600">{company?.name || appSettings?.companyName || "D4 Media"}</h2>
                  <p className="mt-1 text-xs text-gray-500">{company?.address || appSettings?.companyProfile.address}</p>
                  <p className="text-xs text-gray-500">{(company?.phone || appSettings?.companyProfile.phone) ?? ""} | {(company?.email || appSettings?.companyProfile.email) ?? ""}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold uppercase tracking-wide">Receipt</h3>
                  <p className="mt-1 text-sm text-gray-600">#{receiptData.receiptNumber || "—"}</p>
                  <p className="text-xs text-gray-500">Date: {receiptData.date ? formatDate(new Date(receiptData.date.seconds * 1000)) : "—"}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-gray-400">Received From</p>
                  <p className="font-semibold">{client?.companyName || "—"}</p>
                  {client?.contactPerson && <p className="text-gray-600">{client.contactPerson}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-gray-400">Against Invoice</p>
                  <p className="font-semibold">{invoice.invoiceNumber}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm">
                <div className="flex justify-between py-1"><span className="text-gray-500">Payment Mode</span><span className="font-medium capitalize">{receiptData.paymentMode}</span></div>
                {receiptData.referenceNo && <div className="flex justify-between py-1"><span className="text-gray-500">Reference No</span><span className="font-medium">{receiptData.referenceNo}</span></div>}
                <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold"><span>Amount Received</span><span>{formatCurrency(receiptData.amount)}</span></div>
              </div>

              <p className="mt-3 text-sm font-semibold italic text-slate-700">{numberToWords(receiptData.amount)}</p>

              <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-gray-500">
                <div>
                  <div className="flex justify-between py-0.5"><span>Invoice Total</span><span>{formatCurrency(invoice.totalAmount)}</span></div>
                  <div className="flex justify-between py-0.5"><span>Total Paid</span><span>{formatCurrency(invoice.paidAmount ?? 0)}</span></div>
                  <div className="flex justify-between py-0.5 font-semibold text-gray-700"><span>Balance Due</span><span>{formatCurrency(invoice.balanceAmount ?? 0)}</span></div>
                </div>
                <div className="flex flex-col items-end justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/d4-media-seal.svg" alt="D4 Media seal" className="h-24 w-24 object-contain opacity-90" />
                  <p className="mt-1 text-[10px]">Authorised Signatory</p>
                </div>
              </div>

              <p className="mt-4 border-t pt-3 text-center text-[11px] text-gray-400">This is a computer-generated receipt.</p>
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => handleReceiptPdf("download")} disabled={receiptExport !== null}>
                {receiptExport === "download" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Download
              </Button>
              <Button onClick={() => handleReceiptPdf("print")} disabled={receiptExport !== null}>
                {receiptExport === "print" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />} Print
              </Button>
            </div>
          </div>
        )}
      </Dialog>

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

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)}>
        <DialogHeader>
          <DialogTitle>Share Invoice</DialogTitle>
          <DialogDescription>
            Share the invoice PDF directly or open WhatsApp with the invoice details prefilled.
          </DialogDescription>
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
        <DialogHeader><DialogTitle>Edit {invoice.type === "quotation" ? "Quotation" : "Invoice"}</DialogTitle></DialogHeader>
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
              <Label>{invoice.type === "quotation" ? "Valid Until" : "Due Date"}</Label>
              <Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tax Type</Label>
              <SelectRoot value={editForm.taxType} onValueChange={(v) => setEditForm({ ...editForm, taxType: v as "gst" | "non-gst" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gst">GST</SelectItem>
                  <SelectItem value="non-gst">No Tax</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            {editForm.taxType === "gst" && (
              <div className="space-y-1">
                <Label>GST Rate %</Label>
                <Input type="number" value={editForm.gstRate} onChange={(e) => setEditForm({ ...editForm, gstRate: Number(e.target.value) })} />
              </div>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label>Items</Label>
            {editForm.items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5"><Input placeholder="Description" value={item.description} onChange={(e) => updateEditItem(idx, "description", e.target.value)} /></div>
                  <div className="col-span-2"><Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateEditItem(idx, "quantity", Number(e.target.value))} min={1} /></div>
                  <div className="col-span-2"><Input type="number" placeholder="Rate" value={item.rate} onChange={(e) => updateEditItem(idx, "rate", Number(e.target.value))} /></div>
                  <div className="col-span-2 pt-1 text-right text-sm font-medium">{formatCurrency(item.amount)}</div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setEditForm({ ...editForm, items: editForm.items.filter((_, i) => i !== idx) })} disabled={editForm.items.length <= 1}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
                <Input className="h-7 text-xs text-gray-500 border-dashed border-gray-300" placeholder="Item description (optional)" value={item.subDescription || ""} onChange={(e) => updateEditItem(idx, "subDescription", e.target.value)} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditForm({ ...editForm, items: [...editForm.items, { description: "", subDescription: "", quantity: 1, rate: 0, amount: 0, sacCode: "" }] })}>
              <Plus className="h-3 w-3 mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <RichTextEditor value={editForm.notes} onChange={(v) => setEditForm((f) => ({ ...f, notes: v }))} placeholder="Add notes..." />
          </div>
          <div className="space-y-1">
            <Label>Terms & Conditions</Label>
            <RichTextEditor value={editForm.terms} onChange={(v) => setEditForm((f) => ({ ...f, terms: v }))} placeholder="Add terms & conditions..." />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="button" disabled={editSaving} onClick={handleEditSave}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
