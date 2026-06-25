"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Siren, ArrowLeft, Pencil, Landmark, Megaphone, CheckCircle2,
  Download, Trash2, Clock, AlertTriangle, MessageSquarePlus, ShieldCheck,
} from "lucide-react";
import { breachesAPI, type BreachIncident, type UpdateBreachInput } from "@/lib/api/breaches";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { LoadingPanel, ErrorState } from "@/components/common/states";
import { SeverityBadge } from "@/components/common/indicators";
import { BreachStatusPill } from "@/components/breaches/status-pill";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/helpers";

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="w-44 shrink-0 font-mono text-[11px] uppercase tracking-wide text-faint">{label}</span>
      <span className="text-sm text-foreground/90">{children}</span>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items?.length) return <span className="text-faint">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-md border border-border bg-surface-2/60 px-2 py-0.5 text-xs capitalize text-muted">{i}</span>
      ))}
    </span>
  );
}

const TYPE_ICON: Record<string, typeof Siren> = {
  created: Siren,
  status_change: ShieldCheck,
  scope_update: Pencil,
  board_notified: Landmark,
  principals_notified: Megaphone,
  closed: CheckCircle2,
  note: MessageSquarePlus,
};

export default function BreachDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [principalsOpen, setPrincipalsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [note, setNote] = useState("");

  const q = useQuery({ queryKey: ["breach", id], queryFn: () => breachesAPI.get(id).then((r) => r.data) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["breach", id] });
    qc.invalidateQueries({ queryKey: ["breaches"] });
  };

  const addNote = useMutation({
    mutationFn: (n: string) => breachesAPI.addNote(id, n),
    onSuccess: () => { setNote(""); invalidate(); toast.success("Note added"); },
    onError: (e) => toast.error("Could not add note", getApiErrorMessage(e)),
  });

  const exportEvidence = async () => {
    try {
      const res = await breachesAPI.evidence(id);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${res.data.incident.reference}-evidence.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Evidence pack downloaded");
    } catch (e) {
      toast.error("Could not export evidence", getApiErrorMessage(e));
    }
  };

  const remove = useMutation({
    mutationFn: () => breachesAPI.remove(id),
    onSuccess: () => { toast.success("Incident deleted"); router.push("/dashboard/breaches"); },
    onError: (e) => toast.error("Could not delete", getApiErrorMessage(e)),
  });

  if (q.isLoading) return <LoadingPanel label="Loading incident…" />;
  if (q.isError || !q.data) return <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />;

  const b = q.data;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/breaches" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to incidents
      </Link>

      <PageHeader
        eyebrow={b.reference}
        title={b.title}
        description={b.description || "No description recorded."}
        icon={<Siren className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={exportEvidence}><Download className="h-4 w-4" /> Evidence</Button>
            <Can min="analyst"><Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button></Can>
            <Can min="admin">
              {b.status !== "closed" && (
                <Button variant="secondary" onClick={() => setCloseOpen(true)}><CheckCircle2 className="h-4 w-4" /> Close</Button>
              )}
            </Can>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={b.severity} />
        <BreachStatusPill status={b.status} />
        <Chips items={b.categories} empty="" />
      </div>

      {/* Deadline / notification status banner */}
      <DeadlineBanner incident={b} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Scope &amp; impact">
            <div className="divide-y divide-border/60">
              <InfoRow label="Personal data affected"><Chips items={b.affected_data_types} empty="Not yet assessed" /></InfoRow>
              <InfoRow label="Affected principals">{b.affected_principals.toLocaleString()}</InfoRow>
              <InfoRow label="Affected assets">{b.affected_asset_ids?.length || 0}</InfoRow>
              <InfoRow label="Discovered">{formatDateTime(b.discovered_at)}</InfoRow>
              <InfoRow label="Occurred">{b.occurred_at ? formatDateTime(b.occurred_at) : <span className="text-faint">Unknown</span>}</InfoRow>
              <InfoRow label="Reported by">{b.reporter?.full_name || <span className="text-faint">—</span>}</InfoRow>
            </div>
          </Panel>

          <Panel title="Assessment">
            <div className="divide-y divide-border/60">
              <InfoRow label="Root cause">{b.root_cause || <span className="text-faint">Not yet determined</span>}</InfoRow>
              <InfoRow label="Consequences">{b.consequences || <span className="text-faint">Not yet assessed</span>}</InfoRow>
              <InfoRow label="Mitigation taken">{b.mitigation_measures || <span className="text-faint">None recorded</span>}</InfoRow>
              <InfoRow label="Remedial measures">{b.remedial_measures || <span className="text-faint">None recorded</span>}</InfoRow>
            </div>
          </Panel>

          <Panel title="Timeline" subtitle="Immutable evidence trail">
            <ol className="space-y-4 border-l border-border pl-6">
              {(b.timeline ?? []).map((t) => {
                const Icon = TYPE_ICON[t.entry_type] ?? MessageSquarePlus;
                return (
                  <li key={t.id} className="relative">
                    <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg text-accent">
                      <Icon className="h-3 w-3" />
                    </span>
                    <p className="text-sm text-foreground">{t.note}</p>
                    <p className="font-mono text-[11px] text-faint">
                      {formatDateTime(t.created_at)}
                      {t.actor?.full_name ? ` · ${t.actor.full_name}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
            <Can min="analyst">
              <div className="mt-4 flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the timeline…" onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) addNote.mutate(note.trim()); }} />
                <Button disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate(note.trim())}>
                  <MessageSquarePlus className="h-4 w-4" /> Add
                </Button>
              </div>
            </Can>
          </Panel>
        </div>

        {/* Notifications sidebar */}
        <div className="space-y-6">
          <Panel title="Statutory intimations">
            <div className="space-y-4">
              <NotifyBlock
                icon={<Landmark className="h-4 w-4" />}
                title="Data Protection Board"
                done={!!b.board_notified_at}
                doneLabel={b.board_notified_at ? `Intimated ${formatRelativeTime(b.board_notified_at)}` : ""}
                extra={b.board_reference ? `Ref: ${b.board_reference}` : ""}
                deadline={!b.board_notified_at ? b.board_deadline : undefined}
                overdue={b.board_overdue}
                action={
                  <Can min="admin">
                    {!b.board_notified_at && b.status !== "closed" && (
                      <Button size="sm" onClick={() => setBoardOpen(true)}>Mark intimated</Button>
                    )}
                  </Can>
                }
              />
              <NotifyBlock
                icon={<Megaphone className="h-4 w-4" />}
                title="Affected principals"
                done={!!b.principals_notified_at}
                doneLabel={b.principals_notified_at ? `Intimated ${b.principals_notified_count.toLocaleString()} · ${formatRelativeTime(b.principals_notified_at)}` : ""}
                action={
                  <Can min="admin">
                    {!b.principals_notified_at && b.status !== "closed" && (
                      <Button size="sm" onClick={() => setPrincipalsOpen(true)}>Mark intimated</Button>
                    )}
                  </Can>
                }
              />
            </div>
          </Panel>

          <Can min="admin">
            <Panel title="Danger zone">
              <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 text-critical" /> Delete incident
              </Button>
            </Panel>
          </Can>
        </div>
      </div>

      <EditDialog incident={b} open={editOpen} onOpenChange={setEditOpen} onSaved={invalidate} />
      <NotifyBoardDialog id={id} open={boardOpen} onOpenChange={setBoardOpen} onDone={invalidate} />
      <NotifyPrincipalsDialog id={id} suggested={b.affected_principals} open={principalsOpen} onOpenChange={setPrincipalsOpen} onDone={invalidate} />
      <CloseDialog id={id} open={closeOpen} onOpenChange={setCloseOpen} onDone={invalidate} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete incident?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted">This permanently removes the incident and its evidence timeline. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeadlineBanner({ incident: b }: { incident: BreachIncident }) {
  if (b.status === "closed") return null;
  if (b.board_overdue) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-critical/30 bg-critical/10 p-3 text-sm text-critical">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Board intimation overdue</p>
          <p className="text-xs opacity-90">The 72-hour deadline ({formatDateTime(b.board_deadline)}) has passed. Intimate the Data Protection Board immediately.</p>
        </div>
      </div>
    );
  }
  if (!b.board_notified_at) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Board intimation due</p>
          <p className="text-xs opacity-90">Intimate the Data Protection Board by {formatDateTime(b.board_deadline)} (within 72 hours of becoming aware).</p>
        </div>
      </div>
    );
  }
  if (b.principals_pending) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Affected principals not yet intimated</p>
          <p className="text-xs opacity-90">DPDP requires intimating each affected Data Principal without delay.</p>
        </div>
      </div>
    );
  }
  return null;
}

function NotifyBlock({
  icon, title, done, doneLabel, extra, deadline, overdue, action,
}: {
  icon: React.ReactNode; title: string; done: boolean; doneLabel?: string;
  extra?: string; deadline?: string; overdue?: boolean; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
        {done && <CheckCircle2 className="ml-auto h-4 w-4 text-success" />}
      </div>
      {done ? (
        <p className="text-xs text-muted">{doneLabel}{extra ? ` · ${extra}` : ""}</p>
      ) : (
        <div className="space-y-2">
          {deadline && (
            <p className={overdue ? "text-xs font-medium text-critical" : "text-xs text-muted"}>
              {overdue ? "Overdue — " : "Due by "}{formatDateTime(deadline)}
            </p>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

function EditDialog({ incident: b, open, onOpenChange, onSaved }: { incident: BreachIncident; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [status, setStatus] = useState(b.status);
  const [severity, setSeverity] = useState(b.severity);
  const [principals, setPrincipals] = useState(String(b.affected_principals));
  const [dataTypes, setDataTypes] = useState(b.affected_data_types.join(", "));
  const [rootCause, setRootCause] = useState(b.root_cause);
  const [consequences, setConsequences] = useState(b.consequences);
  const [mitigation, setMitigation] = useState(b.mitigation_measures);
  const [remedial, setRemedial] = useState(b.remedial_measures);

  const save = useMutation({
    mutationFn: (data: UpdateBreachInput) => breachesAPI.update(b.id, data),
    onSuccess: () => { onSaved(); onOpenChange(false); toast.success("Incident updated"); },
    onError: (e) => toast.error("Could not update", getApiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Edit incident</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BreachIncident["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="assessing">Assessing</SelectItem>
                  <SelectItem value="contained">Contained</SelectItem>
                  <SelectItem value="notified">Notified</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as BreachIncident["severity"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ed-principals">Affected principals</Label>
              <Input id="ed-principals" type="number" min={0} value={principals} onChange={(e) => setPrincipals(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-types">Personal data affected</Label>
              <Input id="ed-types" value={dataTypes} onChange={(e) => setDataTypes(e.target.value)} placeholder="contact, financial" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-root">Root cause</Label>
            <Textarea id="ed-root" value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-cons">Consequences for principals</Label>
            <Textarea id="ed-cons" value={consequences} onChange={(e) => setConsequences(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-mit">Mitigation taken</Label>
            <Textarea id="ed-mit" value={mitigation} onChange={(e) => setMitigation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-rem">Remedial measures</Label>
            <Textarea id="ed-rem" value={remedial} onChange={(e) => setRemedial(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate({
              status, severity,
              affected_principals: Number(principals) || 0,
              affected_data_types: dataTypes.split(",").map((s) => s.trim()).filter(Boolean),
              root_cause: rootCause, consequences, mitigation_measures: mitigation, remedial_measures: remedial,
            })}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotifyBoardDialog({ id, open, onOpenChange, onDone }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => breachesAPI.notifyBoard(id, { reference: reference.trim() || undefined, note: note.trim() || undefined }),
    onSuccess: () => { onDone(); onOpenChange(false); setReference(""); setNote(""); toast.success("Board intimation recorded"); },
    onError: (e) => toast.error("Could not record", getApiErrorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Board intimation</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted">Confirm that the Data Protection Board has been intimated of this breach.</p>
          <div className="space-y-1.5">
            <Label htmlFor="nb-ref">Acknowledgement reference (optional)</Label>
            <Input id="nb-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="DPB ack / ticket no." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nb-note">Note (optional)</Label>
            <Textarea id="nb-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Recording…" : "Mark intimated"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotifyPrincipalsDialog({ id, suggested, open, onOpenChange, onDone }: { id: string; suggested: number; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [count, setCount] = useState(String(suggested || ""));
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => breachesAPI.notifyPrincipals(id, { count: Number(count) || 0, note: note.trim() || undefined }),
    onSuccess: () => { onDone(); onOpenChange(false); setNote(""); toast.success("Principal intimation recorded"); },
    onError: (e) => toast.error("Could not record", getApiErrorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record principal intimation</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted">Confirm that affected Data Principals have been intimated of this breach.</p>
          <div className="space-y-1.5">
            <Label htmlFor="np-count">Principals intimated</Label>
            <Input id="np-count" type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-note">Note (optional)</Label>
            <Textarea id="np-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Channel used, content summary…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Recording…" : "Mark intimated"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ id, open, onOpenChange, onDone }: { id: string; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => breachesAPI.close(id, note.trim() || undefined),
    onSuccess: () => { onDone(); onOpenChange(false); setNote(""); toast.success("Incident closed"); },
    onError: (e) => toast.error("Could not close", getApiErrorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Close incident</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted">Mark this incident as resolved and documented. The timeline remains as evidence.</p>
          <div className="space-y-1.5">
            <Label htmlFor="cl-note">Closing note (optional)</Label>
            <Textarea id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution summary." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Closing…" : "Close incident"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
