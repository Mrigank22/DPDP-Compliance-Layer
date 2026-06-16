import { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowUpRight as JumpIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/common/reveal";

type Tone = "default" | "accent" | "critical" | "high" | "medium" | "low";

const toneRing: Record<Tone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  critical: "text-critical",
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
};

const toneIcon: Record<Tone, string> = {
  default: "border-border bg-surface-2 text-muted",
  accent: "border-accent/30 bg-accent/10 text-accent",
  critical: "border-critical/30 bg-critical/10 text-critical",
  high: "border-high/30 bg-high/10 text-high",
  medium: "border-medium/30 bg-medium/10 text-medium",
  low: "border-low/30 bg-low/10 text-low",
};

/** Headline metric tile with animated counter. */
export function StatCard({
  label,
  value,
  icon,
  tone = "default",
  suffix,
  decimals = 0,
  hint,
  delta,
  reveal = true,
  href,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  tone?: Tone;
  suffix?: string;
  decimals?: number;
  hint?: string;
  delta?: number;
  reveal?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border",
              toneIcon[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span
          className={cn(
            "font-display text-3xl font-bold tabular-nums leading-none",
            toneRing[tone],
          )}
        >
          <CountUp value={value} decimals={decimals} suffix={suffix} />
        </span>
        {typeof delta === "number" && (
          <span
            className={cn(
              "mb-0.5 flex items-center gap-0.5 font-mono text-[11px]",
              delta >= 0 ? "text-accent" : "text-critical",
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
      {href && (
        <JumpIcon className="absolute bottom-3 right-3 h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </>
  );

  const className = cn(
    "group relative block overflow-hidden rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-bright",
    href && "cursor-pointer",
  );

  if (href) {
    return (
      <Link href={href} {...(reveal ? { "data-reveal": true } : {})} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <div {...(reveal ? { "data-reveal": true } : {})} className={className}>
      {inner}
    </div>
  );
}
