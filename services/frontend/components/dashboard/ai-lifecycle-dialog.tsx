"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, History, CircleCheck, RefreshCw, Archive, Send } from "lucide-react";
import {
  aiGovAPI,
  type AISystem,
  type LifecycleAction,
} from "@/lib/api/ai-governance";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/common/states";

const STAGE_LABELS: Record<string, string> = {
  discovered: "Discovered",
  proposed: "Proposed",
  under_review: "Under review",
  approved: "Approved",
  retired: "Retired",
};

const ACTION_LABELS: Record<LifecycleAction, string> = {
  submit_review: "Submitted for review",
  approve: "Approved",
  mark_reviewed: "Reviewed",
  retire: "Retired",
  reopen: "Reopened",
};

const ACTIONS_BY_STAGE: Record<string, LifecycleAction[]> = {
  discovered: ["submit_review"],
  proposed: ["submit_review"],
  under_review: ["approve", "retire"],
  approved: ["mark_reviewed", "reopen", "retire"],
  retired: ["reopen"],
};

const ACTION_META: Record<
  LifecycleAction,
  { label: string; needsStatement: boolean; variant: "default" | "ghost"; icon: typeof Send }
> = {
  submit_review: { label: "Submit for review", needsStatement: false, variant: "default", icon: Send },
  approve: { label: "Approve", needsStatement: true, variant: "default", icon: CircleCheck },
  mark_reviewed: { label: "Mark reviewed", needsStatement: true, variant: "default", icon: ShieldCheck },
  reopen: { label: "Reopen", needsStatement: false, variant: "ghost", icon: RefreshCw },
  retire: { label: "Retire", needsStatement: false, variant: "ghost", icon: Archive },
};

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LifecycleDialog({ system, onClose }: { system: AISystem; onClose: () => void }) {
  const qc = useQueryClient();
  const [statement, setStatement] = useState("");

  const attestationsQ = useQuery({
    queryKey: ["ai", "attestations", system.id],
    queryFn: () => aiGovAPI.listAttestations(system.id).then((r) => r.data.attestations),
  });

  const transition = useMutation({
    mutationFn: (action: LifecycleAction) =>
      aiGovAPI.transition(system.id, { action, statement }),
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ["ai", "systems"] });
      qc.invalidateQueries({ queryKey: ["ai", "risk-register"] });
      qc.invalidateQueries({ queryKey: ["ai", "attestations", system.id] });
      toast.success(ACTION_LABELS[action]);
      setStatement("");
      onClose();
    },
    onError: (e) => toast.error("Transition failed", getApiErrorMessage(e)),
  });

  const actions = ACTIONS_BY_STAGE[system.lifecycle_stage] ?? [];
  const needsStatement = actions.some((a) => ACTION_META[a].needsStatement);

  const run = (action: LifecycleAction) => {
    if (ACTION_META[action].needsStatement && !statement.trim()) {
      toast.error("Attestation required", "Add a short statement before you approve or review.");
      return;
    }
    transition.mutate(action);
  };

  const attestations = attestationsQ.data ?? [];

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Lifecycle · {system.name}</DialogTitle>
      </DialogHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wide text-faint">Stage</div>
          <div className="mt-0.5 font-medium text-foreground">{STAGE_LABELS[system.lifecycle_stage] ?? system.lifecycle_stage}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wide text-faint">Review due</div>
          <div className="mt-0.5 font-medium text-foreground">{system.review_due_at ? fmtDateTime(system.review_due_at) : "—"}</div>
        </div>
      </div>

      {needsStatement && (
        <div className="mb-3 space-y-1.5">
          <label className="text-xs font-medium text-muted">
            Oversight attestation
            <span className="ml-1 text-faint">(required to approve or review)</span>
          </label>
          <Textarea
            rows={2}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="e.g. Human oversight, data governance and required controls are in place for this system."
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {actions.length === 0 ? (
          <span className="text-sm text-faint">No lifecycle actions available.</span>
        ) : (
          actions.map((a) => {
            const meta = ACTION_META[a];
            const Icon = meta.icon;
            return (
              <Button key={a} variant={meta.variant} disabled={transition.isPending} onClick={() => run(a)}>
                <Icon className="mr-1 h-4 w-4" /> {meta.label}
              </Button>
            );
          })
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-faint">
          <History className="h-3.5 w-3.5" /> Attestation history
        </div>
        {attestationsQ.isLoading ? (
          <TableSkeleton rows={3} cols={1} />
        ) : attestations.length === 0 ? (
          <p className="py-3 text-sm italic text-faint">No transitions yet.</p>
        ) : (
          <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {attestations.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-surface-2/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{ACTION_LABELS[a.action] ?? a.action}</span>
                  <span className="font-mono text-[10px] text-faint">{fmtDateTime(a.created_at)}</span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-faint">
                  {STAGE_LABELS[a.from_stage] ?? a.from_stage} → {STAGE_LABELS[a.to_stage] ?? a.to_stage}
                  {a.actor?.full_name ? ` · ${a.actor.full_name}` : ""}
                </div>
                {a.statement && <p className="mt-1.5 text-xs text-muted">“{a.statement}”</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </DialogContent>
  );
}
