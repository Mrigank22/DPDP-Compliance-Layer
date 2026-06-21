"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { adminAPI } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const ACTION_TONE: Record<string, string> = {
  "tenant.suspend": "text-warning",
  "tenant.delete": "text-danger",
  "tenant.activate": "text-success",
  "platform_admin.disable": "text-danger",
  "platform_admin.create": "text-accent",
  "platform_admin.login": "text-muted",
};

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const auditQ = useQuery({ queryKey: ["admin", "audit", page], queryFn: () => adminAPI.audit(page, 50) });
  const rows = auditQ.data?.data ?? [];
  const pg = auditQ.data?.meta?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
          <ScrollText className="h-5 w-5 text-accent" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Audit Trail</h1>
          <p className="text-sm text-muted">Every platform-admin action, immutably recorded.</p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">When</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Admin</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Action</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Target</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">IP</th>
              </tr>
            </thead>
            <tbody>
              {auditQ.isLoading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No audit events yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-muted">{formatTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-foreground">{r.admin_email || r.admin_id.slice(0, 8)}</td>
                    <td className={`px-4 py-3 font-mono text-[12px] ${ACTION_TONE[r.action] ?? "text-muted"}`}>{r.action}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-faint">
                      {r.target_type ? `${r.target_type}:${r.target_id.slice(0, 8)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-faint">{r.ip_address || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pg && pg.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="font-mono text-[11px] text-faint">
              Page {pg.page} of {pg.total_pages} · {pg.total_items} events
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={!pg.has_prev} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={!pg.has_next} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
