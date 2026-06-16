"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Database,
  ShieldCheck,
  Bug,
  Waypoints,
  FileBarChart,
  UserCheck,
  FileCheck2,
  BellRing,
  Settings,
  ScrollText,
  Search,
  ShieldAlert,
  Plus,
  CornerDownLeft,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth.store";
import { useUIStore } from "@/lib/store/ui.store";

interface Cmd {
  id: string;
  label: string;
  icon: typeof Database;
  href: string;
  keywords?: string;
  group: "Navigate" | "Actions";
  adminOnly?: boolean;
}

const COMMANDS: Cmd[] = [
  { id: "nav-overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard", group: "Navigate" },
  { id: "nav-assets", label: "Assets", icon: Database, href: "/dashboard/assets", keywords: "data sources buckets", group: "Navigate" },
  { id: "nav-policies", label: "Policies", icon: ShieldCheck, href: "/dashboard/policies", keywords: "rules enforcement", group: "Navigate" },
  { id: "nav-findings", label: "Findings", icon: Bug, href: "/dashboard/findings", keywords: "risks exposure violations", group: "Navigate" },
  { id: "nav-gateway", label: "Gateway", icon: Waypoints, href: "/dashboard/gateway", keywords: "proxy llm traffic", group: "Navigate" },
  { id: "nav-reports", label: "Reports", icon: FileBarChart, href: "/dashboard/reports", keywords: "dpia audit evidence", group: "Navigate" },
  { id: "nav-rights", label: "Rights / DSR", icon: UserCheck, href: "/dashboard/rights", keywords: "data principal access erasure", group: "Navigate" },
  { id: "nav-consent", label: "Consent", icon: FileCheck2, href: "/dashboard/consent", keywords: "ledger purpose", group: "Navigate" },
  { id: "nav-alerts", label: "Alerts", icon: BellRing, href: "/dashboard/alerts", keywords: "notifications breach", group: "Navigate" },
  { id: "nav-audit", label: "Audit Trail", icon: ScrollText, href: "/dashboard/audit", keywords: "logs history", group: "Navigate", adminOnly: true },
  { id: "nav-settings", label: "Settings", icon: Settings, href: "/dashboard/settings", keywords: "team api keys profile", group: "Navigate" },
  // Actions
  { id: "act-asset", label: "Connect a data source", icon: Plus, href: "/dashboard/assets?action=new", keywords: "add asset", group: "Actions" },
  { id: "act-policy", label: "Create a policy", icon: Plus, href: "/dashboard/policies?action=new", group: "Actions" },
  { id: "act-report", label: "Generate a report", icon: Plus, href: "/dashboard/reports?action=new", group: "Actions" },
  { id: "act-dsr", label: "Log a rights request", icon: Plus, href: "/dashboard/rights?action=new", group: "Actions" },
  { id: "act-breach", label: "Report a breach (72h)", icon: ShieldAlert, href: "/dashboard/reports?action=new&type=incident_report", keywords: "incident emergency", group: "Actions" },
  { id: "act-critical", label: "View critical findings", icon: Bug, href: "/dashboard/findings?severity=critical", group: "Actions" },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const toggle = useUIStore((s) => s.toggleCommand);
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "admin" || role === "owner";

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggle]);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const visible = COMMANDS.filter((c) => !c.adminOnly || isAdmin);
  const groups = ["Navigate", "Actions"] as const;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[18%] z-[120] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="h-4 w-4 text-faint" />
        <Command.Input
          autoFocus
          placeholder="Search commands, pages, actions…"
          className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
        />
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint">
          ESC
        </kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted">
          No matches found.
        </Command.Empty>
        {groups.map((g) => (
          <Command.Group
            key={g}
            heading={
              <span className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                {g}
              </span>
            }
            className="mb-1"
          >
            {visible
              .filter((c) => c.group === g)
              .map((c) => (
                <Command.Item
                  key={c.id}
                  value={`${c.label} ${c.keywords ?? ""}`}
                  onSelect={() => run(c.href)}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted aria-selected:bg-accent/12 aria-selected:text-foreground"
                >
                  <c.icon className="h-4 w-4 text-faint group-aria-selected:text-accent" />
                  <span>{c.label}</span>
                  <CornerDownLeft className="ml-auto h-3.5 w-3.5 opacity-0 group-aria-selected:opacity-60" />
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
