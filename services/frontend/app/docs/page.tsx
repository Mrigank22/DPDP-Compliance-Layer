import Link from "next/link";
import { ArrowRight, Rocket, Database, BookOpen } from "lucide-react";
import { DOC_NAV } from "@/lib/docs/nav";
import { PageTransition, FadeIn } from "@/components/docs/page-transition";

export default function DocsHome() {
  return (
    <PageTransition>
      {/* Hero */}
      <div className="mb-12">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
          DataSentinel Documentation
        </p>
        <h1 className="max-w-2xl font-display text-[40px] font-bold leading-[1.08] tracking-tight text-foreground">
          Everything you need to govern{" "}
          <span className="text-accent">personal data</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted">
          Guides, how-tos and reference for discovering personal data, enforcing
          policy on live traffic, and meeting your DPDP obligations — with
          step-by-step instructions for every feature.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/docs/quickstart"
            className="group inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 font-display text-[14px] font-semibold text-foreground transition-colors hover:bg-accent/15"
          >
            <Rocket className="h-4 w-4 text-accent" />
            Start the Quickstart
            <ArrowRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/connect-assets"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-4 py-2.5 font-display text-[14px] font-medium text-foreground transition-colors hover:border-border-bright"
          >
            <Database className="h-4 w-4 text-muted" />
            Connect an asset
          </Link>
          <Link
            href="/docs/api-keys"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/50 px-4 py-2.5 font-display text-[14px] font-medium text-foreground transition-colors hover:border-border-bright"
          >
            <BookOpen className="h-4 w-4 text-muted" />
            Use the API
          </Link>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-10">
        {DOC_NAV.map((group, gi) => {
          const Icon = group.icon;
          return (
            <FadeIn key={group.title} delay={gi * 0.04}>
              <section>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2/60">
                    <Icon className="h-4 w-4 text-accent" />
                  </span>
                  <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                    {group.title}
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/docs/${item.slug}`}
                      className="group flex flex-col rounded-xl border border-border bg-surface/30 p-4 transition-all hover:border-accent/40 hover:bg-accent/5"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-display text-[15px] font-semibold text-foreground group-hover:text-accent">
                          {item.title}
                        </span>
                        <ArrowRight className="h-4 w-4 text-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                      </span>
                      <span className="mt-1 text-[13px] leading-relaxed text-muted">
                        {item.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            </FadeIn>
          );
        })}
      </div>
    </PageTransition>
  );
}
