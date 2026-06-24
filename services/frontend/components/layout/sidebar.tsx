"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  ShieldCheck,
  Bug,
  Waypoints,
  Share2,
  FileBarChart,
  UserCheck,
  BellRing,
  Settings,
  Radar,
  FileCheck2,
  ScrollText,
  BookText,
  Brain,
  Boxes,
  ScanSearch,
  Coins,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/lib/store/ui.store";
import { useAuthStore } from "@/lib/store/auth.store";
import { hasRole, roleOf, type Role } from "@/lib/auth/permissions";

export const NAV_ITEMS = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard, min: "viewer" as Role },
  { name: "Assets", href: "/dashboard/assets", icon: Database, min: "viewer" as Role },
  { name: "Policies", href: "/dashboard/policies", icon: ShieldCheck, min: "viewer" as Role },
  { name: "Findings", href: "/dashboard/findings", icon: Bug, min: "viewer" as Role },
  { name: "Gateway", href: "/dashboard/gateway", icon: Waypoints, min: "viewer" as Role },
  { name: "Lineage", href: "/dashboard/lineage", icon: Share2, min: "viewer" as Role },
  { name: "Reports", href: "/dashboard/reports", icon: FileBarChart, min: "viewer" as Role },
  { name: "Rights / DSR", href: "/dashboard/rights", icon: UserCheck, min: "analyst" as Role },
  { name: "Consent", href: "/dashboard/consent", icon: FileCheck2, min: "analyst" as Role },
  { name: "Alerts", href: "/dashboard/alerts", icon: BellRing, min: "viewer" as Role },
] as const;

export const AI_GOV_NAV_ITEMS = [
  { name: "AI Discovery", href: "/dashboard/ai/discovery", icon: ScanSearch, min: "viewer" as Role },
  { name: "AI Systems", href: "/dashboard/ai/systems", icon: Brain, min: "viewer" as Role },
  { name: "Risk Register", href: "/dashboard/ai/risk", icon: ShieldAlert, min: "viewer" as Role },
  { name: "Model Catalog", href: "/dashboard/ai/models", icon: Boxes, min: "viewer" as Role },
  { name: "Usage & Cost", href: "/dashboard/ai/usage", icon: Coins, min: "viewer" as Role },
] as const;

export function pageTitleFor(pathname: string): string {
  if (pathname === "/dashboard") return "Overview";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  if (pathname.startsWith("/dashboard/audit")) return "Audit Trail";
  const all = [...NAV_ITEMS, ...AI_GOV_NAV_ITEMS];
  const match = all.find(
    (i) => i.href !== "/dashboard" && pathname.startsWith(i.href),
  );
  return match?.name ?? "Console";
}

function NavLink({
  href,
  name,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  name: string;
  icon: typeof Database;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
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
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-accent" : "text-faint group-hover:text-muted",
        )}
      />
      <span className={cn("font-medium tracking-tight", active && "font-semibold")}>
        {name}
      </span>
    </Link>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const role = roleOf(user);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10">
          <Radar className="h-5 w-5 text-accent" />
          <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-accent/20" />
        </div>
        <div className="leading-tight">
          <h1 className="font-display text-base font-bold tracking-tight text-foreground">
            Data<span className="text-accent">Sentinel</span>
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
            Sovereignty Console
          </p>
        </div>
      </div>

      <div className="mx-5 hairline h-px" />

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          Operations
        </p>
        {NAV_ITEMS.filter((item) => hasRole(role, item.min)).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            name={item.name}
            icon={item.icon}
            active={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}
        <p className="px-3 pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          AI Governance
        </p>
        {AI_GOV_NAV_ITEMS.filter((item) => hasRole(role, item.min)).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            name={item.name}
            icon={item.icon}
            active={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}
        <p className="px-3 pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          Workspace
        </p>
        {hasRole(role, "admin") && (
          <NavLink
            href="/dashboard/audit"
            name="Audit Trail"
            icon={ScrollText}
            active={pathname.startsWith("/dashboard/audit")}
            onClick={onNavigate}
          />
        )}
        {hasRole(role, "admin") && (
          <NavLink
            href="/dashboard/settings"
            name="Settings"
            icon={Settings}
            active={pathname.startsWith("/dashboard/settings")}
            onClick={onNavigate}
          />
        )}
        <NavLink
          href="/docs"
          name="Documentation"
          icon={BookText}
          active={false}
          onClick={onNavigate}
        />
      </nav>

      {/* Footer / user */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 font-display text-sm font-bold text-accent">
            {(user?.full_name || user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.full_name || user?.email || "Operator"}
            </p>
            <p className="truncate font-mono text-[11px] uppercase tracking-wide text-faint">
              {user?.role || "viewer"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();

  return (
    <>
      {/* Desktop */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-border bg-bg-2/80 backdrop-blur lg:block">
        <SidebarInner />
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 border-r border-border bg-bg-2 transition-transform duration-300 lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarInner onNavigate={() => setMobileMenuOpen(false)} />
      </aside>
    </>
  );
}
