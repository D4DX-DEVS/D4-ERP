"use client";

import { useEffect, useRef, useState } from "react";
import { Item } from "@/types";
import { getDocuments, search as searchConstraint, where } from "@/lib/firestore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Package, Search, Loader2 } from "lucide-react";

interface ItemPickerProps {
  /** Called with the selected item so the caller can autofill a line item. */
  onSelect: (item: Item & { id: string }) => void;
  className?: string;
}

/**
 * Searchable picker over the Item Master. Lets users pull an existing
 * product/service into a quotation or invoice line, auto-filling its
 * description, rate and SAC/HSN code (FR-QT-002).
 */
export function ItemPicker({ onSelect, className }: ItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Item & { id: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the picker.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Debounced search against the Item Master while the panel is open.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const constraints = [where("isActive", "==", true)];
        if (query.trim()) {
          constraints.push(searchConstraint(["name", "itemCode", "sacCode", "hsnCode", "category"], query.trim()));
        }
        const data = await getDocuments<Item>("items", constraints);
        if (active) setResults(data.slice(0, 25));
      } catch (error) {
        console.error("Item search failed:", error);
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [open, query]);

  const handlePick = (item: Item & { id: string }) => {
    onSelect(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Package className="mr-1 h-3.5 w-3.5" /> Pick from Item Master
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              autoFocus
              placeholder="Search items..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-gray-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">No items found</div>
            ) : (
              <ul className="space-y-0.5">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(item)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{item.name}</span>
                        <span className="block truncate text-xs text-gray-400">
                          {item.itemCode}
                          {item.sacCode || item.hsnCode ? ` · ${item.sacCode || item.hsnCode}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-slate-700">{formatCurrency(item.rate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
