"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Share2,
  Database,
  ArrowRight,
  Brain,
  Cloud,
  Globe,
  Server,
  Mail,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { lineageAPI, type LineageAsset, type LineageDestination } from "@/lib/api/lineage";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { LoadingPanel, ErrorState, EmptyState } from "@/components/common/states";
import { ASSET_TYPE_LABELS, PII_LABELS, label } from "@/lib/utils/labels";

function riskTone(score: number): string {
  if (score >= 75) return "text-critical";
  if (score >= 50) return "text-high";
  if (score >= 25) return "text-medium";
  return "text-low";
}

function DestIcon({ type, className }: { type: string; className?: string }) {
  const t = (type || "").toLowerCase();
  if (t.includes("llm")) return <Brain className={className} />;
  if (t.includes("storage")) return <Cloud className={className} />;
  if (t.includes("email")) return <Mail className={className} />;
  if (t.includes("api")) return <Globe className={className} />;
  return <Server className={className} />;
}

function PiiChips({ types }: { types: string[] }) {
  if (!types || types.length === 0) {
    return <span className="font-mono text-[10px] text-faint">no PII detected</span>;
  }
  const shown = types.slice(0, 6);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
        >
          {label(PII_LABELS, t)}
        </span>
      ))}
      {types.length > shown.length && (
        <span className="font-mono text-[10px] text-faint">+{types.length - shown.length}</span>
      )}
    </div>
  );
}

function AssetCard({ a }: { a: LineageAsset }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">{a.name}</span>
        </div>
        <span className={`font-display text-sm font-bold ${riskTone(a.risk_score)}`}>{a.risk_score}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-faint">
        {label(ASSET_TYPE_LABELS, a.asset_type)} · {a.provider}
        {a.flow_count > 0 ? ` · ${a.flow_count} flow${a.flow_count > 1 ? "s" : ""}` : ""}
      </div>
      <div className="mt-2">
        <PiiChips types={a.pii_types} />
      </div>
    </div>
  );
}

function DestinationCard({ d }: { d: LineageDestination }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        d.approved ? "border-border bg-surface-2/40" : "border-critical/40 bg-critical/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <DestIcon type={d.destination_type} className="h-4 w-4 text-muted" />
          <span className="truncate text-sm font-medium text-foreground">{d.host}</span>
        </div>
        {d.approved ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> approved
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-critical">
            <ShieldAlert className="h-3.5 w-3.5" /> review
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-faint">
        {d.destination_type.replace("_", " ")}
        {d.external ? " · external" : " · internal"} · {d.event_count.toLocaleString()} events
      </div>
      <div className="mt-2">
        <PiiChips types={d.pii_types} />
      </div>
    </div>
  );
}

export default function LineagePage() {
  const q = useQuery({
    queryKey: ["lineage"],
    queryFn: () => lineageAPI.get().then((r) => r.data),
  });

  if (q.isLoading) return <LoadingPanel label="Building lineage graph…" />;
  if (q.isError)
    return <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />;

  const graph = q.data;
  const s = graph?.summary;
  const assets = graph?.assets ?? [];
  const destinations = graph?.destinations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Lineage"
        title="Personal-data lineage"
        description="Where personal data lives across your estate and where it flows — the inventory joined to observed egress."
        icon={<Share2 className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Data assets" value={s?.asset_count ?? 0} icon={<Database className="h-4 w-4" />} />
        <StatCard label="Observed flows" value={s?.flow_count ?? 0} tone="low" icon={<Share2 className="h-4 w-4" />} />
        <StatCard label="External destinations" value={s?.external_destinations ?? 0} tone="medium" icon={<Globe className="h-4 w-4" />} />
        <StatCard label="Flows to review" value={s?.unapproved_flows ?? 0} tone="critical" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      {assets.length === 0 && destinations.length === 0 ? (
        <Panel title="Lineage">
          <EmptyState
            title="No lineage yet"
            description="Connect and scan assets to map where personal data lives, and route traffic through the gateway to capture where it flows."
            className="border-0 bg-transparent py-10"
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Panel title={`Data assets (${assets.length})`} subtitle="Where personal data is stored">
            <div className="space-y-2">
              {assets.length === 0 ? (
                <p className="py-4 text-sm italic text-faint">No assets connected.</p>
              ) : (
                assets.map((a) => <AssetCard key={a.id} a={a} />)
              )}
            </div>
          </Panel>

          <div className="hidden items-center justify-center lg:flex">
            <div className="flex flex-col items-center gap-2 text-faint">
              <ArrowRight className="h-6 w-6" />
              <span className="rotate-90 whitespace-nowrap font-mono text-[10px] uppercase tracking-widest lg:rotate-0">
                flows to
              </span>
            </div>
          </div>

          <Panel title={`Destinations (${destinations.length})`} subtitle="Where personal data is sent">
            <div className="space-y-2">
              {destinations.length === 0 ? (
                <p className="py-4 text-sm italic text-faint">
                  No egress flows observed yet. Route traffic through the gateway to populate this.
                </p>
              ) : (
                destinations.map((d) => <DestinationCard key={d.key} d={d} />)
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
