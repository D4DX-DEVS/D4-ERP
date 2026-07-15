"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  where,
  Timestamp,
} from "@/lib/firestore";
import {
  Staff,
  Company,
  Department,
  EmployeeDocument,
  CertificateTemplate,
  IssuedLetter,
} from "@/types";
import {
  renderTemplate,
  ensureDefaultTemplates,
  DEFAULT_TEMPLATES,
} from "@/lib/certificates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  ArrowLeft,
  Download,
  Printer,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Edit3,
} from "lucide-react";
import Link from "next/link";

type Step = "template-select" | "staff-select" | "values-edit" | "preview" | "confirm";

export default function CertificatesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);

  // Authorization
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/dashboard");
    }
  }, [user, router]);

  const [initializing, setInitializing] = useState(true);
  const [step, setStep] = useState<Step>("template-select");
  const [templates, setTemplates] = useState<(CertificateTemplate & { id: string })[]>([]);
  const [allStaff, setAllStaff] = useState<(Staff & { id: string })[]>([]);
  const [companies, setCompanies] = useState<(Company & { id: string })[]>([]);
  const [departments, setDepartments] = useState<(Department & { id: string })[]>([]);

  // Selected data
  const [selectedTemplate, setSelectedTemplate] = useState<CertificateTemplate & { id: string } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<(Staff & { id: string }) | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [renderedHtml, setRenderedHtml] = useState("");

  // UI state
  const [managingTemplates, setManagingTemplates] = useState(false);
  const [templateEditForm, setTemplateEditForm] = useState({ name: "", signatoryName: "" });
  const [saving, setSaving] = useState(false);
  const [exportAction, setExportAction] = useState<null | "download" | "print">(null);
  const [staffSearch, setStaffSearch] = useState("");

  // Initialize
  useEffect(() => {
    async function init() {
      try {
        await ensureDefaultTemplates();
        const [tmpl, staff, comps, depts] = await Promise.all([
          getDocuments<CertificateTemplate>("letterTemplates"),
          getDocuments<Staff>("staff"),
          getDocuments<Company>("companies"),
          getDocuments<Department>("departments"),
        ]);
        setTemplates(tmpl);
        setAllStaff(staff);
        setCompanies(comps);
        setDepartments(depts);
      } catch (error) {
        toast("error", "Failed to initialize certificates");
      } finally {
        setInitializing(false);
      }
    }
    void init();
  }, [toast]);

  // When template selected, prepare default values
  useEffect(() => {
    if (!selectedTemplate || !selectedStaff) return;

    const dept = departments.find((d) => d.id === selectedStaff.departmentId);
    const comp = companies.find((c) => c.id === selectedStaff.companyId);

    const defaultValues: Record<string, string> = {
      name: `${selectedStaff.firstName} ${selectedStaff.lastName}`,
      designation: selectedStaff.designation || "",
      department: dept?.name || "",
      companyName: comp?.name || "",
      joinDate: selectedStaff.dateOfJoining
        ? new Date(selectedStaff.dateOfJoining.seconds * 1000)
            .toISOString()
            .split("T")[0]
        : "",
      endDate: selectedStaff.contractEndDate
        ? new Date(selectedStaff.contractEndDate.seconds * 1000)
            .toISOString()
            .split("T")[0]
        : "",
      month: new Date().toLocaleString("default", { month: "long" }),
      year: new Date().getFullYear().toString(),
      issuanceDate: new Date().toISOString().split("T")[0],
      address: selectedStaff.address
        ? `${selectedStaff.address.street}, ${selectedStaff.address.city}, ${selectedStaff.address.state} ${selectedStaff.address.pincode}`
        : "",
      signatoryName: selectedTemplate?.signatoryName || "",
      logoUrl: selectedTemplate?.logoUrl || "",
      signatureUrl: selectedTemplate?.signatureUrl || "",
      reportingTo: "", // To be filled by user
      employmentType: selectedStaff.employmentType || "permanent",
    };

    setValues(defaultValues);
  }, [selectedTemplate, selectedStaff, departments, companies]);

  // Update preview
  useEffect(() => {
    if (selectedTemplate && values) {
      const html = renderTemplate(selectedTemplate.bodyHtml, values);
      setRenderedHtml(html);
    }
  }, [selectedTemplate, values]);

  const handleIssue = async () => {
    if (!selectedTemplate || !selectedStaff || !renderedHtml) return;

    setSaving(true);
    try {
      // Map template key to document category
      let category: "certificate" | "appointment-letter" | "experience-letter" | "relieving-letter" =
        "certificate";
      if (selectedTemplate.key.includes("appointment")) category = "appointment-letter";
      else if (selectedTemplate.key.includes("experience")) category = "experience-letter";
      else if (selectedTemplate.key.includes("relieving")) category = "relieving-letter";

      // Create issuedLetters record
      const letterDoc = {
        templateKey: selectedTemplate.key,
        templateName: selectedTemplate.name,
        staffId: selectedStaff.id!,
        staffName: `${selectedStaff.firstName} ${selectedStaff.lastName}`,
        designation: selectedStaff.designation,
        values,
        fileUrl: "", // Will be set if PDF generated
        issuedBy: user?.staffId || "",
        issuedByName: user ? `${user.firstName} ${user.lastName}` : "",
      };

      const letterId = await createDocument("issuedLetters", letterDoc);

      // Create employee_documents record
      const empDoc = {
        staffId: selectedStaff.id!,
        name: `${selectedTemplate.name} - ${selectedStaff.firstName} ${selectedStaff.lastName}`,
        category,
        fileUrl: "", // Print-only for now; if PDF upload is added, set this
        fileName: `${selectedTemplate.key}-${selectedStaff.id}.pdf`,
        notes: `Issued from certificate system. Letter ID: ${letterId}`,
        uploadedBy: user?.staffId || "",
      };

      await createDocument("employee_documents", empDoc);

      // Send notification
      try {
        await createDocument("notifications", {
          recipientId: selectedStaff.id!,
          type: "system",
          title: "Certificate Issued",
          message: `A ${selectedTemplate.name} has been issued for you. View it in your profile.`,
          link: "/staff-portal/profile",
          isRead: false,
        });
      } catch {
        // Notification failure is non-critical
      }

      toast("success", `${selectedTemplate.name} issued successfully`);
      setStep("template-select");
      setSelectedTemplate(null);
      setSelectedStaff(null);
      setValues({});
    } catch (error) {
      console.error("Error issuing certificate:", error);
      toast("error", "Failed to issue certificate");
    } finally {
      setSaving(false);
    }
  };

  const handlePrintOrDownload = async (action: "print" | "download") => {
    if (!previewRef.current || !selectedTemplate) return;

    setExportAction(action);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        windowWidth: previewRef.current.scrollWidth,
        windowHeight: previewRef.current.scrollHeight,
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
      const pageCanvasHeight = Math.max(
        1,
        Math.floor((canvas.width / usableWidth) * usableHeight)
      );

      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("Failed to prepare PDF page");

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
          sliceHeight
        );

        const sliceData = pageCanvas.toDataURL("image/png");
        const sliceImageHeight = (sliceHeight * usableWidth) / canvas.width;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceData, "PNG", margin, margin, usableWidth, sliceImageHeight, undefined, "FAST");

        renderedHeight += sliceHeight;
        pageIndex += 1;
      }

      if (action === "download") {
        const filename = `${selectedTemplate.key}-${selectedStaff?.id || "certificate"}.pdf`;
        const blob = pdf.output("blob");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("success", "PDF downloaded");
      } else {
        const blob = pdf.output("blob");
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.style.opacity = "0";
        iframe.src = url;
        document.body.appendChild(iframe);

        iframe.onload = () => {
          setTimeout(() => {
            const printWindow = iframe.contentWindow;
            if (!printWindow) {
              window.open(url, "_blank");
              return;
            }
            printWindow.focus();
            printWindow.print();
            setTimeout(() => {
              URL.revokeObjectURL(url);
              iframe.remove();
            }, 60000);
          }, 350);
        };
      }
    } catch (error) {
      console.error("Error:", error);
      toast("error", `Failed to ${action === "print" ? "print" : "download"} PDF`);
    } finally {
      setExportAction(null);
    }
  };

  if (!user || user.role !== "admin") return null;
  if (initializing)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    );

  const filteredStaff = allStaff.filter(
    (s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.employeeCode?.toLowerCase().includes(staffSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/staff">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Certificate Management</h1>
      </div>

      {/* Template Selection */}
      {step === "template-select" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => {
                  setSelectedTemplate(tmpl);
                  setStep("staff-select");
                }}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-600 transition-colors text-left hover:bg-emerald-50"
              >
                <p className="font-semibold text-gray-900">{tmpl.name}</p>
                <p className="text-sm text-gray-500 mt-1">Click to select</p>
              </button>
            ))}
          </div>

          {/* Manage Templates */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setManagingTemplates(!managingTemplates)}
                className="w-full flex items-center justify-between"
              >
                <CardTitle className="text-base">Manage Templates</CardTitle>
                {managingTemplates ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </button>
            </CardHeader>
            {managingTemplates && (
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Edit template names and signatory details below.
                </p>
                {templates.map((tmpl) => (
                  <div key={tmpl.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={tmpl.name}
                          readOnly
                          className="text-sm"
                          disabled
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Signatory Name</Label>
                        <Input
                          value={tmpl.signatoryName || ""}
                          onChange={(e) =>
                            setTemplates(
                              templates.map((t) =>
                                t.id === tmpl.id
                                  ? { ...t, signatoryName: e.target.value }
                                  : t
                              )
                            )
                          }
                          placeholder="e.g., HR Director"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          await updateDocument("letterTemplates", tmpl.id, {
                            signatoryName: tmpl.signatoryName,
                          });
                          toast("success", "Template updated");
                        } catch {
                          toast("error", "Failed to update template");
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Staff Selection */}
      {step === "staff-select" && selectedTemplate && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep("template-select");
                setSelectedTemplate(null);
                setSelectedStaff(null);
              }}
            >
              <ChevronUp className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-semibold">Select Staff Member</h2>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label>Search Staff</Label>
                <Input
                  placeholder="Name or employee code..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredStaff.length === 0 ? (
                  <p className="text-sm text-gray-500">No staff found</p>
                ) : (
                  filteredStaff.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() => {
                        setSelectedStaff(staff);
                        setStep("values-edit");
                      }}
                      className="w-full p-3 text-left border border-gray-200 rounded-lg hover:border-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <p className="font-medium">
                        {staff.firstName} {staff.lastName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {staff.employeeCode} • {staff.designation}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Values Edit */}
      {step === "values-edit" && selectedTemplate && selectedStaff && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("staff-select")}
            >
              <ChevronUp className="h-4 w-4" /> Back
            </Button>
            <h2 className="font-semibold">Edit Certificate Details</h2>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4 max-h-96 overflow-y-auto pr-2">
              {Object.entries(values).map(([key, value]) => (
                <div key={key}>
                  <Label className="text-sm capitalize">{key}</Label>
                  <Input
                    value={value}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                    placeholder={`Enter ${key}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setStep("preview")}
            >
              Preview
            </Button>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === "preview" && selectedTemplate && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Preview</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("values-edit")}
              className="gap-2"
            >
              <Edit3 className="h-4 w-4" /> Edit
            </Button>
          </div>

          <Card className="print:shadow-none print:border-0">
            <CardContent className="p-8">
              <div
                ref={previewRef}
                className="mx-auto w-full max-w-[794px] rounded-lg bg-white p-8 text-slate-900 shadow-sm border border-slate-100 print:shadow-none print:border-0"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => handlePrintOrDownload("print")}
              disabled={exportAction !== null}
            >
              {exportAction === "print" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              Print
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePrintOrDownload("download")}
              disabled={exportAction !== null}
            >
              {exportAction === "download" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button onClick={() => setStep("confirm")} disabled={saving}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Issue Certificate
            </Button>
          </div>
        </div>
      )}

      {/* Confirm */}
      {step === "confirm" && selectedTemplate && selectedStaff && (
        <Dialog open={true} onClose={() => setStep("preview")}>
          <DialogHeader>
            <DialogTitle>Issue Certificate</DialogTitle>
            <DialogDescription>
              This will create a record in the staff member's documents and send them a notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p>
                <strong>Certificate:</strong> {selectedTemplate.name}
              </p>
              <p>
                <strong>Staff:</strong> {selectedStaff.firstName} {selectedStaff.lastName}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("preview")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleIssue} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm & Issue
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
