"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  pageSize: number;
  /** When provided, a rows-per-page select is shown. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  if (totalCount === 0) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="text-xs text-gray-500">
        Showing {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-4">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Rows</span>
            <Select
              className="h-8 w-[76px] rounded-lg px-2.5 py-1 text-xs shadow-none"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        )}
        {/* ponytail: single page still shows the count — only the controls drop out */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
