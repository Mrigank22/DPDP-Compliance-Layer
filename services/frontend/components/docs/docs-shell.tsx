"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Radar, Menu, X, SquareArrowOutUpRight } from "lucide-react";
import { DocsSidebar } from "./docs-sidebar";
import { DocsToc } from "./docs-toc";

export function DocsShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-bg">
      {/* Atmosphere */}
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-[0.25]" />
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/docs" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <Radar className="h-4 w-4 text-accent" />
              </span>
              <span className="font-display text-[15px] font-bold tracking-tight text-foreground">
                Data<span className="text-accent">Sentinel</span>
              </span>
              <span className="rounded border border-border-bright px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                Docs
              </span>
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-1.5 font-display text-[13px] font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            Open Console
            <SquareArrowOutUpRight className="h-3.5 w-3.5 text-accent" />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1500px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[280px] shrink-0 overflow-y-auto border-r border-border py-5 lg:block">
          <DocsSidebar />
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto flex w-full max-w-[1080px] gap-10 px-5 py-10 sm:px-8">
            <article className="doc-prose min-w-0 flex-1">{children}</article>
            <aside className="hidden w-[200px] shrink-0 xl:block">
              <DocsToc />
            </aside>
          </div>
        </main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[290px] overflow-y-auto border-r border-border bg-surface py-4 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <div className="mb-2 flex items-center justify-between px-4">
                <span className="font-display text-sm font-bold text-foreground">
                  Documentation
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <DocsSidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
