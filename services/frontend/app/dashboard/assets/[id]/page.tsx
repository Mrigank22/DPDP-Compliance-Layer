"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ScanLine,
  Plug,
  Trash2,
  Database,
  Activity,
  ShieldAlert,
  Server,
  HardDrive,
  Cloud,
  Boxes,
  Brain,
  Globe,
  GitBranch,
  CheckCircle2,
} from "lucide-react";
import { assetsAPI } from "@/lib/api/assets";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import { StatusPill, RiskScore, SeverityBadge, PiiTags } from "@/components/common/indicators";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Reveal } from "@/components/common/reveal";
import { ASSET_TYPE_LABELS, PROVIDER_LABELS, FINDING_TYPE_LABELS, label } from "@/lib/utils/labels";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/helpers";

const TYPE_ICON: Record<string, typeof Database> = {
  s3_bucket: Boxes,
  rds_instance: Server,
  gcs_bucket: Cloud,
  azure_blob: HardDrive,
  postgresql: Database,
  api_endpoint: Globe,
  llm_endpoint: Brain,
};

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = String(params.id);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const assetQ = useQuery({
    queryKey: ["assets", id],
    queryFn: () => assetsAPI.get(id).then((r) => r.data),
  });
  const scansQ = useQuery({
    queryKey: ["assets", id, "scans"],
    queryFn: () => assetsAPI.listScans(id).then((r) => r.data),
  });
  const findingsQ = useQuery({
    queryKey: ["assets", id, "findings"],
    queryFn: () => assetsAPI.listFindings(id).then((r) => r.data),
  });
  const flowsQ = useQuery({
    queryKey: ["assets", id, "flows"],
    queryFn: () => assetsAPI.listDataFlows(id).then((r) => r.data),
  });

  const scan = useMutation({
    mutationFn: () => assetsAPI.triggerScan(id, { scan_type: "full" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets", id] });
      toast.success("Scan queued", "A full scan has been dispatched.");
    },
    onError: (e) => toast.error("Scan failed", getApiErrorMessage(e)),
  });
  const test = useMutation({
    mutationFn: () => assetsAPI.testConnection(id),
    onSuccess: (res) =>
      res.data?.success
        ? toast.success("Connection healthy", res.data.message)
        : toast.error("Connection failed", res.data?.message),
    onError: (e) => toast.error("Connection failed", getApiErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => assetsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset removed");
      router.push("/dashboard/assets");
    },
    onError: (e) => toast.error("Could not remove asset", getApiErrorMessage(e)),
  });

  if (assetQ.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 skeleton rounded-md" />
        <CardSkeleton count={4} />
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }
  if (assetQ.isError || !assetQ.data) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/assets" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" /> back to assets
        </Link>
        <ErrorState message={getApiErrorMessage(assetQ.error)} onRetry={() => assetQ.refetch()} />
      </div>
    );
  }

  const a = assetQ.data;
  const Icon = TYPE_ICON[a.asset_type] ?? Database;
  const scans = scansQ.data ?? [];
  const findings = findingsQ.data ?? [];
  const flows = flowsQ.data ?? [];
  const openFindings = findings.filter((f) => !f.is_resolved).length;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/assets"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> back to assets
      </Link>

      <PageHeader
        eyebrow={`${label(PROVIDER_LABELS, a.provider)} · ${label(ASSET_TYPE_LABELS, a.asset_type)}`}
        title={a.name}
        icon={<Icon className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate()}>
              <Plug className="h-4 w-4" /> Test
            </Button>
            <Button size="sm" disabled={scan.isPending} onClick={() => scan.mutate()}>
              <ScanLine className="h-4 w-4" /> Run Scan
            </Button>
            <Button variant="ghost" size="icon" className="text-critical hover:text-critical" title="Remove" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <StatusPill status={a.status} />
        <span className="font-mono text-xs text-faint">
          {a.region ?? "—"} · last scan {a.last_scanned_at ? formatRelativeTime(a.last_scanned_at) : "never"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">Risk</span>
          <RiskScore score={a.risk_score} size="lg" />
        </span>
      </div>

      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="PII Records" value={a.pii_record_count} tone="medium" icon={<Activity className="h-4 w-4" />} reveal={false} />
          <StatCard label="Open Findings" value={openFindings} tone="high" icon={<ShieldAlert className="h-4 w-4" />} reveal={false} />
          <StatCard label="Total Scans" value={scans.length} icon={<ScanLine className="h-4 w-4" />} reveal={false} />
          <StatCard label="Data Flows" value={flows.length} tone="low" icon={<GitBranch className="h-4 w-4" />} reveal={false} />
        </div>
      </Reveal>

      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings"><ShieldAlert className="h-4 w-4" /> Findings</TabsTrigger>
          <TabsTrigger value="scans"><ScanLine className="h-4 w-4" /> Scans</TabsTrigger>
          <TabsTrigger value="flows"><GitBranch className="h-4 w-4" /> Data Flows</TabsTrigger>
        </TabsList>

        <TabsContent value="findings">
          <div className="panel p-5">
            {findingsQ.isLoading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : findings.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="No findings" description="This asset is clean, or hasn't been scanned yet." />
            ) : (
              <DataTable>
                <THead>
                  <TH>Severity</TH>
                  <TH>Finding</TH>
                  <TH>PII</TH>
                  <TH>Status</TH>
                  <TH>Detected</TH>
                </THead>
                <TBody>
                  {findings.map((f) => (
                    <TR key={f.id}>
                      <TD><SeverityBadge severity={f.severity} /></TD>
                      <TD>
                        <p className="max-w-md truncate font-medium text-foreground">{f.title}</p>
                        <p className="font-mono text-[11px] text-faint">{label(FINDING_TYPE_LABELS, f.finding_type)}</p>
                      </TD>
                      <TD><PiiTags types={f.pii_types} /></TD>
                      <TD>
                        <span className={`font-mono text-xs ${f.is_resolved ? "text-accent" : "text-medium"}`}>
                          {f.is_resolved ? "resolved" : "open"}
                        </span>
                      </TD>
                      <TD className="font-mono text-xs text-muted">{formatRelativeTime(f.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scans">
          <div className="panel p-5">
            {scansQ.isLoading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : scans.length === 0 ? (
              <EmptyState icon={<ScanLine className="h-6 w-6" />} title="No scans yet" description="Run a scan to discover personal data in this asset." action={<Button size="sm" onClick={() => scan.mutate()}><ScanLine className="h-4 w-4" /> Run Scan</Button>} />
            ) : (
              <DataTable>
                <THead>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Records</TH>
                  <TH className="text-right">PII Found</TH>
                  <TH>Started</TH>
                </THead>
                <TBody>
                  {scans.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-mono text-xs uppercase text-muted">{s.scan_type}</TD>
                      <TD><StatusPill status={s.status} /></TD>
                      <TD className="text-right font-mono tabular-nums">{s.records_scanned.toLocaleString("en-IN")}</TD>
                      <TD className="text-right font-mono tabular-nums text-medium">{s.pii_records_found.toLocaleString("en-IN")}</TD>
                      <TD className="font-mono text-xs text-muted">{s.started_at ? formatDateTime(s.started_at) : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            )}
          </div>
        </TabsContent>

        <TabsContent value="flows">
          <div className="panel p-5">
            {flowsQ.isLoading ? (
              <TableSkeleton rows={4} cols={3} />
            ) : flows.length === 0 ? (
              <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No data flows" description="No outbound personal-data flows detected from this asset." />
            ) : (
              <DataTable>
                <THead>
                  <TH>Destination</TH>
                  <TH>PII Involved</TH>
                  <TH className="text-right">Events</TH>
                  <TH>Status</TH>
                </THead>
                <TBody>
                  {flows.map((f) => (
                    <TR key={f.id}>
                      <TD>
                        <p className="max-w-xs truncate font-mono text-xs text-foreground">{f.destination_url}</p>
                        <p className="font-mono text-[11px] uppercase text-faint">{f.destination_type}</p>
                      </TD>
                      <TD><PiiTags types={f.pii_types_involved} /></TD>
                      <TD className="text-right font-mono tabular-nums">{f.event_count.toLocaleString("en-IN")}</TD>
                      <TD>
                        <span className={`font-mono text-xs ${f.is_approved ? "text-accent" : "text-medium"}`}>
                          {f.is_approved ? "approved" : "review"}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </DataTable>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove asset?"
        description={<><span className="font-medium text-foreground">{a.name}</span> and its scan history will be disconnected. This cannot be undone.</>}
        confirmLabel="Remove asset"
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}
