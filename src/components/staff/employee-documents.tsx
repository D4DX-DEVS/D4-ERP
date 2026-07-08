"use client";

import { useEffect, useState } from "react";
import { getDocuments, createDocument, deleteDocument, where, orderBy, Timestamp } from "@/lib/firestore";
import { EmployeeDocument, EmployeeDocumentCategory } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/components/ui/toast";
import { FileText, FolderOpen, Trash2, Plus, Download, Loader2 } from "lucide-react";

const CATEGORY_OPTIONS: { value: EmployeeDocumentCategory; label: string }[] = [
  { value: "cv", label: "CV / Resume" },
  { value: "id-proof", label: "ID Proof" },
  { value: "certificate", label: "Certificate" },
  { value: "contract", label: "Contract" },
  { value: "appointment-letter", label: "Appointment Letter" },
  { value: "experience-letter", label: "Experience Letter" },
  { value: "relieving-letter", label: "Relieving Letter" },
  { value: "payslip", label: "Payslip" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface EmployeeDocumentsProps {
  staffId: string;
  /** When false, the component is read-only (e.g. staff viewing own docs). */
  canManage?: boolean;
  uploadedBy?: string;
}

/** Per-employee document store (CVs, certificates, letters) backed by Spaces URLs. */
export function EmployeeDocuments({ staffId, canManage = false, uploadedBy = "" }: EmployeeDocumentsProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<(EmployeeDocument & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "cv" as EmployeeDocumentCategory,
    fileUrl: "",
    fileName: "",
    fileSize: 0,
    notes: "",
  });

  const fetchDocs = async () => {
    try {
      const data = await getDocuments<EmployeeDocument>("employee_documents", [
        where("staffId", "==", staffId),
        orderBy("createdAt", "desc"),
      ]);
      setDocs(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function load() {
      await fetchDocs();
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId]);

  const resetForm = () => setForm({ name: "", category: "cv", fileUrl: "", fileName: "", fileSize: 0, notes: "" });

  const handleSave = async () => {
    if (!form.fileUrl) {
      toast("error", "Please upload a file first");
      return;
    }
    if (!form.name.trim()) {
      toast("error", "Please enter a document name");
      return;
    }
    setSaving(true);
    try {
      await createDocument("employee_documents", {
        staffId,
        name: form.name.trim(),
        category: form.category,
        fileUrl: form.fileUrl,
        fileName: form.fileName || null,
        fileSize: form.fileSize || null,
        notes: form.notes.trim() || null,
        uploadedBy,
        createdAt: Timestamp.now(),
      });
      toast("success", "Document saved");
      resetForm();
      setAdding(false);
      await fetchDocs();
    } catch (error) {
      console.error("Error:", error);
      toast("error", "Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDocument("employee_documents", id);
      toast("success", "Document removed");
      await fetchDocs();
    } catch {
      toast("error", "Failed to delete document");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-teal-500" /> Documents
        </CardTitle>
        {canManage && !adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && adding && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Resume 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as EmployeeDocumentCategory })}
                  options={CATEGORY_OPTIONS}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>File *</Label>
              <FileUpload
                value={form.fileUrl}
                onChange={(url, meta) => setForm({ ...form, fileUrl: url, fileName: meta?.name || "", fileSize: meta?.size || 0 })}
                folder="employee-documents"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                preview="document"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAdding(false); resetForm(); }} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-500">No documents uploaded.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <Badge variant="bg-slate-100 text-slate-600">{CATEGORY_LABEL[d.category] || d.category}</Badge>
                      {d.fileSize ? <span>{formatSize(d.fileSize)}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a href={d.fileUrl} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                  </a>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
