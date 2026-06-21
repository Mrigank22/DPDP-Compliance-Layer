"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Search, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { DOC_NAV, FLAT_DOCS } from "@/lib/docs/nav";

function activeSlugFromPath(pathname: string): string {
  if (pathname === "/docs") return "introduction";
  const m = pathname.match(/^\/docs\/([^/]+)/);
  return m ? m[1] : "";
}

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeSlugFromPath(pathname);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return FLAT_DOCS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="px-4 pb-3 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs…"
            className="w-full rounded-lg border border-border bg-surface-2/60 py-2 pl-9 pr-3 font-sans text-[13px] text-foreground placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-8">
        {results ? (
          <div className="space-y-1">
            <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              {results.length} result{results.length === 1 ? "" : "s"}
            </p>
            {results.map((item) => (
              <SidebarLink
                key={item.slug}
                slug={item.slug}
                title={item.title}
                active={active === item.slug}
                onNavigate={onNavigate}
                showResultDesc={item.description}
              />
            ))}
            {results.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-faint">No matching pages.</p>
            )}
          </div>
        ) : (
          DOC_NAV.map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.title}>
                <p className="flex items-center gap-2 px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                  <Icon className="h-3.5 w-3.5" />
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.slug}
                      slug={item.slug}
                      title={item.title}
                      active={active === item.slug}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </nav>
    </div>
  );
}

function SidebarLink({
  slug,
  title,
  active,
  onNavigate,
  showResultDesc,
}: {
  slug: string;
  title: string;
  active: boolean;
  onNavigate?: () => void;
  showResultDesc?: string;
}) {
  return (
    <Link
      href={`/docs/${slug}`}
      onClick={onNavigate}
      className={cn(
        "group relative block rounded-lg px-3 py-2 text-[13.5px] transition-colors",
        active
          ? "bg-accent/10 text-foreground"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="docs-active-bar"
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
          transition={{ type: "spring", stiffness: 500, damping: 38 }}
        />
      )}
      <span className={cn("flex items-center gap-2", active && "font-semibold")}>
        {showResultDesc ? (
          <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
        ) : null}
        <span className="truncate">{title}</span>
      </span>
      {showResultDesc ? (
        <span className="mt-0.5 block truncate pl-[22px] text-[11.5px] text-faint">
          {showResultDesc}
        </span>
      ) : null}
    </Link>
  );
}
