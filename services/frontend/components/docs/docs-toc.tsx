"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * "On this page" navigation. Reads the rendered headings (any element with a
 * `data-doc-heading` attribute and an id) from the article, so content authors
 * never maintain a separate TOC. Highlights the section currently in view.
 */
export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    let raf = 0;
    let observer: IntersectionObserver | null = null;

    // Defer to the next frame so DOM updates from the route change are painted
    // before we read headings — and so we never call setState synchronously
    // inside the effect body.
    raf = requestAnimationFrame(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("[data-doc-heading]"),
      ).filter((n) => n.id);

      setHeadings(
        nodes.map((n) => ({
          id: n.id,
          text: n.textContent?.replace(/#$/, "").trim() ?? "",
          level: Number(n.dataset.docHeading ?? "2"),
        })),
      );

      if (nodes.length === 0) {
        setActiveId("");
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) setActiveId(visible[0].target.id);
        },
        { rootMargin: "-90px 0px -70% 0px", threshold: 0 },
      );

      nodes.forEach((n) => observer!.observe(n));
    });

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [pathname]);

  if (headings.length === 0) return null;

  return (
    <div className="sticky top-24">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
        On this page
      </p>
      <ul className="space-y-1.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: h.level === 3 ? 14 : 0 }}>
            <a
              href={`#${h.id}`}
              className={cn(
                "-ml-px block border-l-2 py-0.5 pl-3 text-[12.5px] transition-colors",
                activeId === h.id
                  ? "border-accent text-accent"
                  : "border-transparent text-faint hover:text-muted",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
