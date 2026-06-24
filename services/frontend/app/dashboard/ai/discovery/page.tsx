"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ScanSearch,
  Brain,
  ShieldAlert,
  ShieldCheck,
  Boxes,
  Building2,
  PlusCircle,
} from "lucide-react";
import {
  aiGovAPI,
  type AIDiscoveryRow,
  type PromoteAIInput,
} from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import { PiiTags } from "@/components/common/indicators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PERIODS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "90 days", hours: 2160 },
] as const;

function titleCase(s: string): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PromoteDialog({
  row,
  onClose,
}: {
  row: AIDiscoveryRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");

  // Re-seed the name when a new row is opened.
  const seedName = row?.app || row?.model || "";
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (row && seededFor !== `${row.provider}|${row.model}|${row.app}`) {
    setSeededFor(`${row.provider}|${row.model}|${row.app}`);
    setName(seedName);
    setOwner("");
    setDescription("");
  }

  const promote = useMutation({
    mutationFn: (input: PromoteAIInput) => aiGovAPI.promote(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "discovery"] });
      qc.invalidateQueries({ queryKey: ["ai", "systems"] });
      qc.invalidateQueries({ queryKey: ["ai", "models"] });
      toast.success("AI system registered", "It now appears under AI Systems for review.");
      onClose();
    },
    onError: (e) => toast.error("Could not register", getApiErrorMessage(e)),
  });

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register AI system</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm">
            <div className="flex items-center gap-2 text-foreground">
              <Brain className="h-4 w-4 text-accent" />
              <span className="font-mono">{titleCase(row.provider)} · {row.model || "unknown model"}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Promoting this observed usage creates a governed AI system and adds the model to your catalog.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-name">System name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support copilot" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-owner">Owner (team or person)</Label>
            <Input id="p-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Customer Success" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this AI system is used for" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              promote.mutate({
                provider: row.provider,
                model: row.model,
                name: name.trim(),
                owner: owner.trim() || undefined,
                description: description.trim() || undefined,
                endpoint: row.destination_url || undefined,
              })
            }
            disabled={!name.trim() || promote.isPending}
          >
            {promote.isPending ? "Registering…" : "Register system"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AIDiscoveryPage() {
  const [hours, setHours] = useState(720);
  const [promoteRow, setPromoteRow] = useState<AIDiscoveryRow | null>(null);

  const q = useQuery({
    queryKey: ["ai", "discovery", hours],
    queryFn: () => aiGovAPI.discover(hours).then((r) => r.data),
  });

  const data = q.data;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        title="AI discovery"
        description="Every model your applications call through the gateway — registered systems and unsanctioned “shadow AI”, with the personal data flowing to each."
        icon={<ScanSearch className="h-5 w-5" />}
        actions={
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.hours} value={String(p.hours)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {q.isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Models seen" value={data?.total_models ?? 0} icon={<Boxes className="h-4 w-4" />} />
          <StatCard label="Shadow AI" value={data?.shadow_models ?? 0} tone="critical" icon={<ShieldAlert className="h-4 w-4" />} />
          <StatCard label="Registered" value={data?.registered_models ?? 0} tone="low" icon={<ShieldCheck className="h-4 w-4" />} />
          <StatCard label="Providers" value={data?.provider_count ?? 0} icon={<Building2 className="h-4 w-4" />} />
        </div>
      )}

      <Panel title="Observed AI usage" subtitle="Aggregated from gateway traffic in the selected window">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : q.isError ? (
          <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-5 w-5" />}
            title="No AI usage observed yet"
            description="Route your application's LLM calls through the gateway (X-Upstream-URL). Calls appear here automatically, with shadow AI flagged."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <DataTable>
            <THead>
              <TH>Model</TH>
              <TH>App</TH>
              <TH className="text-right">Calls</TH>
              <TH>Personal data</TH>
              <TH className="text-right">Sources</TH>
              <TH>Last seen</TH>
              <TH>Status</TH>
              <TH />
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={`${r.provider}|${r.model}|${r.app}`}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Brain className={`h-4 w-4 ${r.registered ? "text-accent" : "text-critical"}`} />
                      <div className="leading-tight">
                        <div className="font-medium text-foreground">{r.model || "unknown model"}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-faint">{titleCase(r.provider)}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="font-mono text-xs text-muted">{r.app || "—"}</span>
                  </TD>
                  <TD className="text-right tabular-nums">{r.call_count.toLocaleString("en-IN")}</TD>
                  <TD>
                    {r.pii_call_count > 0 ? (
                      <div className="space-y-1">
                        <PiiTags types={r.pii_types} max={4} />
                        <div className="font-mono text-[10px] text-high">
                          {r.pii_call_count.toLocaleString("en-IN")} call{r.pii_call_count > 1 ? "s" : ""} with PII
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-faint">none detected</span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{r.source_count.toLocaleString("en-IN")}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{fmtDate(r.last_seen)}</TD>
                  <TD>
                    {r.registered ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-success">
                        <ShieldCheck className="h-3 w-3" /> registered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-critical/30 bg-critical/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-critical">
                        <ShieldAlert className="h-3 w-3" /> shadow AI
                      </span>
                    )}
                  </TD>
                  <TD>
                    {!r.registered && (
                      <Button size="sm" variant="ghost" onClick={() => setPromoteRow(r)}>
                        <PlusCircle className="mr-1 h-3.5 w-3.5" /> Register
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>

      <PromoteDialog row={promoteRow} onClose={() => setPromoteRow(null)} />
    </div>
  );
}
