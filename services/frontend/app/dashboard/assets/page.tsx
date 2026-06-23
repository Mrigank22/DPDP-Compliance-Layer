"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  Plus,
  ScanLine,
  Plug,
  Trash2,
  Search,
  Server,
  HardDrive,
  Cloud,
  Boxes,
  Brain,
  Globe,
} from "lucide-react";
import { assetsAPI } from "@/lib/api/assets";
import type {
  Asset,
  CreateAssetInput,
  AssetListFilter,
} from "@/types/api";
import { ASSET_TYPES, PROVIDERS, ASSET_STATUSES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, LoadingPanel } from "@/components/common/states";
import { StatusPill, RiskScore } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ASSET_TYPE_LABELS, PROVIDER_LABELS, label } from "@/lib/utils/labels";
import { formatRelativeTime } from "@/lib/utils/helpers";

const TYPE_ICON: Record<string, typeof Database> = {
  s3_bucket: Boxes,
  rds_instance: Server,
  gcs_bucket: Cloud,
  azure_blob: HardDrive,
  postgresql: Database,
  mysql: Database,
  snowflake: Database,
  bigquery: Database,
  redshift: Database,
  databricks: Database,
  mongodb: Database,
  salesforce: Cloud,
  api_endpoint: Globe,
  llm_endpoint: Brain,
};

const CONFIG_HINTS: Record<string, string> = {
  s3_bucket: '{\n  "bucket_name": "my-bucket",\n  "prefix": "",\n  "role_arn": "arn:aws:iam::123:role/scan"\n}',
  rds_instance: '{\n  "host": "db.xxx.rds.amazonaws.com",\n  "port": 5432,\n  "database": "app",\n  "username": "readonly",\n  "password": "••••",\n  "ssl_mode": "require"\n}',
  postgresql: '{\n  "host": "10.0.0.5",\n  "port": 5432,\n  "database": "app",\n  "username": "readonly",\n  "password": "••••",\n  "ssl_mode": "require"\n}',
  mysql: '{\n  "host": "db.example.com",\n  "port": 3306,\n  "database": "app",\n  "username": "readonly",\n  "password": "••••",\n  "ssl": true\n}',
  snowflake: '{\n  "account": "orgid-acct",\n  "user": "SCAN_USER",\n  "password": "••••",\n  "warehouse": "COMPUTE_WH",\n  "database": "PROD",\n  "schema": "PUBLIC",\n  "role": "READONLY"\n}',
  bigquery: '{\n  "project": "my-project",\n  "dataset": "analytics",\n  "credentials_json": ""\n}',
  redshift: '{\n  "host": "cluster.xxxx.ap-south-1.redshift.amazonaws.com",\n  "port": 5439,\n  "database": "prod",\n  "username": "readonly",\n  "password": "••••",\n  "ssl_mode": "require"\n}',
  databricks: '{\n  "server_hostname": "adb-xxxx.azuredatabricks.net",\n  "http_path": "/sql/1.0/warehouses/xxxx",\n  "access_token": "dapi••••",\n  "catalog": "main",\n  "schema": "default"\n}',
  mongodb: '{\n  "uri": "mongodb+srv://user:pass@cluster.mongodb.net",\n  "database": "app"\n}',
  salesforce: '{\n  "username": "user@example.com",\n  "password": "••••",\n  "security_token": "••••",\n  "domain": "login"\n}',
  gcs_bucket: '{\n  "bucket_name": "my-gcs-bucket",\n  "project": "my-project",\n  "prefix": ""\n}',
  azure_blob: '{\n  "account": "storageacct",\n  "container": "data",\n  "connection_string": ""\n}',
  api_endpoint: '{\n  "url": "https://api.internal/v1"\n}',
  llm_endpoint: '{\n  "provider": "openai",\n  "url": "https://api.openai.com/v1"\n}',
};

function ConnectAssetModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<string>("s3_bucket");
  const [provider, setProvider] = useState<string>("aws");
  const [region, setRegion] = useState("ap-south-1");
  const [config, setConfig] = useState(CONFIG_HINTS.s3_bucket);
  const [configError, setConfigError] = useState("");

  const reset = () => {
    setName("");
    setAssetType("s3_bucket");
    setProvider("aws");
    setRegion("ap-south-1");
    setConfig(CONFIG_HINTS.s3_bucket);
    setConfigError("");
  };

  const create = useMutation({
    mutationFn: (data: CreateAssetInput) => assetsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset connected", "Discovery will begin on the next scan.");
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not connect asset", getApiErrorMessage(e)),
  });

  const submit = () => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = config.trim() ? JSON.parse(config) : {};
      setConfigError("");
    } catch {
      setConfigError("Connection config must be valid JSON.");
      return;
    }
    create.mutate({
      name,
      asset_type: assetType as CreateAssetInput["asset_type"],
      provider: provider as CreateAssetInput["provider"],
      region: region || undefined,
      connection_config: parsed,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a data source</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="asset-name">Display name</Label>
            <Input
              id="asset-name"
              placeholder="Production KYC bucket"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={assetType}
                onValueChange={(v) => {
                  setAssetType(v);
                  setConfig(CONFIG_HINTS[v] ?? "{}");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {label(ASSET_TYPE_LABELS, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {label(PROVIDER_LABELS, p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="region">Region</Label>
            <Input
              id="region"
              placeholder="ap-south-1"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="config">Connection config (JSON)</Label>
            <Textarea
              id="config"
              className="min-h-[120px] font-mono text-xs"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
            />
            {configError && <p className="text-xs text-critical">{configError}</p>}
            <p className="text-[11px] text-faint">
              Credentials are encrypted at rest with your tenant key.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name || create.isPending}>
            {create.isPending ? "Connecting…" : "Connect asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading assets…" />}>
      <AssetsContent />
    </Suspense>
  );
}

function AssetsContent() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [connectOpen, setConnectOpen] = useState(sp.get("action") === "new");
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);

  const filters: AssetListFilter = useMemo(
    () => ({
      page,
      page_size: 20,
      search: search || undefined,
      asset_type: typeFilter === "all" ? undefined : typeFilter,
      provider: providerFilter === "all" ? undefined : providerFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [page, search, typeFilter, providerFilter, statusFilter],
  );

  const assetsQ = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => assetsAPI.list(filters),
  });

  const scan = useMutation({
    mutationFn: (id: string) => assetsAPI.triggerScan(id, { scan_type: "full" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Scan queued", "A full scan has been dispatched.");
    },
    onError: (e) => toast.error("Scan failed", getApiErrorMessage(e)),
  });

  const test = useMutation({
    mutationFn: (id: string) => assetsAPI.testConnection(id),
    onSuccess: (res) =>
      res.data?.success
        ? toast.success("Connection healthy", res.data.message)
        : toast.error("Connection failed", res.data?.message),
    onError: (e) => toast.error("Connection failed", getApiErrorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => assetsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Asset removed");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Could not remove asset", getApiErrorMessage(e)),
  });

  const assets = assetsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory"
        title="Connected Assets"
        description="Cloud and on-prem data sources under continuous discovery."
        icon={<Database className="h-5 w-5" />}
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plus className="h-4 w-4" /> Connect Asset
          </Button>
        }
      />

      <Panel
        title="Asset Registry"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Search…"
                className="h-9 w-44 pl-8 text-sm"
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setPage(1); setTypeFilter(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{label(ASSET_TYPE_LABELS, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={(v) => { setPage(1); setProviderFilter(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>{label(PROVIDER_LABELS, p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {ASSET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {assetsQ.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : assetsQ.isError ? (
          <ErrorState message={getApiErrorMessage(assetsQ.error)} onRetry={() => assetsQ.refetch()} />
        ) : assets.length === 0 ? (
          <EmptyState
            icon={<Database className="h-6 w-6" />}
            title="No assets found"
            description="Connect a cloud bucket or database to start discovering personal data."
            action={
              <Button onClick={() => setConnectOpen(true)}>
                <Plus className="h-4 w-4" /> Connect Asset
              </Button>
            }
          />
        ) : (
          <>
            <DataTable>
              <THead>
                <TH>Asset</TH>
                <TH>Provider</TH>
                <TH>Status</TH>
                <TH className="text-right">PII Records</TH>
                <TH>Risk</TH>
                <TH>Last Scan</TH>
                <TH className="text-right">Actions</TH>
              </THead>
              <TBody>
                {assets.map((a) => {
                  const Icon = TYPE_ICON[a.asset_type] ?? Database;
                  return (
                    <TR key={a.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/assets/${a.id}`}
                              className="truncate font-medium text-foreground transition-colors hover:text-accent"
                            >
                              {a.name}
                            </Link>
                            <p className="font-mono text-[11px] text-faint">
                              {label(ASSET_TYPE_LABELS, a.asset_type)}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <span className="font-mono text-xs uppercase text-muted">
                          {label(PROVIDER_LABELS, a.provider)}
                          {a.region ? ` · ${a.region}` : ""}
                        </span>
                      </TD>
                      <TD><StatusPill status={a.status} /></TD>
                      <TD className="text-right font-mono tabular-nums">
                        {a.pii_record_count.toLocaleString("en-IN")}
                      </TD>
                      <TD><RiskScore score={a.risk_score} /></TD>
                      <TD className="font-mono text-xs text-muted">
                        {a.last_scanned_at ? formatRelativeTime(a.last_scanned_at) : "never"}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Run scan"
                            disabled={scan.isPending}
                            onClick={() => scan.mutate(a.id)}
                          >
                            <ScanLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Test connection"
                            disabled={test.isPending}
                            onClick={() => test.mutate(a.id)}
                          >
                            <Plug className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove"
                            className="text-critical hover:text-critical"
                            onClick={() => setDeleteTarget(a)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </DataTable>
            <div className="mt-4">
              <Pager pagination={assetsQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>

      <ConnectAssetModal open={connectOpen} onOpenChange={setConnectOpen} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remove asset?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> and
            its scan history will be disconnected. This cannot be undone.
          </>
        }
        confirmLabel="Remove asset"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
