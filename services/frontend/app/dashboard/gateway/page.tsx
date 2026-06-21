"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Waypoints,
  Plus,
  Trash2,
  Pencil,
  ShieldX,
  Eye,
  GitBranch,
  CheckCircle2,
  Gauge,
  Activity,
  Ban,
} from "lucide-react";
import { gatewayAPI } from "@/lib/api/gateway";
import type {
  GatewayRule,
  DataFlow,
  CreateGatewayRuleInput,
} from "@/types/api";
import { PII_TYPES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import { PiiTags } from "@/components/common/indicators";
import { Stagger } from "@/components/common/reveal";
import { DataFlowMap } from "@/components/dashboard/data-flow-map";
import { GatewayLiveFeed } from "@/components/dashboard/gateway-live-feed";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
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
import { GATEWAY_ACTION_LABELS, PII_LABELS, label } from "@/lib/utils/labels";

const ACTIONS = ["mask", "redact", "block", "tokenize", "alert", "allow"] as const;
const ACTION_TONE: Record<string, string> = {
  block: "text-critical border-critical/30 bg-critical/10",
  redact: "text-high border-high/30 bg-high/10",
  mask: "text-medium border-medium/30 bg-medium/10",
  tokenize: "text-accent-2 border-accent-2/30 bg-accent-2/10",
  alert: "text-low border-low/30 bg-low/10",
  allow: "text-faint border-border bg-surface-3",
};

function RuleForm({
  editing,
  onClose,
}: {
  editing: GatewayRule | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [route, setRoute] = useState(editing?.route_pattern ?? "");
  const [action, setAction] = useState<string>(editing?.action ?? "mask");
  const [direction, setDirection] = useState<string>(editing?.direction ?? "both");
  const [methods, setMethods] = useState((editing?.http_methods ?? ["*"]).join(","));
  const [piiTypes, setPiiTypes] = useState<string[]>(editing?.pii_types ?? []);

  const save = useMutation({
    mutationFn: (data: CreateGatewayRuleInput) =>
      editing ? gatewayAPI.updateRule(editing.id, data) : gatewayAPI.createRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway", "rules"] });
      toast.success(editing ? "Rule updated" : "Rule created");
      onClose();
    },
    onError: (e) => toast.error("Could not save rule", getApiErrorMessage(e)),
  });

  const togglePii = (t: string) =>
    setPiiTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit gateway rule" : "New gateway rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mask PII to external LLMs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-route">Route pattern</Label>
            <Input
              id="r-route"
              className="font-mono text-sm"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="api.openai.com/*"
            />
            <p className="text-[11px] text-faint">
              Matches the destination host and/or path. Use{" "}
              <span className="font-mono">*</span> for everything,{" "}
              <span className="font-mono">api.openai.com/*</span> for a host, or{" "}
              <span className="font-mono">/v1/*</span> for a path. Not a regex.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{label(GATEWAY_ACTION_LABELS, a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="request">Request</SelectItem>
                  <SelectItem value="response">Response</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-methods">HTTP methods (comma-separated)</Label>
            <Input
              id="r-methods"
              className="font-mono text-sm"
              value={methods}
              onChange={(e) => setMethods(e.target.value)}
              placeholder="*  or  GET,POST"
            />
          </div>
          <div className="space-y-1.5">
            <Label>PII types to target</Label>
            <div className="flex flex-wrap gap-1.5">
              {PII_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => togglePii(t)}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors",
                    piiTypes.includes(t)
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-border bg-surface-2 text-faint hover:text-muted",
                  )}
                >
                  {PII_LABELS[t] ?? t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name || !route || save.isPending}
            onClick={() =>
              save.mutate({
                name,
                route_pattern: route,
                action: action as CreateGatewayRuleInput["action"],
                direction: direction as CreateGatewayRuleInput["direction"],
                http_methods: methods.split(",").map((m) => m.trim()).filter(Boolean),
                pii_types: piiTypes,
              })
            }
          >
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}

function RuleModal({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: GatewayRule | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RuleForm
          key={editing?.id ?? "new"}
          editing={editing}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

export default function GatewayPage() {
  const qc = useQueryClient();
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editing, setEditing] = useState<GatewayRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GatewayRule | null>(null);
  const [live, setLive] = useState(false);

  const statsQ = useQuery({
    queryKey: ["gateway", "stats"],
    queryFn: () => gatewayAPI.getStats(24).then((r) => r.data),
    refetchInterval: 30_000,
  });
  const rulesQ = useQuery({
    queryKey: ["gateway", "rules"],
    queryFn: () => gatewayAPI.listRules().then((r) => r.data),
  });
  const flowsQ = useQuery({
    queryKey: ["gateway", "flows"],
    queryFn: () => gatewayAPI.listDataFlows().then((r) => r.data),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => gatewayAPI.toggleRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateway", "rules"] }),
    onError: (e) => toast.error("Toggle failed", getApiErrorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => gatewayAPI.deleteRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway", "rules"] });
      toast.success("Rule deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Could not delete rule", getApiErrorMessage(e)),
  });
  const approve = useMutation({
    mutationFn: (id: string) => gatewayAPI.approveDataFlow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway", "flows"] });
      toast.success("Data flow approved");
    },
    onError: (e) => toast.error("Approval failed", getApiErrorMessage(e)),
  });

  const stats = statsQ.data;
  const rules: GatewayRule[] = rulesQ.data ?? [];
  const flows: DataFlow[] = flowsQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inline Enforcement"
        title="Enforcement Gateway"
        description="Live inspection of egress traffic — masking, blocking and tokenizing PII in flight."
        icon={<Waypoints className="h-5 w-5" />}
        actions={
          <Button onClick={() => { setEditing(null); setRuleModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        }
      />

      {statsQ.isLoading ? (
        <CardSkeleton count={4} />
      ) : (
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Events / 24h" value={Number(stats?.total_events ?? 0)} icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Blocked" value={Number(stats?.blocked ?? 0)} tone="critical" icon={<Ban className="h-4 w-4" />} />
          <StatCard label="PII Caught" value={Number(stats?.pii_detections ?? 0)} tone="medium" icon={<ShieldX className="h-4 w-4" />} />
          <StatCard label="Block Rate" value={Number(stats?.block_rate ?? 0)} suffix="%" decimals={1} tone="high" icon={<ShieldX className="h-4 w-4" />} />
          <StatCard label="Avg Latency" value={Number(stats?.avg_latency_ms ?? 0)} suffix="ms" decimals={1} tone="accent" icon={<Gauge className="h-4 w-4" />} />
        </Stagger>
      )}

      <GatewayLiveFeed live={live} onToggle={setLive} />

      <Panel title="Gateway Rules" subtitle="Evaluated in priority order against live traffic">
        {rulesQ.isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rulesQ.isError ? (
          <ErrorState message={getApiErrorMessage(rulesQ.error)} onRetry={() => rulesQ.refetch()} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<Waypoints className="h-6 w-6" />}
            title="No gateway rules"
            description="Create a rule to start enforcing PII controls on live traffic."
            action={
              <Button onClick={() => { setEditing(null); setRuleModalOpen(true); }}>
                <Plus className="h-4 w-4" /> New Rule
              </Button>
            }
          />
        ) : (
          <DataTable>
            <THead>
              <TH>Rule</TH>
              <TH>Route</TH>
              <TH>Action</TH>
              <TH>PII</TH>
              <TH>Enabled</TH>
              <TH className="text-right">Actions</TH>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="font-mono text-[11px] uppercase text-faint">{r.direction}</p>
                  </TD>
                  <TD><span className="font-mono text-xs text-muted">{r.route_pattern}</span></TD>
                  <TD>
                    <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", ACTION_TONE[r.action])}>
                      {label(GATEWAY_ACTION_LABELS, r.action)}
                    </span>
                  </TD>
                  <TD><PiiTags types={r.pii_types} max={3} /></TD>
                  <TD>
                    <button
                      onClick={() => toggle.mutate(r.id)}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        r.is_active ? "bg-accent/80" : "bg-surface-3",
                      )}
                      aria-label="Toggle rule"
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                          r.is_active ? "translate-x-4" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditing(r); setRuleModalOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" className="text-critical hover:text-critical" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>

      <Panel title="Data Flow Map" subtitle="Where personal data leaves your estate" glow>
        {flowsQ.isLoading ? (
          <div className="h-64 skeleton rounded-lg" />
        ) : (
          <DataFlowMap flows={flows} />
        )}
      </Panel>

      <Panel title="Detected Data Flows" subtitle="Personal data moving to external destinations">
        {flowsQ.isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : flows.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="h-6 w-6" />}
            title="No data flows detected"
            description="Once traffic routes through the gateway, observed flows appear here."
          />
        ) : (
          <DataTable>
            <THead>
              <TH>Destination</TH>
              <TH>PII Involved</TH>
              <TH className="text-right">Events</TH>
              <TH>Status</TH>
              <TH className="text-right">Action</TH>
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
                    {f.is_approved ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-accent">
                        <CheckCircle2 className="h-3.5 w-3.5" /> approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-medium">
                        <Eye className="h-3.5 w-3.5" /> review
                      </span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {!f.is_approved && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(f.id)}
                      >
                        Approve
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>

      <RuleModal open={ruleModalOpen} onOpenChange={setRuleModalOpen} editing={editing} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete gateway rule?"
        description={<><span className="font-medium text-foreground">{deleteTarget?.name}</span> will stop enforcing immediately.</>}
        confirmLabel="Delete rule"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
