"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Plus,
  LayoutTemplate,
  Power,
  PowerOff,
  Pencil,
  Trash2,
  Search,
  Layers,
} from "lucide-react";
import { policiesAPI, PolicyTemplate } from "@/lib/api/policies";
import type {
  Policy,
  CreatePolicyInput,
  PolicyListFilter,
} from "@/types/api";
import { POLICY_TYPES, ENFORCEMENT_MODES, POLICY_STATUSES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader } from "@/components/common/panel";
import { EmptyState, ErrorState, CardSkeleton, LoadingPanel } from "@/components/common/states";
import { StatusPill } from "@/components/common/indicators";
import { Stagger } from "@/components/common/reveal";
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
import { POLICY_TYPE_LABELS, label } from "@/lib/utils/labels";

const ENFORCEMENT_TONE: Record<string, string> = {
  enforce: "text-critical border-critical/30 bg-critical/10",
  alert: "text-medium border-medium/30 bg-medium/10",
  audit_only: "text-low border-low/30 bg-low/10",
};

const DEFAULT_RULES = `{
  "name": "Mask Aadhaar in API responses",
  "enabled": true,
  "conditions": {
    "operator": "AND",
    "predicates": [
      { "field": "pii_type", "operator": "in", "value": ["AADHAAR", "PAN"] }
    ]
  },
  "action": { "type": "mask", "config": { "preserve_last": 4 } }
}`;

function PolicyForm({
  editing,
  onClose,
}: {
  editing: Policy | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [policyType, setPolicyType] = useState<string>(editing?.policy_type ?? "data_masking");
  const [enforcement, setEnforcement] = useState<string>(editing?.enforcement_mode ?? "alert");
  const [priority, setPriority] = useState(editing?.priority ?? 100);
  const [rules, setRules] = useState(
    editing?.rules && Object.keys(editing.rules).length
      ? JSON.stringify(editing.rules, null, 2)
      : DEFAULT_RULES,
  );
  const [rulesError, setRulesError] = useState("");

  const save = useMutation({
    mutationFn: (data: CreatePolicyInput) =>
      editing
        ? policiesAPI.update(editing.id, data)
        : policiesAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success(editing ? "Policy updated" : "Policy created");
      onClose();
    },
    onError: (e) => toast.error("Could not save policy", getApiErrorMessage(e)),
  });

  const submit = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rules);
      setRulesError("");
    } catch {
      setRulesError("Rules must be valid JSON.");
      return;
    }
    save.mutate({
      name,
      description,
      policy_type: policyType as CreatePolicyInput["policy_type"],
      enforcement_mode: enforcement as CreatePolicyInput["enforcement_mode"],
      priority,
      rules: parsed,
    });
  };

  return (
    <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit policy" : "New policy"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mask Aadhaar in responses" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this policy enforces" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={policyType} onValueChange={setPolicyType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POLICY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{label(POLICY_TYPE_LABELS, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Enforcement</Label>
            <Select value={enforcement} onValueChange={setEnforcement}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENFORCEMENT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-prio">Priority (lower = higher)</Label>
            <Input
              id="p-prio"
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 100)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-rules">Rule DSL (JSON)</Label>
            <Textarea
              id="p-rules"
              className="min-h-[180px] font-mono text-xs"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
            {rulesError && <p className="text-xs text-critical">{rulesError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name || save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}

function PolicyEditor({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Policy | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PolicyForm
          key={editing?.id ?? "new"}
          editing={editing}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function TemplatesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const templatesQ = useQuery({
    queryKey: ["policies", "templates"],
    queryFn: () => policiesAPI.getTemplates().then((r) => r.data),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: (id: string) => policiesAPI.applyTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Template applied", "A new policy has been provisioned.");
    },
    onError: (e) => toast.error("Could not apply template", getApiErrorMessage(e)),
  });

  const templates: PolicyTemplate[] = templatesQ.data?.templates ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compliance template library</DialogTitle>
        </DialogHeader>
        {templatesQ.isLoading ? (
          <CardSkeleton count={4} />
        ) : templates.length === 0 ? (
          <EmptyState title="No templates available" className="border-0 bg-transparent" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4 text-accent" />
                  <p className="font-display text-sm font-semibold text-foreground">{t.name}</p>
                </div>
                <p className="flex-1 text-xs text-muted">{t.description}</p>
                <div className="flex items-center justify-between">
                  {t.pack && (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                      {t.pack}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(t.id)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PoliciesPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading policies…" />}>
      <PoliciesContent />
    </Suspense>
  );
}

function PoliciesContent() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(sp.get("action") === "new");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);

  const filters: PolicyListFilter = useMemo(
    () => ({
      page,
      page_size: 12,
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [page, search, statusFilter],
  );

  const policiesQ = useQuery({
    queryKey: ["policies", filters],
    queryFn: () => policiesAPI.list(filters),
  });

  const toggle = useMutation({
    mutationFn: (p: Policy) =>
      p.status === "active" ? policiesAPI.deactivate(p.id) : policiesAPI.activate(p.id),
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success(p.status === "active" ? "Policy deactivated" : "Policy activated");
    },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => policiesAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Could not delete policy", getApiErrorMessage(e)),
  });

  const policies = policiesQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Enforcement"
        title="Policies"
        description="Codify how personal data is masked, blocked or tokenized across your estate."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="h-4 w-4" /> Templates
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Policy
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Search policies…"
            className="h-9 w-56 pl-8 text-sm"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
          <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {POLICY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {policiesQ.isLoading ? (
        <CardSkeleton count={6} />
      ) : policiesQ.isError ? (
        <ErrorState message={getApiErrorMessage(policiesQ.error)} onRetry={() => policiesQ.refetch()} />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="No policies yet"
          description="Apply a DPDP/RBI template or author your own enforcement rule."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate className="h-4 w-4" /> Browse templates
              </Button>
              <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
                <Plus className="h-4 w-4" /> New policy
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {policies.map((p) => (
              <div
                key={p.id}
                data-reveal
                className="group flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-bright"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-semibold text-foreground">
                      {p.name}
                    </h3>
                    <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                      {label(POLICY_TYPE_LABELS, p.policy_type)} · v{p.version}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </div>
                <p className="mb-3 line-clamp-2 flex-1 text-sm text-muted">
                  {p.description || "No description provided."}
                </p>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                      ENFORCEMENT_TONE[p.enforcement_mode] ?? "text-muted border-border"
                    }`}
                  >
                    {p.enforcement_mode.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
                    priority {p.priority}
                  </span>
                </div>
                <div className="flex items-center gap-1 border-t border-border pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(p)}
                  >
                    {p.status === "active" ? (
                      <><PowerOff className="h-3.5 w-3.5" /> Deactivate</>
                    ) : (
                      <><Power className="h-3.5 w-3.5" /> Activate</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    onClick={() => { setEditing(p); setEditorOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    className="text-critical hover:text-critical"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Stagger>
          <Pager pagination={policiesQ.data?.meta?.pagination} onPageChange={setPage} />
        </>
      )}

      <PolicyEditor open={editorOpen} onOpenChange={setEditorOpen} editing={editing} />
      <TemplatesModal open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete policy?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> will be
            removed and stop enforcing. This cannot be undone.
          </>
        }
        confirmLabel="Delete policy"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
