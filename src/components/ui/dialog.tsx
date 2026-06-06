"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/* ===== Compound Dialog (shadcn-like: Dialog + DialogTrigger + DialogContent) ===== */

const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (o: boolean) => void;
}>({ open: false, setOpen: () => {} });

interface DialogRootProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  className?: string;
}

export function Dialog({ children, open: controlledOpen, onOpenChange, onClose, className }: DialogRootProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (val: boolean) => {
      if (onOpenChange) onOpenChange(val);
      if (!val && onClose) onClose();
      if (!isControlled) setInternalOpen(val);
    },
    [onOpenChange, onClose, isControlled]
  );

  // Legacy mode: if onClose is provided and no DialogContent child, render as overlay directly
  const hasDialogContent = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && (child.type === DialogContent || child.type === DialogTrigger)
  );

  if (!hasDialogContent && open) {
    // Legacy inline mode
    return (
      <DialogContext.Provider value={{ open, setOpen }}>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:left-[calc(var(--sidebar-width)+1.75rem)] lg:w-[calc(100vw-var(--sidebar-width)-1.75rem)] lg:pr-6">
          <div className="fixed inset-0 bg-slate-950/38 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "erp-dialog-panel relative z-50 w-full max-w-lg max-h-[min(88vh,900px)] overflow-y-auto scrollbar-hide rounded-[30px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(249,251,250,0.985))] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.18)] animate-slide-up sm:p-6",
              className
            )}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:border-slate-300 hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </div>
        </div>
      </DialogContext.Provider>
    );
  }

  if (!hasDialogContent && !open) {
    return null;
  }

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(true),
    });
  }
  return <button onClick={() => setOpen(true)}>{children}</button>;
}

export function DialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, setOpen } = React.useContext(DialogContext);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:left-[calc(var(--sidebar-width)+1.75rem)] lg:w-[calc(100vw-var(--sidebar-width)-1.75rem)] lg:pr-6">
      <div className="fixed inset-0 bg-slate-950/38 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
      <div
        className={cn(
          "erp-dialog-panel relative z-50 w-full max-w-lg max-h-[min(88vh,900px)] overflow-y-auto scrollbar-hide rounded-[30px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(249,251,250,0.985))] p-5 shadow-[0_28px_80px_rgba(15,23,42,0.18)] animate-slide-up sm:p-6",
          className
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:border-slate-300 hover:bg-white hover:text-slate-800 transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-5 flex flex-col gap-1 border-b border-slate-200/80 pb-4 pr-10", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl font-semibold leading-none tracking-[-0.02em] text-slate-900", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-slate-500", className)} {...props} />;
}
