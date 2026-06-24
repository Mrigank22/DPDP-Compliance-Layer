"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes, Brain, Building2, Link2, Activity } from "lucide-react";
import { aiGovAPI } from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";

function titleCase(s: string): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AIModelCatalogPage() {
  const models = useQuery({
    queryKey: ["ai", "models"],
    queryFn: () => aiGovAPI.listModels().then((r) => r.data),
  });
  const systems = useQuery({
    queryKey: ["ai", "systems"],
    queryFn: () => aiGovAPI.listSystems().then((r) => r.data),
  });

  const list = models.data?.models ?? [];
  const systemName = new Map((systems.data?.systems ?? []).map((s) => [s.id, s.name]));

  const linked = list.filter((m) => m.ai_system_id).length;
  const providers = new Set(list.map((m) => m.provider.toLowerCase())).size;
  const totalCalls = list.reduce((n, m) => n + (m.call_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        title="Model catalog"
        description="The catalog of provider models your AI systems use — registered from discovery or added when you register a system."
        icon={<Boxes className="h-5 w-5" />}
      />

      {models.isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Catalog models" value={list.length} icon={<Boxes className="h-4 w-4" />} />
          <StatCard label="Linked to a system" value={linked} tone="low" icon={<Link2 className="h-4 w-4" />} />
          <StatCard label="Providers" value={providers} icon={<Building2 className="h-4 w-4" />} />
          <StatCard label="Total calls" value={totalCalls} icon={<Activity className="h-4 w-4" />} />
        </div>
      )}

      <Panel title={`Models${list.length ? ` (${list.length})` : ""}`}>
        {models.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : models.isError ? (
          <ErrorState message={getApiErrorMessage(models.error)} onRetry={() => models.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No models in the catalog yet"
            description="Models are added when you register a system, or when you promote observed usage from AI Discovery."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <DataTable>
            <THead>
              <TH>Model</TH>
              <TH>Provider</TH>
              <TH>System</TH>
              <TH>Source</TH>
              <TH className="text-right">Calls</TH>
              <TH>Last seen</TH>
            </THead>
            <TBody>
              {list.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-accent" />
                      <span className="font-medium text-foreground">{m.display_name || m.model}</span>
                    </div>
                  </TD>
                  <TD><span className="font-mono text-xs text-muted">{titleCase(m.provider)}</span></TD>
                  <TD>
                    {m.ai_system_id ? (
                      <span className="text-sm text-foreground/90">{systemName.get(m.ai_system_id) ?? "—"}</span>
                    ) : (
                      <span className="text-xs text-faint">unlinked</span>
                    )}
                  </TD>
                  <TD>
                    <span className="inline-flex items-center rounded-md border border-border bg-surface-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      {m.source}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums">{(m.call_count ?? 0).toLocaleString("en-IN")}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{fmtDate(m.last_seen_at)}</TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
