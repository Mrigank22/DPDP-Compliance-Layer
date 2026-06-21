"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldAlert,
  LayoutDashboard,
  Building2,
  UserCog,
  ScrollText,
  LogOut,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminStore } from "@/lib/store/admin.store";

interface AdminNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV: AdminNavItem[] = [
  { name: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { name: "Tenants", href: "/admin/tenants", icon: Building2 },
  { name: "Platform Admins", href: "/admin/admins", icon: UserCog },
  { name: "Audit Trail", href: "/admin/audit", icon: ScrollText },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, isAuthenticated, hydrated, loadFromStorage, logout } = useAdminStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/admin/login");
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-[0.18]" />

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-border bg-bg-2/80 backdrop-blur lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/40 bg-accent/10">
            <ShieldAlert className="h-5 w-5 text-accent" />
          </div>
          <div className="leading-tight">
            <h1 className="font-display text-base font-bold tracking-tight text-foreground">
              Data<span className="text-accent">Sentinel</span>
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Platform Console
            </p>
          </div>
        </div>

        <div className="mx-5 hairline h-px" />

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            Control
          </p>
          {NAV.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-accent/10 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-all",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                />
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active ? "text-accent" : "text-faint group-hover:text-muted",
                  )}
                />
                <span className={cn("font-medium tracking-tight", active && "font-semibold")}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 font-display text-sm font-bold text-accent">
              {(admin?.full_name || admin?.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {admin?.full_name || admin?.email}
              </p>
              <p className="truncate font-mono text-[11px] uppercase tracking-wide text-accent">
                Super-admin
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/admin/login");
              }}
              className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-3 hover:text-danger"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-accent" />
          <span className="font-display text-sm font-bold">Platform Console</span>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/admin/login");
          }}
          className="rounded-md p-1.5 text-faint hover:text-danger"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="relative lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
