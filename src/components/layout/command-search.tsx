"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { hasFeature } from "@/lib/permissions";
import { navigationModules } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import type { FeatureKey } from "@/lib/permissions";

type SearchResult = {
  label: string;
  href: string;
  section: string;
};

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuthStore();

  const isVisible = useCallback(
    (roles: string[], feature?: string) => {
      if (!user?.role) return false;
      if (roles.includes(user.role)) return true;
      if (feature && hasFeature(user, feature as FeatureKey)) return true;
      return false;
    },
    [user]
  );

  const allItems = useMemo(() => {
    const results: SearchResult[] = [];
    for (const mod of navigationModules) {
      if (!isVisible(mod.roles, mod.feature)) continue;
      if (mod.href) {
        results.push({ label: mod.label, href: mod.href, section: mod.label });
      }
      if (mod.items) {
        for (const item of mod.items) {
          if (!isVisible(item.roles, item.feature)) continue;
          results.push({ label: item.label, href: item.href, section: mod.label });
        }
      }
      if (mod.subGroups) {
        for (const sg of mod.subGroups) {
          for (const item of sg.items) {
            if (!isVisible(item.roles, item.feature)) continue;
            results.push({ label: item.label, href: item.href, section: `${mod.label} › ${sg.label}` });
          }
        }
      }
    }
    return results;
  }, [isVisible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      navigate(filtered[selectedIndex].href);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
      <div className="relative z-[61] w-full max-w-lg rounded-[24px] border border-slate-200/90 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] animate-slide-up">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[340px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">No results found.</p>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.href}
                type="button"
                onClick={() => navigate(item.href)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  idx === selectedIndex ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[11px] text-slate-400">{item.section}</p>
                </div>
                {idx === selectedIndex && (
                  <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                    ↵
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
