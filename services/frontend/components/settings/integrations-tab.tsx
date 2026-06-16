"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  Trash2,
  Send,
  Copy,
  Check,
  MessageSquare,
  Webhook as WebhookIcon,
  Mail,
  Siren,
  Ticket,
  BellRing,
  Server,
} from "lucide-react";
import { webhooksAPI } from "@/lib/api/webhooks";
import type {
  Webhook,
  CreateWebhookInput,
  NotificationPrefs,
  WebhookCreateResult,
} from "@/types/api";
import { WEBHOOK_CHANNELS, ALERT_TYPES, SEVERITY_LEVELS } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Panel } from "@/components/common/panel";
import { TableSkeleton, EmptyState } from "@/components/common/states";
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
import { ALERT_TYPE_LABELS, label } from "@/lib/utils/labels";

const CHANNEL_META: Record<string, { icon: typeof Plug; label: string; needsUrl: boolean }> = {
  slack: { icon: MessageSquare, label: "Slack", needsUrl: true },
  pagerduty: { icon: Siren, label: "PagerDuty", needsUrl: true },
  jira: { icon: Ticket, label: "JIRA", needsUrl: true },
  http: { icon: WebhookIcon, label: "HTTP Webhook", needsUrl: true },
  email: { icon: Mail, label: "Email", needsUrl: false },
};

function isResult(v: Webhook | WebhookCreateResult): v is WebhookCreateResult {
  return (v as WebhookCreateResult).webhook !== undefined;
}

function AddWebhookModal({
  open,
  onOpenChange,
  onSecret,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSecret: (secret: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AddWebhookForm onClose={() => onOpenChange(false)} onSecret={onSecret} />}
    </Dialog>
  );
}

function AddWebhookForm({
  onClose,
  onSecret,
}: {
  onClose: () => void;
  onSecret: (secret: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("slack");
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);

  const meta = CHANNEL_META[channel];

  const create = useMutation({
    mutationFn: (data: CreateWebhookInput) => webhooksAPI.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Integration connected");
      if (isResult(res.data) && res.data.signing_secret) {
        onSecret(res.data.signing_secret);
      }
      onClose();
    },
    onError: (e) => toast.error("Could not connect", getApiErrorMessage(e)),
  });

  const toggleEvent = (ev: string) =>
    setEvents((cur) => {
      if (ev === "*") return ["*"];
      const without = cur.filter((x) => x !== "*");
      return without.includes(ev) ? without.filter((x) => x !== ev) : [...without, ev];
    });

  return (
    <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an integration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <div className="grid grid-cols-5 gap-2">
              {WEBHOOK_CHANNELS.map((ch) => {
                const m = CHANNEL_META[ch];
                const Icon = m.icon;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-colors",
                      channel === ch
                        ? "border-accent/50 bg-accent/12 text-accent"
                        : "border-border bg-surface-2 text-faint hover:text-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-mono text-[9px] uppercase">{m.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Name</Label>
            <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SOC Slack channel" />
          </div>

          {meta.needsUrl ? (
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">{meta.label} URL</Label>
              <Input
                id="wh-url"
                className="font-mono text-xs"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="wh-email">Email recipient</Label>
              <Input id="wh-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="soc@company.in" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Trigger on</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => toggleEvent("*")}
                className={cn(
                  "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors",
                  events.includes("*")
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-border bg-surface-2 text-faint hover:text-muted",
                )}
              >
                All alerts
              </button>
              {ALERT_TYPES.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors",
                    events.includes(ev)
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-border bg-surface-2 text-faint hover:text-muted",
                  )}
                >
                  {label(ALERT_TYPE_LABELS, ev)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={
              !name ||
              events.length === 0 ||
              (meta.needsUrl ? !url : !email) ||
              create.isPending
            }
            onClick={() =>
              create.mutate({
                name,
                channel: channel as CreateWebhookInput["channel"],
                url: meta.needsUrl ? url : undefined,
                email: meta.needsUrl ? undefined : email,
                events,
              })
            }
          >
            {create.isPending ? "Connecting…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!secret) return null;
  return (
    <Dialog open={!!secret} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Webhook signing secret</DialogTitle></DialogHeader>
        <p className="text-sm text-muted">
          Use this to verify the <code className="font-mono text-accent">X-DataSentinel-Signature</code> HMAC.
          It will <span className="text-critical">not be shown again</span>.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-2 p-3">
          <code className="flex-1 break-all font-mono text-xs text-accent">{secret}</code>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(secret);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotificationPrefsCard() {
  const prefsQ = useQuery({
    queryKey: ["webhooks", "prefs"],
    queryFn: () => webhooksAPI.getPrefs().then((r) => r.data),
  });

  return (
    <Panel title="Notification Preferences" subtitle="When and how alerts reach your team">
      {prefsQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-16 skeleton rounded-lg" />
          <div className="h-16 skeleton rounded-lg" />
        </div>
      ) : (
        <PrefsForm initial={prefsQ.data} />
      )}
    </Panel>
  );
}

function PrefsForm({ initial }: { initial?: NotificationPrefs }) {
  const qc = useQueryClient();
  const [minSeverity, setMinSeverity] = useState(initial?.min_severity || "high");
  const [recipients, setRecipients] = useState((initial?.email_recipients ?? []).join(", "));
  const [escalation, setEscalation] = useState(initial?.escalation_hours || 4);

  const save = useMutation({
    mutationFn: (data: NotificationPrefs) => webhooksAPI.updatePrefs(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks", "prefs"] });
      toast.success("Preferences saved");
    },
    onError: (e) => toast.error("Could not save preferences", getApiErrorMessage(e)),
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Minimum severity</Label>
          <Select value={minSeverity} onValueChange={setMinSeverity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITY_LEVELS.map((s) => (
                <SelectItem key={s} value={s}>{s} and above</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="escalation">Escalate unacked critical after (hrs)</Label>
          <Input
            id="escalation"
            type="number"
            min={1}
            value={escalation}
            onChange={(e) => setEscalation(Number(e.target.value) || 4)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipients">Email recipients (comma-separated)</Label>
          <Input
            id="recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="dpo@company.in, soc@company.in"
          />
        </div>
      </div>
      <div className="mt-4">
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              min_severity: minSeverity,
              email_recipients: recipients.split(",").map((s) => s.trim()).filter(Boolean),
              escalation_hours: escalation,
              slack_channel: initial?.slack_channel ?? "",
              quiet_hours_start: initial?.quiet_hours_start ?? "",
              quiet_hours_end: initial?.quiet_hours_end ?? "",
              escalation_emails: initial?.escalation_emails ?? [],
            })
          }
        >
          <BellRing className="h-4 w-4" /> Save preferences
        </Button>
      </div>
    </>
  );
}

export function IntegrationsTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const webhooksQ = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => webhooksAPI.list().then((r) => r.data),
  });

  const toggle = useMutation({
    mutationFn: (w: Webhook) => webhooksAPI.update(w.id, { is_active: !w.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (e) => toast.error("Toggle failed", getApiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => webhooksAPI.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Integration removed");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Could not remove", getApiErrorMessage(e)),
  });

  const runTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await webhooksAPI.test(id);
      if (res.data?.success) toast.success("Test delivered", res.data.message);
      else toast.error("Test failed", res.data?.error || res.data?.message);
    } catch (e) {
      toast.error("Test failed", getApiErrorMessage(e));
    } finally {
      setTesting(null);
    }
  };

  const webhooks = webhooksQ.data ?? [];

  return (
    <div className="space-y-6">
      <Panel
        title="Notification Channels"
        subtitle="Route alerts to Slack, PagerDuty, JIRA, email or your own endpoint"
        actions={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Connect</Button>}
      >
        {webhooksQ.isLoading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : webhooks.length === 0 ? (
          <EmptyState
            icon={<Plug className="h-6 w-6" />}
            title="No integrations yet"
            description="Connect a channel so your team is notified the moment something matters."
            action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Connect channel</Button>}
          />
        ) : (
          <div className="space-y-2">
            {webhooks.map((w) => {
              const m = CHANNEL_META[w.channel] ?? CHANNEL_META.http;
              const Icon = m.icon;
              return (
                <div key={w.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{w.name}</p>
                    <p className="truncate font-mono text-[11px] text-faint">
                      {m.label} · {w.events.includes("*") ? "all alerts" : `${w.events.length} event(s)`}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle.mutate(w)}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                      w.is_active ? "bg-accent/80" : "bg-surface-3",
                    )}
                    aria-label="Toggle"
                  >
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", w.is_active ? "translate-x-4" : "translate-x-0.5")} />
                  </button>
                  {(w.channel === "http" || w.channel === "slack") && (
                    <Button variant="ghost" size="icon" title="Send test" disabled={testing === w.id} onClick={() => runTest(w.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="Remove" className="text-critical hover:text-critical" onClick={() => setDeleteTarget(w)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <NotificationPrefsCard />

      <Panel title="Private Deployment">
        <div className="space-y-3 text-sm text-muted">
          <p>
            Run DataSentinel inside your own VPC for full data sovereignty. The control plane,
            gateway, workers and dashboard ship as containers with a Helm chart for AWS EKS
            (Mumbai region).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Server className="h-4 w-4 text-faint" />
            {["docker-compose", "helm/datasentinel", "ap-south-1"].map((t) => (
              <span key={t} className="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-muted">{t}</span>
            ))}
          </div>
        </div>
      </Panel>

      <AddWebhookModal open={addOpen} onOpenChange={setAddOpen} onSecret={setSecret} />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Remove integration?"
        description={<><span className="font-medium text-foreground">{deleteTarget?.name}</span> will stop receiving notifications.</>}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}
