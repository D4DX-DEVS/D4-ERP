"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

export interface TimePickerProps {
  /** 24-hour "HH:MM" value (same as native <input type="time">). */
  value?: string;
  /** Emits a synthetic change event so existing `(e) => e.target.value` handlers keep working. */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  /** Minute step for the minutes column. Default 5. */
  minuteStep?: number;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parse(value?: string): { h24: number; m: number } | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h24: h, m };
}

function to12h(h24: number): { h12: number; period: "AM" | "PM" } {
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, period };
}

function to24h(h12: number, period: "AM" | "PM"): number {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

const TimePicker = React.forwardRef<HTMLButtonElement, TimePickerProps>(
  ({ value, onChange, className, placeholder, disabled, required, id, name, minuteStep = 5 }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);
    React.useEffect(() => setMounted(true), []);

    const parsed = parse(value);
    const current = parsed ? to12h(parsed.h24) : null;

    const hours = React.useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const minutes = React.useMemo(() => {
      const step = minuteStep > 0 ? minuteStep : 5;
      return Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
    }, [minuteStep]);
    const periods: ("AM" | "PM")[] = ["AM", "PM"];

    const updateCoords = React.useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const panelWidth = Math.max(r.width, 220);
      let left = r.left;
      if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
      if (left < 8) left = 8;
      setCoords({ top: r.bottom + 6, left, width: panelWidth });
    }, []);

    const toggle = () => {
      if (disabled) return;
      if (!open) updateCoords();
      setOpen((o) => !o);
    };

    React.useEffect(() => {
      if (!open) return;
      const onScroll = (e: Event) => {
        if (panelRef.current?.contains(e.target as Node)) return;
        setOpen(false);
      };
      const onResize = () => setOpen(false);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const emit = (v: string) => {
      onChange?.({
        target: { value: v, name },
        currentTarget: { value: v, name },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const commit = (h12: number, m: number, period: "AM" | "PM") => {
      emit(`${pad(to24h(h12, period))}:${pad(m)}`);
    };

    const pickHour = (h12: number) => {
      const m = current?.h12 != null ? parsed!.m : 0;
      const period = current?.period ?? "AM";
      commit(h12, m, period);
    };
    const pickMinute = (m: number) => {
      const h12 = current?.h12 ?? 12;
      const period = current?.period ?? "AM";
      commit(h12, m, period);
    };
    const pickPeriod = (period: "AM" | "PM") => {
      const h12 = current?.h12 ?? 12;
      const m = parsed?.m ?? 0;
      commit(h12, m, period);
    };

    const displayLabel = current
      ? `${pad(current.h12)}:${pad(parsed!.m)} ${current.period}`
      : placeholder || "--:-- --";

    const colBtn = (active: boolean) =>
      cn(
        "rounded-lg px-2 py-1.5 text-center text-sm transition-colors",
        active ? "bg-teal-600 text-white font-medium" : "text-slate-600 hover:bg-slate-100"
      );

    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-required={required}
          onClick={toggle}
          data-open={open}
          className={cn(
            "flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 text-left text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.05)] ring-offset-white/80 backdrop-blur-sm hover:border-teal-300/70 hover:bg-white focus-visible:border-teal-500 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/14 focus-visible:ring-offset-0 data-[open=true]:border-teal-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100",
            className
          )}
        >
          <span className={cn("truncate", current ? "text-slate-800" : "text-slate-400")}>{displayLabel}</span>
          <Clock className={cn("h-4 w-4 shrink-0 transition-colors", open ? "text-teal-600" : "text-slate-400")} />
        </button>

        {mounted &&
          open &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[200]" onMouseDown={() => setOpen(false)} />
              <div
                ref={panelRef}
                role="dialog"
                style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
                className="z-[201] rounded-[20px] border border-slate-200/80 bg-white p-2 shadow-[0_8px_32px_rgba(15,23,42,0.14),0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur-xl animate-in"
              >
                <div className="grid grid-cols-3 gap-2">
                  {/* Hours */}
                  <div className="flex flex-col">
                    <div className="px-1 pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Hour
                    </div>
                    <div className="scrollbar-hide flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
                      {hours.map((h) => (
                        <button key={h} type="button" onClick={() => pickHour(h)} className={colBtn(current?.h12 === h)}>
                          {pad(h)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Minutes */}
                  <div className="flex flex-col">
                    <div className="px-1 pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Min
                    </div>
                    <div className="scrollbar-hide flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
                      {minutes.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => pickMinute(m)}
                          className={colBtn(parsed?.m === m)}
                        >
                          {pad(m)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Period */}
                  <div className="flex flex-col">
                    <div className="px-1 pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      AM/PM
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {periods.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => pickPeriod(p)}
                          className={colBtn(current?.period === p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      emit("");
                      setOpen(false);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}
      </>
    );
  }
);
TimePicker.displayName = "TimePicker";

export { TimePicker };
