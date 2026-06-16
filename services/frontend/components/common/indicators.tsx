import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { severityVariant, getRiskScoreColor } from "@/lib/utils/helpers";
import { PII_LABELS } from "@/lib/utils/labels";

/** Severity chip backed by the shared Badge variants. */
export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant={severityVariant(severity)}>{severity}</Badge>;
}

/** Status pill with a leading state dot. */
export function StatusPill({
  status,
  pulse,
}: {
  status: string;
  pulse?: boolean;
}) {
  const tone: Record<string, string> = {
    connected: "text-success border-success/30 bg-success/10",
    active: "text-success border-success/30 bg-success/10",
    completed: "text-success border-success/30 bg-success/10",
    ready: "text-success border-success/30 bg-success/10",
    scanning: "text-accent-2 border-accent-2/30 bg-accent-2/10",
    running: "text-accent-2 border-accent-2/30 bg-accent-2/10",
    generating: "text-accent-2 border-accent-2/30 bg-accent-2/10",
    in_progress: "text-accent-2 border-accent-2/30 bg-accent-2/10",
    queued: "text-medium border-medium/30 bg-medium/10",
    received: "text-medium border-medium/30 bg-medium/10",
    draft: "text-violet border-violet/30 bg-violet/10",
    error: "text-critical border-critical/30 bg-critical/10",
    failed: "text-critical border-critical/30 bg-critical/10",
    rejected: "text-critical border-critical/30 bg-critical/10",
    disconnected: "text-faint border-border bg-surface-3",
    inactive: "text-faint border-border bg-surface-3",
    cancelled: "text-faint border-border bg-surface-3",
  };
  const isLive = pulse ?? ["scanning", "running", "generating", "in_progress"].includes(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        tone[status] ?? "text-muted border-border bg-surface-3",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          isLive && "animate-pulse",
        )}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** Numeric risk score with color interpolation. */
export function RiskScore({
  score,
  size = "sm",
}: {
  score: number;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        getRiskScoreColor(score),
        size === "lg" ? "text-2xl" : "text-sm",
      )}
    >
      {score}
      <span className="text-faint">/100</span>
    </span>
  );
}

/** Row of compact PII type tags. */
export function PiiTags({ types, max = 4 }: { types: string[]; max?: number }) {
  if (!types || types.length === 0)
    return <span className="text-xs text-faint">—</span>;
  const shown = types.slice(0, max);
  const rest = types.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="rounded border border-accent/25 bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
        >
          {PII_LABELS[t] ?? t}
        </span>
      ))}
      {rest > 0 && (
        <span className="font-mono text-[10px] text-faint">+{rest}</span>
      )}
    </div>
  );
}
