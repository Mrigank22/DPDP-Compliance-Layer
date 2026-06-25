import { cn } from "@/lib/cn";

const TONE: Record<string, string> = {
  open: "text-high border-high/30 bg-high/10",
  assessing: "text-accent-2 border-accent-2/30 bg-accent-2/10",
  contained: "text-medium border-medium/30 bg-medium/10",
  notified: "text-accent border-accent/30 bg-accent/10",
  closed: "text-success border-success/30 bg-success/10",
};

/** Coloured status chip for breach incidents. */
export function BreachStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        TONE[status] ?? "text-muted border-border bg-surface-3",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
