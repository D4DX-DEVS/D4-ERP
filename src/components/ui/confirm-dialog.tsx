"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Lock body scroll while open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const iconColors: Record<string, string> = {
    danger: "bg-red-50 text-red-500",
    warning: "bg-amber-50 text-amber-500",
    default: "bg-slate-100 text-slate-500",
  };

  const confirmColors: Record<string, string> = {
    danger:
      "bg-red-500 hover:bg-red-600 text-white border-red-500 hover:border-red-600",
    warning:
      "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 hover:border-amber-600",
    default:
      "bg-slate-800 hover:bg-slate-900 text-white border-slate-800 hover:border-slate-900",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-[3px]"
        onClick={onCancel}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full max-w-sm rounded-2xl border border-slate-200/90",
          "bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]",
          "animate-slide-up p-6"
        )}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <span
            className={cn(
              "inline-flex h-12 w-12 items-center justify-center rounded-full",
              iconColors[variant]
            )}
          >
            {variant === "danger" ? (
              <Trash2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </span>
        </div>

        {/* Title */}
        {title && (
          <h3 className="text-center text-base font-semibold text-slate-900 mb-1">
            {title}
          </h3>
        )}

        {/* Message */}
        <p className="text-center text-sm text-slate-500 leading-relaxed mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 cursor-pointer"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <button
            className={cn(
              "flex-1 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium border transition-colors cursor-pointer",
              confirmColors[variant]
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
