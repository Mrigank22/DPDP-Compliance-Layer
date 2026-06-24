"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  ClipboardCheck,
  Boxes,
  Workflow,
} from "lucide-react";
import {
  aiGovAPI,
  type AISystem,
  type AISystemStage,
  type AIRiskTier,
  type CreateAISystemInput,
} from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, CardSkeleton } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LifecycleDialog } from "@/components/dashboard/ai-lifecycle-dialog";
import { Can } from "@/components/auth/can";
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

const STAGES: AISystemStage[] = ["discovered", "proposed", "under_review", "approved", "retired"];
const TIERS: AIRiskTier[] = ["unassessed", "minimal", "limited", "high", "prohibited"];

const STAGE_LABELS: Record<string, string> = {
  discovered: "Discovered",
  proposed: "Proposed",
  under_review: "Under review",
  approved: "Approved",
  retired: "Retired",
};
const STAGE_TONE: Record<string, string> = {
  discovered: "text-faint border-border bg-surface-3",
  proposed: "text-medium border-medium/30 bg-medium/10",
  under_review: "text-accent-2 border-accent-2/30 bg-accent-2/10",
  approved: "text-success border-success/30 bg-success/10",
  retired: "text-faint border-border bg-surface-3",
};
const RISK_LABELS: Record<string, string> = {
  unassessed: "Unassessed",
  minimal: "Minimal",
  limited: "Limited",
  high: "High",
  prohibited: "Prohibited",
};
const RISK_TONE: Record<string, string> = {
  unassessed: "text-faint border-border bg-surface-3",
  minimal: "text-success border-success/30 bg-success/10",
  limited: "text-medium border-medium/30 bg-medium/10",
  high: "text-high border-high/30 bg-high/10",
  prohibited: "text-critical border-critical/30 bg-critical/10",
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${tone}`}>
      {children}
    </span>
  );
}

function SystemForm({ editing, onClose }: { editing: AISystem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [owner, setOwner] = useState(editing?.owner ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [stage, setStage] = useState<AISystemStage>(editing?.lifecycle_stage ?? "proposed");
  const [tier, setTier] = useState<AIRiskTier>(editing?.risk_tier ?? "unassessed");
  const [providers, setProviders] = useState((editing?.providers ?? []).join(", "));
  const [endpoints, setEndpoints] = useState((editing?.endpoints ?? []).join(", "));

  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: (data: CreateAISystemInput) =>
      editing ? aiGovAPI.updateSystem(editing.id, data) : aiGovAPI.createSystem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "systems"] });
      qc.invalidateQueries({ queryKey: ["ai", "discovery"] });
      toast.success(editing ? "System updated" : "System created");
      onClose();
    },
    onError: (e) => toast.error("Could not save", getApiErrorMessage(e)),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit AI system" : "New AI system"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support copilot" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-owner">Owner (team or person)</Label>
          <Input id="s-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Customer Success" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-desc">Description</Label>
          <Textarea id="s-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this AI system does and the data it processes" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Lifecycle stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as AISystemStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Risk tier (EU AI Act)</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as AIRiskTier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => (
                  <SelectItem key={t} value={t}>{RISK_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-prov">Providers</Label>
          <Input id="s-prov" value={providers} onChange={(e) => setProviders(e.target.value)} placeholder="openai, anthropic" />
          <p className="text-[11px] text-faint">Comma-separated.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-end">Endpoints</Label>
          <Input id="s-end" className="font-mono text-sm" value={endpoints} onChange={(e) => setEndpoints(e.target.value)} placeholder="api.openai.com" />
          <p className="text-[11px] text-faint">Comma-separated hosts/URLs.</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() =>
            save.mutate({
              name: name.trim(),
              owner: owner.trim(),
              description: description.trim(),
              lifecycle_stage: stage,
              risk_tier: tier,
              providers: toList(providers),
              endpoints: toList(endpoints),
            })
          }
          disabled={!name.trim() || save.isPending}
        >
          {save.isPending ? "Saving…" : editing ? "Save changes" : "Create system"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function AISystemsPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AISystem | null>(null);
  const [deleting, setDeleting] = useState<AISystem | null>(null);
  const [managing, setManaging] = useState<AISystem | null>(null);

  const q = useQuery({
    queryKey: ["ai", "systems"],
    queryFn: () => aiGovAPI.listSystems().then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => aiGovAPI.deleteSystem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "systems"] });
      qc.invalidateQueries({ queryKey: ["ai", "discovery"] });
      toast.success("AI system deleted");
      setDeleting(null);
    },
    onError: (e) => toast.error("Could not delete", getApiErrorMessage(e)),
  });

  const systems = q.data?.systems ?? [];
  const underReview = systems.filter((s) => s.lifecycle_stage === "under_review").length;
  const approved = systems.filter((s) => s.lifecycle_stage === "approved").length;
  const modelsLinked = systems.reduce((n, s) => n + (s.models?.length ?? 0), 0);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: AISystem) => {
    setEditing(s);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Governance"
        title="AI systems"
        description="The inventory of AI applications under governance — their owners, lifecycle stage and EU AI Act risk tier."
        icon={<Brain className="h-5 w-5" />}
        actions={
          <Can min="analyst">
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> New system
            </Button>
          </Can>
        }
      />

      {q.isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="AI systems" value={systems.length} icon={<Brain className="h-4 w-4" />} />
          <StatCard label="Under review" value={underReview} tone="medium" icon={<ClipboardCheck className="h-4 w-4" />} />
          <StatCard label="Approved" value={approved} tone="low" icon={<ShieldCheck className="h-4 w-4" />} />
          <StatCard label="Models linked" value={modelsLinked} icon={<Boxes className="h-4 w-4" />} />
        </div>
      )}

      <Panel title={`Registered systems${systems.length ? ` (${systems.length})` : ""}`}>
        {q.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : q.isError ? (
          <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : systems.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-5 w-5" />}
            title="No AI systems registered"
            description="Register a system here, or promote observed usage from AI Discovery to bring shadow AI under governance."
            action={<Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New system</Button>}
            className="border-0 bg-transparent py-10"
          />
        ) : (
          <DataTable>
            <THead>
              <TH>System</TH>
              <TH>Owner</TH>
              <TH>Stage</TH>
              <TH>Risk tier</TH>
              <TH>Providers</TH>
              <TH className="text-right">Models</TH>
              <TH />
            </THead>
            <TBody>
              {systems.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <div className="leading-tight">
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.description && (
                        <div className="max-w-md truncate text-xs text-faint">{s.description}</div>
                      )}
                    </div>
                  </TD>
                  <TD><span className="text-sm text-muted">{s.owner || "—"}</span></TD>
                  <TD><Pill tone={STAGE_TONE[s.lifecycle_stage]}>{STAGE_LABELS[s.lifecycle_stage]}</Pill></TD>
                  <TD><Pill tone={RISK_TONE[s.risk_tier]}>{RISK_LABELS[s.risk_tier]}</Pill></TD>
                  <TD>
                    {s.providers.length ? (
                      <span className="font-mono text-xs text-muted">{s.providers.join(", ")}</span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{s.models?.length ?? 0}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setManaging(s)} aria-label="Manage lifecycle">
                        <Workflow className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(s)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5 text-critical" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </Panel>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        {formOpen && <SystemForm editing={editing} onClose={() => setFormOpen(false)} />}
      </Dialog>

      <Dialog open={!!managing} onOpenChange={(o) => !o && setManaging(null)}>
        {managing && <LifecycleDialog system={managing} onClose={() => setManaging(null)} />}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete AI system?"
        description={
          deleting ? (
            <>Removing <span className="font-medium text-foreground">{deleting.name}</span> detaches its catalog models but keeps observed usage. This cannot be undone.</>
          ) : undefined
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}
