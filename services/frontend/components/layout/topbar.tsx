"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Menu, Bell, LogOut, Settings, ChevronDown, Activity, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { alertsAPI } from "@/lib/api/alerts";
import { useAuthStore } from "@/lib/store/auth.store";
import { useUIStore } from "@/lib/store/ui.store";
import { pageTitleFor } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { setMobileMenuOpen, setCommandOpen } = useUIStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ["alerts", "unread"],
    queryFn: () => alertsAPI.unread().then((r) => r.data),
    refetchInterval: 60_000,
  });
  const unreadCount = unread?.count ?? 0;

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      /* best-effort */
    } finally {
      logout();
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              DataSentinel / DPDP
            </div>
            <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
              {pageTitleFor(pathname)}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Command palette trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-sm text-faint transition-colors hover:border-border-bright hover:text-muted md:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>

          {/* Live status */}
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
              <Activity className="mr-1 inline h-3 w-3 text-accent" />
              Enforcing
            </span>
          </div>

          {/* Alerts */}
          <Link href="/dashboard/alerts">
            <Button variant="ghost" size="icon" className="relative" aria-label="Alerts">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 font-mono text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </Link>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-border-bright"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 font-display text-xs font-bold text-accent">
                {(user?.full_name || user?.email || "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-[140px] truncate text-sm text-foreground sm:block">
                {user?.full_name || user?.email}
              </span>
              <ChevronDown className="h-4 w-4 text-faint" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
                  >
                    <div className="border-b border-border px-4 py-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user?.full_name || "Operator"}
                      </p>
                      <p className="truncate font-mono text-xs text-faint">
                        {user?.email}
                      </p>
                    </div>
                    <Link
                      href="/dashboard/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-critical transition-colors hover:bg-critical/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
