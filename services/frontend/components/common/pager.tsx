"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Pagination } from "@/lib/api-client";

/** Pagination controls driven by the backend meta.pagination block. */
export function Pager({
  pagination,
  onPageChange,
}: {
  pagination?: Pagination;
  onPageChange: (page: number) => void;
}) {
  if (!pagination || pagination.total_pages <= 1) return null;
  const { page, total_pages, total_items, has_next, has_prev } = pagination;

  return (
    <div className="flex items-center justify-between border-t border-border px-1 pt-3">
      <p className="font-mono text-xs text-muted">
        Page <span className="text-foreground">{page}</span> / {total_pages}
        <span className="mx-2 text-faint">·</span>
        {total_items.toLocaleString("en-IN")} records
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!has_prev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!has_next}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
