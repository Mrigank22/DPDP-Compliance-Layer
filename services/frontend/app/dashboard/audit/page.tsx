"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ScrollText, Search, Filter, Code2, ShieldCheck, ShieldAlert } from "lucide-react";
import { auditAPI, type AuditVerifyResult } from "@/lib/api/audit";
import type { AuditLog, AuditLogFilter } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { Pager } from "@/components/common/pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);

  const verify = useMutation({
    mutationFn: () => auditAPI.verify().then((r) => r.data),
    onSuccess: (data) => {
      setVerifyResult(data);
      if (data.valid) {
        toast.success("Audit log verified", `${data.entries} entries — no tampering detected.`);
      } else {
        toast.error("Integrity check failed", data.message);
      }
    },
    onError: (e) => toast.error("Could not verify audit log", getApiErrorMessage(e)),
  });

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
        actions={
          <Button variant="secondary" onClick={() => verify.mutate()} disabled={verify.isPending}>
            <ShieldCheck className="h-4 w-4" />
            {verify.isPending ? "Verifying…" : "Verify integrity"}
          </Button>
        }
      />

      {verifyResult && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
            verifyResult.valid
              ? "border-success/30 bg-success/10 text-success"
              : "border-critical/30 bg-critical/10 text-critical"
          }`}
        >
          {verifyResult.valid ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <p className="font-medium">
              {verifyResult.valid ? "Chain intact" : "Tampering detected"}
            </p>
            <p className="text-xs opacity-90">
              {verifyResult.message} · {verifyResult.entries} chained entries
              {verifyResult.broken_at_seq != null && ` · first break at #${verifyResult.broken_at_seq}`}
            </p>
          </div>
        </div>
      )}

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
