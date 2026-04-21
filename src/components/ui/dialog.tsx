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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "relative z-50 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl animate-in fade-in",
              className
            )}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div
        className={cn(
          "relative z-50 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl animate-in fade-in",
          className
        )}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-gray-500", className)} {...props} />;
}
