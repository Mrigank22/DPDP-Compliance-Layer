"use client";

import { ReactNode } from "react";
import { ShieldCheck, ScanLine, Network, Radar } from "lucide-react";

const FEATURES = [
  {
    icon: ScanLine,
    title: "Discover Indian PII at scale",
    body: "Aadhaar, PAN, UPI, GSTIN & more — found across S3, RDS, GCS and live traffic.",
  },
  {
    icon: Network,
    title: "Enforce sovereignty inline",
    body: "Mask, tokenize or block personal data before it reaches LLMs and external APIs.",
  },
  {
    icon: ShieldCheck,
    title: "Automate DPDP compliance",
    body: "Consent, rights requests and audit-ready evidence — handled on autopilot.",
  },
];

export function AuthShell({
  children,
  badge,
}: {
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* atmospheric backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-bg">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute inset-0 bg-radial-glow" />
        <div className="absolute -left-40 top-1/3 h-[460px] w-[460px] rounded-full bg-accent/10 blur-[150px]" />
      </div>

      {/* ── Intel panel ─────────────────────────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <div className="scanlines absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
            <Radar className="h-6 w-6 text-accent" />
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-tight">
              Data<span className="text-accent">Sentinel</span>
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
              Sovereignty Console
            </p>
          </div>
        </div>

        {/* radar mark */}
        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="relative h-64 w-64">
            {[1, 0.66, 0.33].map((s) => (
              <div
                key={s}
                className="absolute rounded-full border border-accent/15"
                style={{
                  inset: `${(1 - s) * 50}%`,
                }}
              />
            ))}
            <div className="absolute inset-0 rounded-full border border-accent/25" />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, color-mix(in srgb, var(--color-accent) 35%, transparent), transparent 28%)",
                animation: "spin 4s linear infinite",
                maskImage: "radial-gradient(circle, black 60%, transparent 62%)",
                WebkitMaskImage:
                  "radial-gradient(circle, black 60%, transparent 62%)",
              }}
            />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_2px_var(--color-accent)]" />
            {/* blips */}
            <span className="absolute left-[30%] top-[38%] h-1.5 w-1.5 animate-pulse rounded-full bg-critical" />
            <span className="absolute left-[64%] top-[58%] h-1.5 w-1.5 animate-pulse rounded-full bg-medium" />
            <span className="absolute left-[52%] top-[26%] h-1.5 w-1.5 animate-pulse rounded-full bg-accent-2" />
          </div>
        </div>

        <div className="relative space-y-5">
          <h2 className="max-w-md font-display text-2xl font-bold leading-tight">
            Keep India&apos;s personal data{" "}
            <span className="text-accent text-glow">inside India.</span>
          </h2>
          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-accent">
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{f.title}</p>
                  <p className="text-xs text-muted">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {["DPDP Act 2023", "RBI Localization", "IRDAI", "ISO 27001"].map((b) => (
              <span
                key={b}
                className="rounded-md border border-border bg-surface-2/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          {badge && (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/8 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {badge}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
