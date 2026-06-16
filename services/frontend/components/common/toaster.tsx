"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore, ToastTone } from "@/lib/store/toast.store";

const toneMeta: Record<
  ToastTone,
  { icon: typeof Info; ring: string; bar: string }
> = {
  success: {
    icon: CheckCircle2,
    ring: "border-accent/40",
    bar: "bg-accent",
  },
  error: { icon: XCircle, ring: "border-critical/40", bar: "bg-critical" },
  info: { icon: Info, ring: "border-accent-2/40", bar: "bg-accent-2" },
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const meta = toneMeta[t.tone];
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border ${meta.ring} bg-surface/95 p-3.5 pr-9 shadow-xl backdrop-blur`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} />
              <Icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  t.tone === "success"
                    ? "text-accent"
                    : t.tone === "error"
                      ? "text-critical"
                      : "text-accent-2"
                }`}
              />
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-foreground">
                  {t.title}
                </p>
                {t.description && (
                  <p className="mt-0.5 break-words text-xs text-muted">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="absolute right-2 top-2 rounded p-1 text-faint transition-colors hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
