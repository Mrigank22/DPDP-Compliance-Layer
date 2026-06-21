import type { ReactNode } from "react";
import Link from "next/link";
import {
  Info,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CodeBlock } from "./code-block";
import { FadeIn } from "./page-transition";

export { CodeBlock, FadeIn };

/** Internal documentation link — client-side navigation that preserves the
 * page-transition animation. Use instead of a raw <a> for in-content links. */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href}>{children}</Link>;
}

/* ── Headings (anchor-linked, drive the on-this-page TOC) ─────────────────── */

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      data-doc-heading="2"
      className="group mt-12 mb-3 scroll-mt-28 font-display text-[22px] font-bold tracking-tight text-foreground"
    >
      <a href={`#${id}`} className="inline-flex items-center gap-2">
        {children}
        <Hash className="doc-anchor h-4 w-4 text-accent" />
      </a>
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      data-doc-heading="3"
      className="group mt-8 mb-2 scroll-mt-28 font-display text-[16px] font-semibold tracking-tight text-foreground"
    >
      <a href={`#${id}`} className="inline-flex items-center gap-2">
        {children}
        <Hash className="doc-anchor h-3.5 w-3.5 text-accent" />
      </a>
    </h3>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 text-[17px] leading-relaxed text-muted">{children}</p>
  );
}

/* ── Callouts ─────────────────────────────────────────────────────────────── */

type CalloutVariant = "note" | "tip" | "warn" | "danger";

const CALLOUT_META: Record<
  CalloutVariant,
  { icon: typeof Info; tone: string; ring: string; label: string }
> = {
  note: { icon: Info, tone: "text-low", ring: "border-low/30 bg-low/5", label: "Note" },
  tip: { icon: Sparkles, tone: "text-accent", ring: "border-accent/30 bg-accent/5", label: "Tip" },
  warn: { icon: AlertTriangle, tone: "text-warning", ring: "border-warning/30 bg-warning/5", label: "Important" },
  danger: { icon: ShieldAlert, tone: "text-danger", ring: "border-danger/30 bg-danger/5", label: "Caution" },
};

export function Callout({
  variant = "note",
  title,
  children,
}: {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}) {
  const meta = CALLOUT_META[variant];
  const Icon = meta.icon;
  return (
    <FadeIn>
      <div className={cn("my-5 rounded-xl border p-4", meta.ring)}>
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", meta.tone)} />
          <div className="min-w-0">
            <p className={cn("mb-1 font-display text-[13px] font-semibold uppercase tracking-wide", meta.tone)}>
              {title ?? meta.label}
            </p>
            <div className="text-[14px] leading-relaxed text-foreground/80 [&_p]:m-0 [&_p+p]:mt-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}

/* ── Step-by-step ─────────────────────────────────────────────────────────── */

export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="my-6 space-y-5 border-l border-border pl-7">{children}</ol>
  );
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-bg text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
      </span>
      <h4 className="mb-1 font-display text-[15px] font-semibold text-foreground">
        {title}
      </h4>
      <div className="text-[14.5px] leading-relaxed text-foreground/80 [&_p]:my-1.5">
        {children}
      </div>
    </li>
  );
}

/* ── Cards & feature grids ────────────────────────────────────────────────── */

export function Cards({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "my-5 grid gap-3",
        cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  icon: Icon,
  children,
  href,
}: {
  title: string;
  icon?: typeof Info;
  children: ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-xl border border-border bg-surface/40 p-4 transition-colors hover:border-border-bright hover:bg-surface-2/50">
      <div className="mb-1.5 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-accent" /> : null}
        <p className="font-display text-[14px] font-semibold text-foreground">{title}</p>
      </div>
      <div className="text-[13.5px] leading-relaxed text-muted">{children}</div>
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block no-underline [border-bottom:none]">
        {inner}
      </a>
    );
  }
  return inner;
}

/* ── Tables ───────────────────────────────────────────────────────────────── */

export function Table({
  head,
  rows,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
}) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="bg-surface-2">
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-border px-4 py-2.5 font-display text-[12px] font-semibold uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-surface/30">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b border-border/60 px-4 py-2.5 align-top text-foreground/80 [&_code]:whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Misc inline helpers ──────────────────────────────────────────────────── */

const PILL_TONES: Record<string, string> = {
  accent: "border-accent/40 text-accent",
  cyan: "border-accent-2/40 text-accent-2",
  critical: "border-critical/40 text-critical",
  high: "border-high/40 text-high",
  medium: "border-medium/40 text-medium",
  low: "border-low/40 text-low",
  muted: "border-border-bright text-faint",
};

export function Pill({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TONES;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide",
        PILL_TONES[tone] ?? PILL_TONES.accent,
      )}
    >
      {children}
    </span>
  );
}

/** Documents a single configuration field. */
export function Field({
  name,
  type,
  required,
  children,
}: {
  name: string;
  type?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-[13px] text-accent">{name}</code>
        {type ? <span className="font-mono text-[11px] text-faint">{type}</span> : null}
        {required ? <Pill tone="high">required</Pill> : <Pill tone="muted">optional</Pill>}
      </div>
      <div className="mt-1 text-[13.5px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export function FieldList({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-border bg-surface/30 px-4">
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="my-8 hairline h-px" />;
}
