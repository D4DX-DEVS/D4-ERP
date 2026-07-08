"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

type Mode = "date" | "month";

export interface DatePickerProps {
  value?: string;
  /** Emits a synthetic change event so existing `(e) => e.target.value` handlers keep working. */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mode?: Mode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  /** yyyy-mm-dd (date mode) or yyyy-mm (month mode) */
  min?: string;
  max?: string;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateValue(v?: string): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function parseMonthValue(v?: string): Date | null {
  if (!v) return null;
  const [y, m] = v.split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 1);
}

function formatDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatMonthValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  ({ value, onChange, mode = "date", className, placeholder, disabled, required, id, name, min, max }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);
    React.useEffect(() => setMounted(true), []);

    const selected = mode === "month" ? parseMonthValue(value) : parseDateValue(value);
    const minDate = mode === "month" ? parseMonthValue(min) : parseDateValue(min);
    const maxDate = mode === "month" ? parseMonthValue(max) : parseDateValue(max);

    // The month/year currently shown in the panel.
    const [view, setView] = React.useState<Date>(selected ?? new Date());
    const [yearPicker, setYearPicker] = React.useState(false);

    React.useEffect(() => {
      if (open) {
        setView(selected ?? new Date());
        setYearPicker(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const updateCoords = React.useCallback((panelHeight: number) => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const panelWidth = Math.max(r.width, 288);
      let left = r.left;
      if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
      if (left < 8) left = 8;

      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUpward = spaceBelow < panelHeight + 6 && spaceAbove > spaceBelow;
      const top = openUpward ? Math.max(8, r.top - panelHeight - 6) : r.bottom + 6;

      setCoords({ top, left, width: panelWidth });
    }, []);

    const toggle = () => {
      if (disabled) return;
      if (!open) updateCoords(panelRef.current?.offsetHeight ?? 360);
      setOpen((o) => !o);
    };

    // Re-measure against the panel's real height once it has rendered, so
    // placement (below vs. above) accounts for its actual content — no
    // hardcoded panel-height guess left in place once the DOM is available.
    React.useLayoutEffect(() => {
      if (!open || !panelRef.current) return;
      updateCoords(panelRef.current.offsetHeight);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, yearPicker, mode, view]);

    React.useEffect(() => {
      if (!open) return;
      const onScroll = () => setOpen(false);
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

    const pickDate = (d: Date) => {
      emit(formatDateValue(d));
      setOpen(false);
    };

    const pickMonth = (monthIndex: number) => {
      const d = new Date(view.getFullYear(), monthIndex, 1);
      emit(formatMonthValue(d));
      setOpen(false);
    };

    const clear = () => {
      emit("");
      setOpen(false);
    };

    const isDisabledDate = (d: Date) => {
      if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
      if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
      return false;
    };

    const displayLabel = (() => {
      if (!selected) return placeholder || (mode === "month" ? "Select month" : "dd-mm-yyyy");
      if (mode === "month") return `${MONTH_SHORT[selected.getMonth()]} ${selected.getFullYear()}`;
      return `${pad(selected.getDate())} ${MONTH_SHORT[selected.getMonth()]} ${selected.getFullYear()}`;
    })();

    // Build the 6x7 day grid for date mode.
    const buildDays = () => {
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const start = new Date(first);
      start.setDate(first.getDate() - first.getDay());
      const days: Date[] = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
      return days;
    };

    const today = new Date();
    const yearGridStart = view.getFullYear() - 6;

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
          <span className={cn("truncate", selected ? "text-slate-800" : "text-slate-400")}>{displayLabel}</span>
          <CalendarIcon className={cn("h-4 w-4 shrink-0 transition-colors", open ? "text-teal-600" : "text-slate-400")} />
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
                className="z-[201] rounded-[20px] border border-slate-200/80 bg-white p-3 shadow-[0_8px_32px_rgba(15,23,42,0.14),0_2px_8px_rgba(15,23,42,0.06)] backdrop-blur-xl animate-in"
              >
                {/* Header */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setYearPicker((y) => !y)}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    {mode === "month" || yearPicker
                      ? view.getFullYear()
                      : `${MONTH_SHORT[view.getMonth()]} ${view.getFullYear()}`}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setView((v) =>
                          mode === "month" || yearPicker
                            ? new Date(v.getFullYear() - (yearPicker ? 12 : 1), v.getMonth(), 1)
                            : new Date(v.getFullYear(), v.getMonth() - 1, 1)
                        )
                      }
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setView((v) =>
                          mode === "month" || yearPicker
                            ? new Date(v.getFullYear() + (yearPicker ? 12 : 1), v.getMonth(), 1)
                            : new Date(v.getFullYear(), v.getMonth() + 1, 1)
                        )
                      }
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                      aria-label="Next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Year picker grid */}
                {yearPicker && mode === "date" ? (
                  <div className="grid grid-cols-4 gap-1">
                    {Array.from({ length: 12 }, (_, i) => yearGridStart + i).map((yr) => {
                      const isSel = selected?.getFullYear() === yr;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            setView((v) => new Date(yr, v.getMonth(), 1));
                            setYearPicker(false);
                          }}
                          className={cn(
                            "rounded-lg py-2 text-sm transition-colors",
                            isSel ? "bg-teal-600 text-white font-medium" : "text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          {yr}
                        </button>
                      );
                    })}
                  </div>
                ) : mode === "month" ? (
                  /* Month grid */
                  <div className="grid grid-cols-3 gap-1">
                    {MONTH_SHORT.map((m, i) => {
                      const isSel = selected?.getFullYear() === view.getFullYear() && selected?.getMonth() === i;
                      const cellDate = new Date(view.getFullYear(), i, 1);
                      const disabledCell =
                        (minDate && cellDate < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) ||
                        (maxDate && cellDate > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1));
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!!disabledCell}
                          onClick={() => pickMonth(i)}
                          className={cn(
                            "rounded-lg py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:text-slate-300",
                            isSel ? "bg-teal-600 text-white font-medium" : "text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Day grid */
                  <>
                    <div className="mb-1 grid grid-cols-7">
                      {DAY_LABELS.map((d) => (
                        <div key={d} className="py-1 text-center text-xs font-medium text-slate-400">
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {buildDays().map((d, idx) => {
                        const inMonth = d.getMonth() === view.getMonth();
                        const isSel = selected && sameDay(d, selected);
                        const isToday = sameDay(d, today);
                        const disabledCell = isDisabledDate(d);
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={disabledCell}
                            onClick={() => pickDate(d)}
                            className={cn(
                              "flex h-9 items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:text-slate-300",
                              isSel
                                ? "bg-teal-600 text-white font-semibold hover:bg-teal-600"
                                : inMonth
                                  ? "text-slate-700 hover:bg-slate-100"
                                  : "text-slate-300 hover:bg-slate-50",
                              !isSel && isToday && "ring-1 ring-inset ring-teal-400 text-teal-700"
                            )}
                          >
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Footer */}
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={clear}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      if (mode === "month") {
                        emit(formatMonthValue(now));
                      } else {
                        emit(formatDateValue(now));
                      }
                      setOpen(false);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-600 hover:bg-teal-50"
                  >
                    Today
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
DatePicker.displayName = "DatePicker";

export { DatePicker };
