"use client";

import Link from "next/link";
import { Check, Circle, Rocket, ArrowRight } from "lucide-react";
import type { DashboardSummary } from "@/types/api";

interface Step {
  label: string;
  done: boolean;
  href: string;
  cta: string;
}

/**
 * First-run setup guide. Renders only while the workspace is not yet
 * operational, nudging new SaaS users to first value quickly.
 */
export function OnboardingChecklist({ summary }: { summary?: Partial<DashboardSummary> }) {
  const steps: Step[] = [
    {
      label: "Connect your first data source",
      done: (summary?.total_assets ?? 0) > 0,
      href: "/dashboard/assets?action=new",
      cta: "Connect asset",
    },
    {
      label: "Activate a DPDP policy",
      done: (summary?.active_policies ?? 0) > 0,
      href: "/dashboard/policies?action=new",
      cta: "Create policy",
    },
    {
      label: "Run your first PII scan",
      done: !!summary?.last_scan_at,
      href: "/dashboard/assets",
      cta: "Run a scan",
    },
    {
      label: "Invite your compliance team",
      done: false,
      href: "/dashboard/settings",
      cta: "Invite team",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const coreReady =
    (summary?.total_assets ?? 0) > 0 &&
    (summary?.active_policies ?? 0) > 0 &&
    !!summary?.last_scan_at;

  // Once the workspace is operational, retire the guide.
  if (coreReady) return null;

  const next = steps.find((s) => !s.done);
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="relative overflow-hidden rounded-xl border border-accent/25 bg-surface p-5 panel-glow">
      <div className="scanlines pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Activate your console</h2>
            <p className="text-sm text-muted">
              {completed} of {steps.length} steps complete — finish setup to start enforcing DPDP.
            </p>
          </div>
        </div>
        {next && (
          <Link
            href={next.href}
            className="inline-flex items-center gap-2 self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent-dim"
          >
            {next.cta} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 transition-colors hover:border-border-bright"
          >
            {s.done ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
                <Check className="h-3 w-3" />
              </span>
            ) : (
              <Circle className="h-5 w-5 text-faint" />
            )}
            <span className={s.done ? "text-sm text-muted line-through" : "text-sm text-foreground"}>
              {s.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
