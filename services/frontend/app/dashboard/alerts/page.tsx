"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  CheckCheck,
  Check,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { alertsAPI } from "@/lib/api/alerts";
import type { Alert, AlertListFilter } from "@/types/api";
import { SEVERITY_LEVELS, ALERT_TYPES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { SeverityBadge } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
import { Stagger } from "@/components/common/reveal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALERT_TYPE_LABELS, label } from "@/lib/utils/labels";
import { formatRelativeTime, getSeverityHex } from "@/lib/utils/helpers";

export default function AlertsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const [ack, setAck] = useState("unack");

  const filters: AlertListFilter = useMemo(
    () => ({
      page,
      page_size: 20,
      severity: severity === "all" ? undefined : severity,
      alert_type: type === "all" ? undefined : type,
      is_acknowledged: ack === "all" ? undefined : ack === "ack",
    }),
    [page, severity, type, ack],
  );

  const alertsQ = useQuery({
    queryKey: ["alerts", filters],
    queryFn: () => alertsAPI.list(filters),
  });

  const acknowledge = useMutation({
    mutationFn: (ids: string[]) => alertsAPI.acknowledge(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Acknowledged");
    },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });
  const acknowledgeAll = useMutation({
    mutationFn: () => alertsAPI.acknowledgeAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("All alerts acknowledged");
    },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => alertsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert dismissed");
    },
    onError: (e) => toast.error("Could not dismiss", getApiErrorMessage(e)),
  });

  const alerts: Alert[] = alertsQ.data?.data ?? [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const unacked = alerts.filter((a) => !a.is_acknowledged);
  const toggleOne = (id: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Signal Feed"
        title="Alerts"
        description="Breach indicators, policy violations and compliance deadlines requiring attention."
        icon={<BellRing className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            disabled={acknowledgeAll.isPending}
            onClick={() => acknowledgeAll.mutate()}
          >
            <CheckCheck className="h-4 w-4" /> Acknowledge all
          </Button>
        }
      />

      <Panel
        title="Alert Stream"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={ack} onValueChange={(v) => { setPage(1); setAck(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unack">Unacknowledged</SelectItem>
                <SelectItem value="ack">Acknowledged</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={(v) => { setPage(1); setSeverity(v); }}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                {SEVERITY_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setPage(1); setType(v); }}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ALERT_TYPES.map((t) => <SelectItem key={t} value={t}>{label(ALERT_TYPE_LABELS, t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {alertsQ.isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : alertsQ.isError ? (
          <ErrorState message={getApiErrorMessage(alertsQ.error)} onRetry={() => alertsQ.refetch()} />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={<CheckCheck className="h-6 w-6" />}
            title="No alerts"
            description="You're all caught up. New signals will appear here."
          />
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-2.5">
                <span className="font-mono text-xs text-accent">{selectedIds.size} selected</span>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={acknowledge.isPending}
                  onClick={() =>
                    acknowledge.mutate(Array.from(selectedIds), {
                      onSuccess: () => setSelectedIds(new Set()),
                    })
                  }
                >
                  <Check className="h-4 w-4" /> Acknowledge selected
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
            {unacked.length > 0 && (
              <button
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === unacked.length ? new Set() : new Set(unacked.map((a) => a.id)),
                  )
                }
                className="mb-2 font-mono text-[11px] uppercase tracking-wide text-faint transition-colors hover:text-accent"
              >
                {selectedIds.size === unacked.length ? "clear selection" : "select all unacknowledged"}
              </button>
            )}
            <Stagger className="space-y-2.5">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  data-reveal
                  className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface-2/40 p-4"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: getSeverityHex(a.severity) }}
                  />
                  {!a.is_acknowledged ? (
                    <input
                      type="checkbox"
                      aria-label="Select alert"
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border bg-surface-2 accent-[var(--color-accent)]"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" />
                  )}
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display font-semibold text-foreground">{a.title}</p>
                      <SeverityBadge severity={a.severity} />
                      {!a.is_acknowledged && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </div>
                    {a.body && <p className="mt-1 text-sm text-muted">{a.body}</p>}
                    <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
                      {label(ALERT_TYPE_LABELS, a.alert_type)} · {formatRelativeTime(a.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!a.is_acknowledged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Acknowledge"
                        disabled={acknowledge.isPending}
                        onClick={() => acknowledge.mutate([a.id])}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Dismiss"
                      className="text-critical hover:text-critical"
                      onClick={() => del.mutate(a.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </Stagger>
            <div className="mt-4">
              <Pager pagination={alertsQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
