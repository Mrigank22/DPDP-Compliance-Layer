/* The doc content components come from a static registry map, so they are stable
 * references — not components created during render. */
/* eslint-disable react-hooks/static-components */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  FLAT_DOCS,
  getDocItem,
  getGroupForSlug,
  getAdjacentDocs,
} from "@/lib/docs/nav";
import { getDocComponent } from "@/lib/docs/registry";
import { PageTransition } from "@/components/docs/page-transition";

export function generateStaticParams() {
  return FLAT_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = getDocItem(slug);
  if (!item) return { title: "Not found" };
  return { title: item.title, description: item.description };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = getDocItem(slug);
  const Content = getDocComponent(slug);
  if (!item || !Content) notFound();

  const group = getGroupForSlug(slug);
  const { prev, next } = getAdjacentDocs(slug);

  return (
    <PageTransition>
      {/* Header */}
      <div className="mb-8">
        {group ? (
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
            {group.title}
          </p>
        ) : null}
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight text-foreground">
          {item.title}
        </h1>
      </div>

      <Content />

      {/* Prev / next */}
      <nav className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/docs/${prev.slug}`}
            className="group rounded-xl border border-border bg-surface/30 p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </span>
            <span className="mt-1 block font-display text-[15px] font-semibold text-foreground group-hover:text-accent">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="group rounded-xl border border-border bg-surface/30 p-4 text-right transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
              Next <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="mt-1 block font-display text-[15px] font-semibold text-foreground group-hover:text-accent">
              {next.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageTransition>
  );
}
