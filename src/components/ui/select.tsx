"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

/* ===== Legacy simple Select (used by older pages) ===== */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-12 w-full appearance-none rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 backdrop-blur-sm hover:border-teal-300/70 hover:bg-white focus-visible:border-teal-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/14 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
          className
        )}
        ref={ref}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = React.useContext(SelectContext);
  return <span className={!value ? "text-slate-400" : "text-slate-800"}>{value || placeholder || "Select..."}</span>;
}

function SelectContent({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className="absolute z-50 mt-2 w-full max-h-60 overflow-y-auto rounded-[24px] border border-slate-200/80 bg-white/97 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-in"
    >
      {children}
    </div>
  );
}

function SelectItem({ children, value }: { children: React.ReactNode; value: string }) {
  const { value: selected, onValueChange, setOpen } = React.useContext(SelectContext);
  return (
    <div
      onClick={() => { onValueChange(value); setOpen(false); }}
      className={cn(
        "cursor-pointer rounded-2xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100/90 hover:text-slate-950",
        selected === value && "bg-teal-50 text-teal-700 font-medium"
      )}
    >
      {children}
    </div>
  );
}

export { Select, SelectRoot, SelectTrigger, SelectValue, SelectContent, SelectItem };
