"use client";

import * as React from "react";
import { Upload, X, FileText, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type UploadFolder =
  | "employee-documents"
  | "branding"
  | "banners"
  | "notifications"
  | "profiles"
  | "misc";

interface FileUploadProps {
  /** Current stored URL (controlled). */
  value?: string;
  /** Called with the new public URL after a successful upload, or "" on clear. */
  onChange: (url: string, meta?: { name: string; size: number }) => void;
  /** Logical bucket folder. */
  folder: UploadFolder;
  /** Accept attribute, e.g. "image/*" or ".pdf,.doc,.docx". */
  accept?: string;
  /** Render an image thumbnail preview instead of a document chip. */
  preview?: "image" | "document";
  label?: string;
  className?: string;
  disabled?: boolean;
}

/** Uploads files to DigitalOcean Spaces via /api/upload and surfaces the URL. */
export function FileUpload({
  value,
  onChange,
  folder,
  accept = "image/*",
  preview = "image",
  label,
  className,
  disabled,
}: FileUploadProps) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await upload(file);
    }
    // Allow re-selecting the same file.
    event.target.value = "";
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }
      onChange(data.url, { name: data.name, size: data.size });
      toast("success", "File uploaded");
    } catch (error) {
      console.error("Upload error:", error);
      toast("error", error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clear = () => onChange("");

  const isImage = preview === "image";

  return (
    <div className={cn("space-y-2", className)}>
      {label && <p className="text-sm font-medium text-slate-700">{label}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleSelect}
        disabled={disabled || uploading}
      />

      {value ? (
        <div className="flex items-center gap-3">
          {isImage ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Uploaded preview" className="h-full w-full object-contain" />
            </div>
          ) : (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-teal-700 hover:underline"
            >
              <FileText className="h-4 w-4" /> View file
            </a>
          )}
          <button
            type="button"
            onClick={clear}
            disabled={disabled || uploading}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-500 transition hover:border-teal-400 hover:text-teal-600 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              {isImage ? <ImageIcon className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              <span>Click to upload {isImage ? "an image" : "a file"}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
