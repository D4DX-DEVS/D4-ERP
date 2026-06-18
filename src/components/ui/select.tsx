"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, Check, Plus } from "lucide-react";

/* ===== Simple Select (modern dropdown, same options/value/onChange API) ===== */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Optional action link rendered at the bottom of the dropdown */
  footerAction?: { label: string; href: string };
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, options, placeholder, value, onChange, disabled, id, name, required, footerAction }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    React.useEffect(() => setMounted(true), []);

    const stringValue = value === undefined || value === null ? "" : String(value);
    const selected = options.find((o) => o.value === stringValue);

    const updateCoords = React.useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, left: r.left, width: r.width });
    }, []);

    const toggle = () => {
      if (disabled) return;
      if (!open) updateCoords();
      setOpen((o) => !o);
    };

    React.useEffect(() => {
      if (!open) return;
      const close = () => setOpen(false);
      const onScroll = () => setOpen(false);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("resize", close);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("resize", close);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const handleSelect = (v: string) => {
      setOpen(false);
      onChange?.({
        target: { value: v, name },
        currentTarget: { value: v, name },
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
    };

    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-required={required}
          onClick={toggle}
          data-open={open}
          className={cn(
            "flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-left text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 backdrop-blur-sm hover:border-teal-300/70 hover:bg-white focus-visible:border-teal-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/14 focus-visible:ring-offset-0 data-[open=true]:border-teal-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
            className
          )}
        >
          <span className={cn("truncate", selected ? "text-slate-800" : "text-slate-400")}>
            {selected ? selected.label : placeholder || "Select..."}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180 text-teal-600")}
          />
        </button>

        {mounted &&
          open &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[200]" onMouseDown={() => setOpen(false)} />
              <div
                role="listbox"
                style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
                className="z-[201] max-h-60 overflow-y-auto rounded-[20px] border border-slate-200/80 bg-white p-1.5 shadow-[0_8px_32px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur-xl animate-in"
              >
                {options.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-400">{placeholder || "No options"}</div>
                )}
                {options.map((option) => {
                  const isSelected = option.value === stringValue;
                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option.value)}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                        isSelected
                          ? "bg-teal-50 text-teal-700 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <span className="flex-1">{option.label}</span>
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-opacity",
                          isSelected ? "opacity-100 text-teal-600" : "opacity-0"
                        )}
                      />
                    </div>
                  );
                })}
                {footerAction && (
                  <a
                    href={footerAction.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl border-t border-slate-100 mt-1 px-3 py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{footerAction.label}</span>
                  </a>
                )}
              </div>
            </>,
            document.body
          )}
      </>
    );
  }
);
Select.displayName = "Select";

/* ===== Compound Select (shadcn-like) ===== */

const SelectContext = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}>({ value: "", onValueChange: () => {}, open: false, setOpen: () => {} });

function SelectRoot({
  children,
  value,
  onValueChange,
}: {
  children: React.ReactNode;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, setOpen } = React.useContext(SelectContext);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-left text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 backdrop-blur-sm hover:border-teal-300/70 hover:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/14 focus:ring-offset-0 data-[open=true]:border-teal-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
        className
      )}
      data-open={open}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180 text-teal-600")} />
    </button>
  );
}

function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
  const { value } = React.useContext(SelectContext);
  if (children !== undefined && children !== null && value) {
    return <span className="text-slate-800">{children}</span>;
  }
  return <span className={!value ? "text-slate-400" : "text-slate-800"}>{value ? (children ?? value) : (placeholder || "Select...")}</span>;
}

function SelectContent({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.closest(".relative")?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  return (
    <div
      ref={ref}
      style={{
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.97)",
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 150ms ease, transform 150ms ease",
      }}
      className="absolute z-50 mt-2 w-full max-h-60 overflow-y-auto rounded-[20px] border border-slate-200/80 bg-white p-1.5 shadow-[0_8px_32px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur-xl"
    >
      {children}
    </div>
  );
}

function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
  const { value: selected, onValueChange, setOpen } = React.useContext(SelectContext);
  const isSelected = selected === value;
  return (
    <div
      onClick={() => { onValueChange(value); setOpen(false); }}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
        isSelected
          ? "bg-teal-50 text-teal-700 font-medium"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <span className="flex-1">{children}</span>
      <Check
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-opacity",
          isSelected ? "opacity-100 text-teal-600" : "opacity-0"
        )}
      />
    </div>
  );
}

export { Select, SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem };
