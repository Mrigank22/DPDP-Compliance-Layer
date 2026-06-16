"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Search, Filter, Code2 } from "lucide-react";
import { auditAPI } from "@/lib/api/audit";
import type { AuditLog, AuditLogFilter } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeader, Panel } from "@/components/common/panel";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { Pager } from "@/components/common/pager";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanize } from "@/lib/utils/labels";
import { formatDateTime } from "@/lib/utils/helpers";

function prettyChanges(raw: string): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const filters: AuditLogFilter = useMemo(
    () => ({
      page,
      page_size: 25,
      action: action || undefined,
      resource_type: resource || undefined,
    }),
    [page, action, resource],
  );

  const auditQ = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => auditAPI.list(filters),
  });

  const logs = auditQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tamper-Evident Trail"
        title="Audit Trail"
        description="Every privileged action across the workspace — immutable, regulator-ready evidence."
        icon={<ScrollText className="h-5 w-5" />}
      />

      <Panel
        title="Activity Log"
        subtitle="7-year retention · ClickHouse-backed"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="action (e.g. asset.created)"
                className="h-9 w-52 pl-8 text-sm"
                value={action}
                onChange={(e) => { setPage(1); setAction(e.target.value); }}
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="resource (e.g. asset)"
                className="h-9 w-44 pl-8 text-sm"
                value={resource}
                onChange={(e) => { setPage(1); setResource(e.target.value); }}
              />
            </div>
          </div>
        }
      >
        {auditQ.isLoading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : auditQ.isError ? (
          <ErrorState message={getApiErrorMessage(auditQ.error)} onRetry={() => auditQ.refetch()} />
        ) : logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No audit events" description="Privileged actions will be recorded here as they happen." />
        ) : (
          <>
            <DataTable>
              <THead>
                <TH>Action</TH>
                <TH>Resource</TH>
                <TH>Actor</TH>
                <TH>IP</TH>
                <TH>When</TH>
                <TH className="text-right" />
              </THead>
              <TBody>
                {logs.map((l) => (
                  <TR key={l.id} onClick={() => setSelected(l)}>
                    <TD>
                      <Badge variant="default" className="font-mono lowercase">{l.action}</Badge>
                    </TD>
                    <TD>
                      <span className="text-foreground">{humanize(l.resource_type)}</span>
                      {l.resource_id && (
                        <span className="ml-1 font-mono text-[11px] text-faint">
                          {l.resource_id.slice(0, 8)}
                        </span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-muted">{l.user_id ? l.user_id.slice(0, 8) : "system"}</TD>
                    <TD className="font-mono text-xs text-muted">{l.ip_address || "—"}</TD>
                    <TD className="font-mono text-xs text-muted">{formatDateTime(l.timestamp)}</TD>
                    <TD className="text-right">
                      <Code2 className="ml-auto h-4 w-4 text-faint" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </DataTable>
            <div className="mt-4">
              <Pager pagination={auditQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono lowercase">{selected?.action}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Resource</p>
                  <p className="text-foreground">{humanize(selected.resource_type)}</p>
                  {selected.resource_id && <p className="font-mono text-[11px] text-faint">{selected.resource_id}</p>}
                </div>
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Actor</p>
                  <p className="font-mono text-xs text-foreground">{selected.user_id || "system"}</p>
                  <p className="font-mono text-[11px] text-faint">{selected.ip_address}</p>
                </div>
              </div>
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">Changes</p>
                <pre className="overflow-x-auto rounded-lg border border-border bg-bg-2 p-3 font-mono text-xs text-muted">
                  {prettyChanges(selected.changes)}
                </pre>
              </div>
              <p className="font-mono text-[11px] text-faint">{formatDateTime(selected.timestamp)} · {selected.user_agent}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
