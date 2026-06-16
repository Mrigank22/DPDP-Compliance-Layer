"use client";

import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Reusable destructive-action confirmation modal. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  loading = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                destructive
                  ? "border-critical/30 bg-critical/10 text-critical"
                  : "border-accent/30 bg-accent/10 text-accent"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </DialogHeader>
        {description && (
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        )}
        <DialogFooter className="mt-2 gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
