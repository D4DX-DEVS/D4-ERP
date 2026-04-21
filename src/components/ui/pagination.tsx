"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  pageSize: number;
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
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
      <p className="text-xs text-gray-500">
        Showing {from}–{to} of {totalCount}
      </p>
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
    </div>
  );
}
