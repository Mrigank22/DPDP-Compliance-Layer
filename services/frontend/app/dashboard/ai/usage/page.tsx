"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Activity, Cpu, Boxes, Building2, Brain } from "lucide-react";
import { aiGovAPI } from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


const PERIODS = [
  { label: "Last 24 hours", value: "24" },
  { label: "Last 7 days", value: "168" },
  { label: "Last 30 days", value: "720" },
  { label: "Last 90 days", value: "2160" },
];

function fmtNum(n?: number): string {
  return (n ?? 0).toLocaleString("en-IN");
}

function usd(n?: number): string {
  const v = n ?? 0;
  if (v === 0) return "$0";
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function titleCase(s: string): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AIUsagePage() {
  const [hours, setHours] = useState("720");

  const q = useQuery({
    queryKey: ["ai", "usage", hours],
    queryFn: () => aiGovAPI.usage(Number(hours)).then((r) => r.data),
  });

  const u = q.data;
  const byModel = u?.by_model ?? [];
  const byApp = u?.by_app ?? [];
  const timeline = u?.timeline ?? [];
  const maxTokens = Math.max(1, ...timeline.map((t) => t.total_tokens));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        title="Usage & cost"
        description="Token consumption and estimated spend across every model and application — built from the calls the gateway inspects."
        icon={<Coins className="h-5 w-5" />}
        actions={
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {q.isLoading ? (
        <CardSkeleton />
      ) : q.isError ? (
        <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="LLM calls" value={u?.total_calls ?? 0} icon={<Activity className="h-4 w-4" />} />
            <StatCard label="Total tokens" value={u?.total_tokens ?? 0} icon={<Cpu className="h-4 w-4" />} />
            <StatCard label="Est. cost (USD)" value={u?.estimated_cost_usd ?? 0} decimals={2} tone="medium" icon={<Coins className="h-4 w-4" />} />
            <StatCard label="Active models" value={u?.model_count ?? 0} icon={<Boxes className="h-4 w-4" />} />
          </div>

          <p className="-mt-2 text-xs text-faint">
            Costs are <strong>estimates</strong> from public list prices and may differ from your billed amount.
          </p>

          {timeline.length > 1 && (
            <Panel title="Daily tokens" subtitle="Total tokens per day">
              <div className="flex h-32 items-end gap-1">
                {timeline.map((t) => (
                  <div key={t.date} className="group flex flex-1 flex-col items-center justify-end" title={`${t.date}: ${fmtNum(t.total_tokens)} tokens`}>
                    <div
                      className="w-full rounded-t bg-accent/40 transition-colors group-hover:bg-accent/70"
                      style={{ height: `${Math.max(2, (t.total_tokens / maxTokens) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`By model${byModel.length ? ` (${byModel.length})` : ""}`}>
              {byModel.length === 0 ? (
                <EmptyState
                  icon={<Brain className="h-5 w-5" />}
                  title="No usage in this period"
                  description="Route LLM calls through the gateway to capture token usage and cost."
                  className="border-0 bg-transparent py-8"
                />
              ) : (
                <DataTable>
                  <THead>
                    <TH>Model</TH>
                    <TH className="text-right">Calls</TH>
                    <TH className="text-right">Tokens</TH>
                    <TH className="text-right">Est. cost</TH>
                  </THead>
                  <TBody>
                    {byModel.map((m) => (
                      <TR key={`${m.provider}/${m.model}`}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-accent" />
                            <div className="leading-tight">
                              <div className="font-medium text-foreground">{m.model || "unknown"}</div>
                              <div className="font-mono text-[10px] uppercase tracking-wide text-faint">
                                {titleCase(m.provider)}{!m.priced && " · est. rate"}
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums">{fmtNum(m.calls)}</TD>
                        <TD className="text-right tabular-nums">{fmtNum(m.total_tokens)}</TD>
                        <TD className="text-right tabular-nums">{usd(m.estimated_cost_usd)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              )}
            </Panel>

            <Panel title={`By application${byApp.length ? ` (${byApp.length})` : ""}`}>
              {byApp.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-5 w-5" />}
                  title="No attributed usage"
                  description="Send the X-AI-App header through the gateway to attribute spend to each application."
                  className="border-0 bg-transparent py-8"
                />
              ) : (
                <DataTable>
                  <THead>
                    <TH>Application</TH>
                    <TH className="text-right">Calls</TH>
                    <TH className="text-right">Tokens</TH>
                    <TH className="text-right">Est. cost</TH>
                  </THead>
                  <TBody>
                    {byApp.map((a) => (
                      <TR key={a.app}>
                        <TD>
                          <span className={a.app === "unattributed" ? "italic text-faint" : "text-foreground/90"}>
                            {a.app}
                          </span>
                        </TD>
                        <TD className="text-right tabular-nums">{fmtNum(a.calls)}</TD>
                        <TD className="text-right tabular-nums">{fmtNum(a.total_tokens)}</TD>
                        <TD className="text-right tabular-nums">{usd(a.estimated_cost_usd)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </DataTable>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
