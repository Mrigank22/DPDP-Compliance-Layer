"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  ShieldCheck,
  ClipboardCheck,
  Gauge,
  ListChecks,
} from "lucide-react";
import {
  aiGovAPI,
  type RiskRegisterRow,
  type Framework,
  type FrameworkControl,
  type AIAssessment,
  type ControlStatus,
} from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TIER_LABELS: Record<string, string> = {
  unassessed: "Unassessed",
  minimal: "Minimal",
  limited: "Limited",
  high: "High",
  prohibited: "Prohibited",
};

const STATUS_OPTIONS: { value: ControlStatus; label: string }[] = [
  { value: "unanswered", label: "—" },
  { value: "met", label: "Met" },
  { value: "partial", label: "Partial" },
  { value: "not_met", label: "Not met" },
  { value: "not_applicable", label: "N/A" },
];

function riskTone(score: number): string {
  if (score >= 70) return "text-critical";
  if (score >= 50) return "text-high";
  if (score >= 25) return "text-medium";
  return "text-low";
}

type RespMap = Record<string, { status: ControlStatus; note: string }>;

function computeReadiness(controls: FrameworkControl[], responses: RespMap): number {
  let applicable = 0;
  let met = 0;
  for (const c of controls) {
    const st = responses[c.id]?.status ?? "unanswered";
    if (st === "not_applicable") continue;
    applicable++;
    if (st === "met") met += 1;
    else if (st === "partial") met += 0.5;
  }
  if (applicable === 0) return 100;
  return Math.round((met / applicable) * 100);
}

function groupByCategory(controls: FrameworkControl[]): [string, FrameworkControl[]][] {
  const map = new Map<string, FrameworkControl[]>();
  for (const c of controls) {
    const arr = map.get(c.category) ?? [];
    arr.push(c);
    map.set(c.category, arr);
  }
  return Array.from(map.entries());
}

/** Editable assessment for a single framework; state seeded from props via key. */
function FrameworkEditor({
  systemId,
  framework,
  controls,
  initial,
  initialStatus,
  onSaved,
}: {
  systemId: string;
  framework: string;
  controls: FrameworkControl[];
  initial: RespMap;
  initialStatus: AIAssessment["status"];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [responses, setResponses] = useState<RespMap>(initial);
  const [status, setStatus] = useState<AIAssessment["status"]>(initialStatus);

  const setStatusFor = (id: string, s: ControlStatus) =>
    setResponses((r) => ({ ...r, [id]: { status: s, note: r[id]?.note ?? "" } }));
  const setNoteFor = (id: string, note: string) =>
    setResponses((r) => ({ ...r, [id]: { status: r[id]?.status ?? "unanswered", note } }));

  const readiness = computeReadiness(controls, responses);

  const save = useMutation({
    mutationFn: () =>
      aiGovAPI.upsertAssessment(systemId, framework, {
        status,
        responses: controls.map((c) => ({
          control_id: c.id,
          status: responses[c.id]?.status ?? "unanswered",
          note: responses[c.id]?.note ?? "",
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "risk-register"] });
      qc.invalidateQueries({ queryKey: ["ai", "assessments", systemId] });
      toast.success("Assessment saved");
      onSaved();
    },
    onError: (e) => toast.error("Could not save assessment", getApiErrorMessage(e)),
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-surface-2/50 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-faint">Readiness</span>
        <span className={`font-display text-lg font-bold ${riskTone(100 - readiness)}`}>{readiness}%</span>
      </div>

      <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
        {groupByCategory(controls).map(([category, list]) => (
          <div key={category}>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent/80">{category}</p>
            <div className="space-y-2">
              {list.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-surface-2/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        <span className="font-mono text-[11px] text-faint">{c.ref}</span> · {c.title}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{c.description}</p>
                    </div>
                    <div className="w-32 shrink-0">
                      <Select
                        value={responses[c.id]?.status ?? "unanswered"}
                        onValueChange={(v) => setStatusFor(c.id, v as ControlStatus)}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Input
                    className="mt-2 h-7 text-xs"
                    placeholder="Note (optional)"
                    value={responses[c.id]?.note ?? ""}
                    onChange={(e) => setNoteFor(c.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <DialogFooter className="mt-3 items-center gap-2 sm:justify-between">
        <div className="w-40">
          <Select value={status} onValueChange={(v) => setStatus(v as AIAssessment["status"])}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save assessment"}
        </Button>
      </DialogFooter>
    </>
  );
}

function AssessmentDialog({
  systemId,
  systemName,
  onClose,
}: {
  systemId: string;
  systemName: string;
  onClose: () => void;
}) {
  const frameworksQ = useQuery({
    queryKey: ["ai", "frameworks"],
    queryFn: () => aiGovAPI.frameworks().then((r) => r.data.frameworks),
  });
  const assessmentsQ = useQuery({
    queryKey: ["ai", "assessments", systemId],
    queryFn: () => aiGovAPI.listAssessments(systemId).then((r) => r.data.assessments),
  });

  const frameworks = frameworksQ.data ?? [];
  const [framework, setFramework] = useState<string>("");
  const activeFw: Framework | undefined =
    frameworks.find((f) => f.id === framework) ?? frameworks[0];

  const existing = (assessmentsQ.data ?? []).find((a) => a.framework === activeFw?.id);
  const initial: RespMap = {};
  if (existing) {
    for (const r of existing.responses) initial[r.control_id] = { status: r.status, note: r.note };
  }

  const loading = frameworksQ.isLoading || assessmentsQ.isLoading;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Assess · {systemName}</DialogTitle>
      </DialogHeader>

      {loading ? (
        <TableSkeleton rows={5} cols={2} />
      ) : frameworks.length === 0 ? (
        <EmptyState title="No frameworks available" className="border-0 bg-transparent py-8" />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">Framework</span>
            <div className="w-56">
              <Select value={activeFw?.id ?? ""} onValueChange={setFramework}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {frameworks.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeFw && (
            <FrameworkEditor
              key={activeFw.id + (existing?.updated_at ?? "new")}
              systemId={systemId}
              framework={activeFw.id}
              controls={activeFw.controls}
              initial={initial}
              initialStatus={existing?.status ?? "in_progress"}
              onSaved={onClose}
            />
          )}
        </>
      )}
    </DialogContent>
  );
}

export default function AIRiskRegisterPage() {
  const [assessing, setAssessing] = useState<{ id: string; name: string } | null>(null);

  const q = useQuery({
    queryKey: ["ai", "risk-register"],
    queryFn: () => aiGovAPI.riskRegister().then((r) => r.data),
  });

  const rows = q.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        title="Risk register"
        description="Each AI system's residual risk after framework controls — NIST AI RMF, EU AI Act, ISO 42001 and DPDP."
        icon={<ShieldAlert className="h-5 w-5" />}
      />

      {q.isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="AI systems" value={q.data?.total_systems ?? 0} icon={<ShieldCheck className="h-4 w-4" />} />
          <StatCard label="Assessed" value={q.data?.assessed_systems ?? 0} tone="low" icon={<ClipboardCheck className="h-4 w-4" />} />
          <StatCard label="High residual risk" value={q.data?.high_risk ?? 0} tone="critical" icon={<ShieldAlert className="h-4 w-4" />} />
          <StatCard label="Avg residual" value={q.data?.avg_residual ?? 0} tone="medium" icon={<Gauge className="h-4 w-4" />} />
        </div>
      )}

      <Panel title={`Systems${rows.length ? ` (${rows.length})` : ""}`}>
        {q.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : q.isError ? (
          <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-5 w-5" />}
            title="No AI systems to assess"
            description="Register AI systems (or promote shadow AI), then assess them against your frameworks here."
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <DataTable>
            <THead>
              <TH>System</TH>
              <TH>Risk tier</TH>
              <TH className="text-right">Inherent</TH>
              <TH className="text-right">Readiness</TH>
              <TH className="text-right">Residual</TH>
              <TH className="text-right">Frameworks</TH>
              <TH className="text-right">Gaps</TH>
              <TH />
            </THead>
            <TBody>
              {rows.map((r: RiskRegisterRow) => (
                <TR key={r.ai_system_id}>
                  <TD>
                    <div className="leading-tight">
                      <div className="font-medium text-foreground">{r.name}</div>
                      {r.owner && <div className="text-xs text-faint">{r.owner}</div>}
                    </div>
                  </TD>
                  <TD>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {TIER_LABELS[r.risk_tier] ?? r.risk_tier}
                    </span>
                  </TD>
                  <TD className="text-right tabular-nums text-muted">{r.inherent_risk}</TD>
                  <TD className="text-right tabular-nums">{r.readiness}%</TD>
                  <TD className={`text-right font-display font-bold tabular-nums ${riskTone(r.residual_risk)}`}>
                    {r.residual_risk}
                  </TD>
                  <TD className="text-right tabular-nums">{r.frameworks_assessed}</TD>
                  <TD className="text-right tabular-nums">
                    {r.gaps > 0 ? <span className="text-high">{r.gaps}</span> : "—"}
                  </TD>
                  <TD className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAssessing({ id: r.ai_system_id, name: r.name })}>
                      <ListChecks className="mr-1 h-3.5 w-3.5" /> Assess
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>

      <Dialog open={!!assessing} onOpenChange={(o) => !o && setAssessing(null)}>
        {assessing && (
          <AssessmentDialog
            systemId={assessing.id}
            systemName={assessing.name}
            onClose={() => setAssessing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
