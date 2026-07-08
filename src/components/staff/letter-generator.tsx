"use client";

import { useEffect, useRef, useState } from "react";
import { createDocument, Timestamp } from "@/lib/firestore";
import { getAppSettings, type AppSettings } from "@/lib/settings";
import {
  LETTER_TYPES,
  DEFAULT_LETTER_BODIES,
  renderLetterBody,
  type LetterType,
  type LetterVariables,
} from "@/lib/letter-templates";
import type { Staff } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { generateDocumentPdfBlob, downloadPdfBlob } from "@/lib/document-pdf";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FileSignature, Download, Save, Loader2 } from "lucide-react";

interface LetterGeneratorProps {
  staff: Staff;
  staffId: string;
  departmentName?: string;
  companyName?: string;
  companyAddress?: string;
  /** Staff id of the admin generating the letter (stored on saved documents). */
  uploadedBy?: string;
}

const DOC_CATEGORY: Record<LetterType, string> = {
  experience: "experience-letter",
  appointment: "appointment-letter",
  relieving: "relieving-letter",
};

function tsToDate(ts?: { seconds: number } | null): Date | null {
  if (!ts || typeof ts.seconds !== "number") return null;
  return new Date(ts.seconds * 1000);
}

function pronounsFor(gender?: string): { pronoun: string; possessive: string } {
  if (gender === "Male") return { pronoun: "he", possessive: "his" };
  if (gender === "Female") return { pronoun: "she", possessive: "her" };
  return { pronoun: "they", possessive: "their" };
}

/** Admin tool to generate HR letters (experience / appointment / relieving) as PDF. */
export function LetterGenerator({
  staff,
  staffId,
  departmentName = "",
  companyName = "",
  companyAddress = "",
  uploadedBy = "",
}: LetterGeneratorProps) {
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [letterType, setLetterType] = useState<LetterType>("experience");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const joiningDate = tsToDate(staff.dateOfJoining);
  const { pronoun, possessive } = pronounsFor(staff.gender);

  const [vars, setVars] = useState<LetterVariables>({
    employeeName: `${staff.firstName} ${staff.lastName}`.trim(),
    designation: staff.designation || "",
    department: departmentName,
    employeeId: staff.employeeCode || "",
    joiningDate: joiningDate ? formatDate(joiningDate) : "",
    lastWorkingDate: formatDate(new Date()),
    salary: formatCurrency(staff.currentSalary || 0),
    pronoun,
    possessive,
    companyName: companyName,
    companyAddress: companyAddress,
    date: formatDate(new Date()),
  });

  useEffect(() => {
    void getAppSettings()
      .then(setSettings)
      .catch((error) => console.error("Error:", error));
  }, []);

  const setVar = (key: keyof LetterVariables, value: string) =>
    setVars((prev) => ({ ...prev, [key]: value }));

  const bodyTemplate =
    settings?.letterSettings
      ? letterType === "experience"
        ? settings.letterSettings.experienceBody
        : letterType === "appointment"
        ? settings.letterSettings.appointmentBody
        : settings.letterSettings.relievingBody
      : DEFAULT_LETTER_BODIES[letterType];

  const renderedBody = renderLetterBody(bodyTemplate || DEFAULT_LETTER_BODIES[letterType], vars);
  const meta = LETTER_TYPES.find((t) => t.type === letterType)!;
  const branding = settings?.letterSettings;
  const logoUrl = settings?.companyProfile.logoUrl || "";
  const displayName = vars.companyName || settings?.companyName || "";
  const displayAddress = vars.companyAddress || settings?.companyProfile.address || "";

  const buildPdf = async (): Promise<Blob | null> => {
    if (!previewRef.current) return null;
    return generateDocumentPdfBlob(previewRef.current, meta.label);
  };

  const fileName = () =>
    `${meta.label.replace(/\s+/g, "-")}-${(staff.employeeCode || staff.firstName || "staff").replace(/\s+/g, "-")}.pdf`;

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await buildPdf();
      if (!blob) return;
      downloadPdfBlob(blob, fileName());
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    setSaving(true);
    try {
      const blob = await buildPdf();
      if (!blob) return;

      const fd = new FormData();
      fd.append("file", new File([blob], fileName(), { type: "application/pdf" }));
      fd.append("folder", "employee-documents");

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { url: string; name: string; size: number };

      await createDocument("employee_documents", {
        staffId: staffId,
        name: `${meta.label} - ${vars.date}`,
        category: DOC_CATEGORY[letterType],
        fileUrl: data.url,
        fileName: data.name || null,
        fileSize: data.size || null,
        notes: "Auto-generated letter",
        uploadedBy,
        createdAt: Timestamp.now(),
      });

      toast("success", "Letter saved to documents");
      setOpen(false);
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save letter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileSignature className="h-4 w-4 mr-2" />
        Generate Letter
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} className="max-w-4xl">
        <div className="space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Generate Letter</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Letter Type</Label>
              <Select
                value={letterType}
                onChange={(e) => setLetterType(e.target.value as LetterType)}
                options={LETTER_TYPES.map((t) => ({ value: t.type, label: t.label }))}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input value={vars.date} onChange={(e) => setVar("date", e.target.value)} placeholder="e.g. 08 July 2026" />
            </div>
            <div>
              <Label>Employee Name</Label>
              <Input value={vars.employeeName} onChange={(e) => setVar("employeeName", e.target.value)} placeholder="e.g. Nihal K" />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={vars.designation} onChange={(e) => setVar("designation", e.target.value)} placeholder="e.g. Staff" />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={vars.department} onChange={(e) => setVar("department", e.target.value)} placeholder="e.g. Operations" />
            </div>
            <div>
              <Label>Employee ID</Label>
              <Input value={vars.employeeId} onChange={(e) => setVar("employeeId", e.target.value)} placeholder="e.g. 03AGDL" />
            </div>
            <div>
              <Label>Joining Date</Label>
              <Input value={vars.joiningDate} onChange={(e) => setVar("joiningDate", e.target.value)} placeholder="e.g. 08 July 2026" />
            </div>
            <div>
              <Label>Last Working Date</Label>
              <Input value={vars.lastWorkingDate} onChange={(e) => setVar("lastWorkingDate", e.target.value)} placeholder="e.g. 08 July 2026" />
            </div>
            <div>
              <Label>Salary (CTC)</Label>
              <Input value={vars.salary} onChange={(e) => setVar("salary", e.target.value)} placeholder="e.g. 25,000" />
            </div>
          </div>

          {/* Live preview — this node is what gets rendered to PDF. */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 max-h-[420px] overflow-hidden">
            <div
              ref={previewRef}
              style={{
                width: "794px",
                minHeight: "1000px",
                margin: "0 auto",
                background: "#ffffff",
                padding: "56px 64px",
                color: "#1f2937",
                fontFamily: "Georgia, 'Times New Roman', serif",
                position: "relative",
              }}
            >
              {branding?.letterheadUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.letterheadUrl}
                  alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.12 }}
                />
              )}

              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #111827", paddingBottom: "16px", marginBottom: "32px" }}>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#111827" }}>
                    {displayName}
                  </div>
                  {displayAddress && (
                    <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", maxWidth: "380px" }}>
                      {displayAddress}
                    </div>
                  )}
                </div>
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" style={{ height: "56px", objectFit: "contain" }} />
                )}
              </div>

              <div style={{ position: "relative" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "24px" }}>Date: {vars.date}</div>

                <div style={{ textAlign: "center", fontSize: "16px", fontWeight: 700, letterSpacing: "0.04em", textDecoration: "underline", marginBottom: "28px" }}>
                  {meta.heading}
                </div>

                <div style={{ fontSize: "14px", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{renderedBody}</div>

                <div style={{ marginTop: "56px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    {branding?.signatureUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={branding.signatureUrl} alt="signature" style={{ height: "56px", objectFit: "contain", marginBottom: "6px" }} />
                    )}
                    <div style={{ borderTop: "1px solid #9ca3af", paddingTop: "6px", width: "220px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600 }}>{branding?.authorizedSignatory || ""}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{branding?.signatoryDesignation || ""}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{displayName}</div>
                    </div>
                  </div>
                  {branding?.sealUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.sealUrl} alt="seal" style={{ height: "96px", objectFit: "contain", opacity: 0.92 }} />
                  )}
                </div>

                {branding?.footerText && (
                  <div style={{ marginTop: "48px", borderTop: "1px solid #e5e7eb", paddingTop: "12px", textAlign: "center", fontSize: "11px", color: "#9ca3af" }}>
                    {branding.footerText}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={generating || saving}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
            <Button onClick={handleSaveToDocuments} disabled={saving || generating}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save to Documents
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
