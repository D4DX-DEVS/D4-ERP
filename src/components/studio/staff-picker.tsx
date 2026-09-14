"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { crewKey } from "@/lib/studio-crew";
import type { BookingCrewMember, Staff } from "@/types";

export interface StaffPickerProps {
  /** Roster to search. Usually the active staff list. */
  staff: (Staff & { id: string })[];
  /** Selected members. Single mode holds at most one. */
  value: BookingCrewMember[];
  onChange: (next: BookingCrewMember[]) => void;
  /** Allow more than one selection. */
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

function staffName(s: Staff): string {
  return `${s.firstName || ""} ${s.lastName || ""}`.trim();
}

/**
 * Searchable people picker for booking crew. Names come from the staff roster,
 * but anyone typed in that does not match a staff member can be added as an
 * external (a freelancer or client-side shooter) — stored as a bare name with
 * no `staffId`.
 */
export function StaffPicker({
  staff,
  value,
  onChange,
  multiple = false,
  placeholder = "Search staff or type a name…",
  disabled = false,
  id,
}: StaffPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedKeys = useMemo(() => new Set(value.map(crewKey)), [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff
      .map((s) => ({ id: s.id, name: staffName(s), designation: s.designation || "" }))
      .filter((s) => s.name && !selectedKeys.has(`staff:${s.id}`))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.designation.toLowerCase().includes(q))
      .slice(0, 8);
  }, [staff, query, selectedKeys]);

  const trimmedQuery = query.trim();
  const canAddExternal =
    trimmedQuery.length > 0 &&
    !matches.some((m) => m.name.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !selectedKeys.has(`ext:${trimmedQuery.toLowerCase()}`);

  const add = (member: BookingCrewMember) => {
    onChange(multiple ? [...value, member] : [member]);
    setQuery("");
    if (!multiple) setOpen(false);
  };

  const remove = (member: BookingCrewMember) => {
    const key = crewKey(member);
    onChange(value.filter((m) => crewKey(m) !== key));
  };

  const atCapacity = !multiple && value.length >= 1;

  return (
    <div ref={containerRef} className="relative space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((member) => (
            <span
              key={crewKey(member)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                member.staffId
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {member.name}
              {!member.staffId && <span className="text-[10px] uppercase tracking-wide">external</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(member)}
                  className="text-current/70 hover:text-current cursor-pointer"
                  aria-label={`Remove ${member.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!atCapacity && !disabled && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id={id}
            value={query}
            placeholder={placeholder}
            className="pl-9"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (matches.length > 0) add({ staffId: matches[0].id, name: matches[0].name });
              else if (canAddExternal) add({ name: trimmedQuery });
            }}
          />
        </div>
      )}

      {open && !atCapacity && !disabled && (matches.length > 0 || canAddExternal) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-56 overflow-y-auto py-1">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => add({ staffId: m.id, name: m.name })}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 cursor-pointer"
                >
                  <span className="font-medium text-slate-800">{m.name}</span>
                  {m.designation && <span className="text-xs text-slate-400">{m.designation}</span>}
                </button>
              </li>
            ))}
            {canAddExternal && (
              <li className={cn(matches.length > 0 && "border-t border-slate-100")}>
                <button
                  type="button"
                  onClick={() => add({ name: trimmedQuery })}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add &ldquo;{trimmedQuery}&rdquo; as external
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
