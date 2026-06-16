"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  Search,
  CheckCircle2,
  ShieldOff,
  MapPin,
  FileWarning,
  CheckCheck,
  X,
} from "lucide-react";
import { findingsAPI } from "@/lib/api/findings";
import type { Finding, FindingListFilter } from "@/types/api";
import { SEVERITY_LEVELS, FINDING_TYPES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton, LoadingPanel } from "@/components/common/states";
import { SeverityBadge, PiiTags } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
import { Stagger } from "@/components/common/reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FINDING_TYPE_LABELS, label } from "@/lib/utils/labels";
import { formatDateTime } from "@/lib/utils/helpers";

function FindingDetail({
  finding,
  onClose,
}: {
  finding: Finding | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const resolve = useMutation({
    mutationFn: () => findingsAPI.resolve(finding!.id, { resolution_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings"] });
      toast.success("Finding resolved");
      setNote("");
      onClose();
    },
    onError: (e) => toast.error("Could not resolve", getApiErrorMessage(e)),
  });

  const falsePositive = useMutation({
    mutationFn: () =>
      findingsAPI.markFalsePositive(finding!.id, {
        resolution_note: note || "Marked as false positive",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings"] });
      toast.success("Marked as false positive");
      setNote("");
      onClose();
    },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });

  if (!finding) return null;
  const location = finding.location ?? {};

  return (
    <Dialog open={!!finding} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <Badge variant="default">{label(FINDING_TYPE_LABELS, finding.finding_type)}</Badge>
          </div>
          <DialogTitle className="mt-2">{finding.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted">
          {finding.description || "No description provided."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Sample Count</p>
            <p className="font-display text-lg font-bold text-foreground">
              {finding.sample_count.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Detected</p>
            <p className="text-sm text-foreground">{formatDateTime(finding.created_at)}</p>
          </div>
        </div>

        {finding.pii_types?.length > 0 && (
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">PII Types</p>
            <PiiTags types={finding.pii_types} max={20} />
          </div>
        )}

        {Object.keys(location).length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-faint">
              <MapPin className="h-3 w-3" /> Location
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg-2 p-3 font-mono text-xs text-muted">
              {JSON.stringify(location, null, 2)}
            </pre>
          </div>
        )}

        {!finding.is_resolved ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Label htmlFor="note">Resolution note</Label>
            <Textarea
              id="note"
              placeholder="Describe the remediation taken…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={falsePositive.isPending}
                onClick={() => falsePositive.mutate()}
              >
                <ShieldOff className="h-4 w-4" /> False positive
              </Button>
              <Button
                disabled={!note || resolve.isPending}
                onClick={() => resolve.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" /> Mark resolved
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/8 px-3 py-2.5 text-sm text-accent">
            <CheckCircle2 className="h-4 w-4" />
            Resolved
            {finding.resolution_note ? ` — ${finding.resolution_note}` : ""}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading findings…" />}>
      <FindingsContent />
    </Suspense>
  );
}

function FindingsContent() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState(sp.get("severity") ?? "all");
  const [type, setType] = useState(sp.get("type") ?? "all");
  const [resolved, setResolved] = useState(sp.get("resolved") ?? "open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Finding | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const summaryQ = useQuery({
    queryKey: ["findings", "summary"],
    queryFn: () => findingsAPI.summary().then((r) => r.data),
  });

  const filters: FindingListFilter = useMemo(
    () => ({
      page,
      page_size: 20,
      severity: severity === "all" ? undefined : severity,
      finding_type: type === "all" ? undefined : type,
      is_resolved: resolved === "all" ? undefined : resolved === "resolved",
    }),
    [page, severity, type, resolved],
  );

  const findingsQ = useQuery({
    queryKey: ["findings", filters],
    queryFn: () => findingsAPI.list(filters),
  });

  const all = findingsQ.data?.data ?? [];
  const findings = search
    ? all.filter((f) => f.title.toLowerCase().includes(search.toLowerCase()))
    : all;

  const summary = summaryQ.data;
  const openFindings = findings.filter((f) => !f.is_resolved);

  const toggleOne = (id: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpenSelected = openFindings.length > 0 && openFindings.every((f) => selectedIds.has(f.id));
  const toggleAll = () =>
    setSelectedIds(allOpenSelected ? new Set() : new Set(openFindings.map((f) => f.id)));

  const bulkResolve = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => findingsAPI.resolve(id, { resolution_note: "Bulk-resolved from console" }))),
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ["findings"] });
      toast.success(`${ids.length} finding(s) resolved`);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error("Bulk resolve failed", getApiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk Ledger"
        title="Findings"
        description="Every PII exposure, misconfiguration and policy violation across your data estate."
        icon={<Bug className="h-5 w-5" />}
      />

      {summaryQ.isLoading ? (
        <CardSkeleton count={4} />
      ) : (
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Findings" value={summary?.total ?? 0} icon={<Bug className="h-4 w-4" />} />
          <StatCard label="Unresolved" value={summary?.unresolved ?? 0} tone="high" icon={<FileWarning className="h-4 w-4" />} />
          <StatCard label="Critical" value={summary?.by_severity?.critical ?? 0} tone="critical" icon={<Bug className="h-4 w-4" />} />
          <StatCard label="High" value={summary?.by_severity?.high ?? 0} tone="medium" icon={<Bug className="h-4 w-4" />} />
        </Stagger>
      )}

      <Panel
        title="Findings Queue"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Search…"
                className="h-9 w-40 pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={severity} onValueChange={(v) => { setPage(1); setSeverity(v); }}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                {SEVERITY_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setPage(1); setType(v); }}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FINDING_TYPES.map((t) => <SelectItem key={t} value={t}>{label(FINDING_TYPE_LABELS, t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={resolved} onValueChange={(v) => { setPage(1); setResolved(v); }}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {findingsQ.isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : findingsQ.isError ? (
          <ErrorState message={getApiErrorMessage(findingsQ.error)} onRetry={() => findingsQ.refetch()} />
        ) : findings.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="No findings match"
            description="Either your estate is clean, or adjust the filters above."
          />
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-2.5">
                <span className="font-mono text-xs text-accent">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={bulkResolve.isPending}
                  onClick={() => bulkResolve.mutate(Array.from(selectedIds))}
                >
                  <CheckCheck className="h-4 w-4" /> Resolve selected
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())} title="Clear">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <DataTable>
              <THead>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all open"
                    className="h-4 w-4 cursor-pointer rounded border-border bg-surface-2 accent-[var(--color-accent)]"
                    checked={allOpenSelected}
                    onChange={toggleAll}
                    disabled={openFindings.length === 0}
                  />
                </TH>
                <TH>Severity</TH>
                <TH>Finding</TH>
                <TH>PII</TH>
                <TH className="text-right">Samples</TH>
                <TH>Status</TH>
                <TH>Detected</TH>
              </THead>
              <TBody>
                {findings.map((f) => (
                  <TR key={f.id} onClick={() => setSelected(f)}>
                    <TD>
                      {!f.is_resolved ? (
                        <input
                          type="checkbox"
                          aria-label="Select finding"
                          className="h-4 w-4 cursor-pointer rounded border-border bg-surface-2 accent-[var(--color-accent)]"
                          checked={selectedIds.has(f.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleOne(f.id)}
                        />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </TD>
                    <TD><SeverityBadge severity={f.severity} /></TD>
                    <TD>
                      <p className="max-w-md truncate font-medium text-foreground">{f.title}</p>
                      <p className="font-mono text-[11px] text-faint">
                        {label(FINDING_TYPE_LABELS, f.finding_type)}
                      </p>
                    </TD>
                    <TD><PiiTags types={f.pii_types} /></TD>
                    <TD className="text-right font-mono tabular-nums">
                      {f.sample_count.toLocaleString("en-IN")}
                    </TD>
                    <TD>
                      {f.is_resolved ? (
                        <span className="font-mono text-xs text-accent">resolved</span>
                      ) : (
                        <span className="font-mono text-xs text-medium">open</span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-muted">{formatDateTime(f.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </DataTable>
            <div className="mt-4">
              <Pager pagination={findingsQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>

      <FindingDetail finding={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
