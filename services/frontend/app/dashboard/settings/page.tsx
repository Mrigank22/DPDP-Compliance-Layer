"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Users,
  KeyRound,
  Plug,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  ScanSearch,
} from "lucide-react";
import { teamAPI } from "@/lib/api/team";
import { apiKeysAPI } from "@/lib/api/apikeys";
import { authAPI } from "@/lib/api/auth";
import type { User, APIKey, APIKeyCreateResponse, InviteUserInput } from "@/types/api";
import { ROLES, API_KEY_SCOPES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { useAuthStore } from "@/lib/store/auth.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { DetectionTab } from "@/components/settings/detection-tab";
import { SSOTab } from "@/components/settings/sso-tab";
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
import { formatRelativeTime } from "@/lib/utils/helpers";

/* ───────────────────────── Profile ───────────────────────── */
function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const change = useMutation({
    mutationFn: () =>
      authAPI.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      toast.success("Password updated");
      setCurrent("");
      setNext("");
    },
    onError: (e) => toast.error("Could not update password", getApiErrorMessage(e)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Operator Profile">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 font-display text-xl font-bold text-accent">
              {(user?.full_name || user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-foreground">
                {user?.full_name || "—"}
              </p>
              <p className="font-mono text-xs text-faint">{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Role</p>
              <p className="text-sm font-medium capitalize text-foreground">{user?.role}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-faint">MFA</p>
              <p className={cn("text-sm font-medium", user?.mfa_enabled ? "text-accent" : "text-medium")}>
                {user?.mfa_enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Change Password">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="text-[11px] text-faint">Minimum 8 characters with mixed case and numbers.</p>
          </div>
          <Button
            disabled={!current || next.length < 8 || change.isPending}
            onClick={() => change.mutate()}
          >
            <ShieldCheck className="h-4 w-4" /> Update password
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ───────────────────────── Team ───────────────────────── */
function InviteModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("viewer");

  const invite = useMutation({
    mutationFn: (data: InviteUserInput) => authAPI.inviteUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Invitation sent", `${email} has been invited.`);
      setEmail(""); setName("");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not invite", getApiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Invite team member</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="i-email">Email</Label>
            <Input id="i-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.in" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Full name</Label>
            <Input id="i-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["admin", "analyst", "viewer"].map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!email || !name || invite.isPending}
            onClick={() => invite.mutate({ email, full_name: name, role: role as InviteUserInput["role"] })}
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);

  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => teamAPI.list() });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      teamAPI.update(id, { role: role as User["role"] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Role updated");
    },
    onError: (e) => toast.error("Could not update role", getApiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => teamAPI.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Member removed");
      setRemoveTarget(null);
    },
    onError: (e) => toast.error("Could not remove member", getApiErrorMessage(e)),
  });

  const members = teamQ.data?.data ?? [];

  return (
    <Panel
      title="Team Members"
      actions={<Button size="sm" onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" /> Invite</Button>}
    >
      {teamQ.isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : teamQ.isError ? (
        <ErrorState message={getApiErrorMessage(teamQ.error)} onRetry={() => teamQ.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No team members" />
      ) : (
        <DataTable>
          <THead>
            <TH>Member</TH>
            <TH>Role</TH>
            <TH>Last Login</TH>
            <TH className="text-right">Actions</TH>
          </THead>
          <TBody>
            {members.map((m) => {
              const isSelf = m.id === currentUser?.id;
              return (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 font-display text-xs font-bold text-accent">
                        {(m.full_name || m.email).slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium text-foreground">{m.full_name || "—"}</p>
                        <p className="font-mono text-[11px] text-faint">{m.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    {isSelf || m.role === "owner" ? (
                      <Badge variant="default" className="capitalize">{m.role}</Badge>
                    ) : (
                      <Select value={m.role} onValueChange={(v) => updateRole.mutate({ id: m.id, role: v })}>
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.filter((r) => r !== "owner").map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-muted">
                    {m.last_login_at ? formatRelativeTime(m.last_login_at) : "never"}
                  </TD>
                  <TD className="text-right">
                    {!isSelf && m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-critical hover:text-critical"
                        title="Remove"
                        onClick={() => setRemoveTarget(m)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </DataTable>
      )}

      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title="Remove member?"
        description={<><span className="font-medium text-foreground">{removeTarget?.email}</span> will lose access to this workspace.</>}
        confirmLabel="Remove member"
        loading={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
      />
    </Panel>
  );
}

/* ───────────────────────── API Keys ───────────────────────── */
function CreatedKeyModal({ keyData, onClose }: { keyData: APIKeyCreateResponse | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!keyData) return null;
  return (
    <Dialog open={!!keyData} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>API key created</DialogTitle></DialogHeader>
        <p className="text-sm text-muted">
          Copy this key now — it will <span className="text-critical">never be shown again</span>.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-2 p-3">
          <code className="flex-1 break-all font-mono text-xs text-accent">{keyData.key}</code>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(keyData.key);
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

function ApiKeysTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [createdKey, setCreatedKey] = useState<APIKeyCreateResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<APIKey | null>(null);

  const keysQ = useQuery({ queryKey: ["apikeys"], queryFn: () => apiKeysAPI.list() });

  const create = useMutation({
    mutationFn: () => apiKeysAPI.create({ name, scopes }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["apikeys"] });
      setCreatedKey(res.data);
      setCreateOpen(false);
      setName("");
      setScopes(["read"]);
    },
    onError: (e) => toast.error("Could not create key", getApiErrorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiKeysAPI.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apikeys"] });
      toast.success("API key revoked");
      setRevokeTarget(null);
    },
    onError: (e) => toast.error("Could not revoke key", getApiErrorMessage(e)),
  });

  const keys = keysQ.data?.data ?? [];
  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <Panel
      title="API Keys"
      subtitle="Programmatic access for the gateway and integrations"
      actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Key</Button>}
    >
      {keysQ.isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : keysQ.isError ? (
        <ErrorState message={getApiErrorMessage(keysQ.error)} onRetry={() => keysQ.refetch()} />
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-6 w-6" />} title="No API keys" description="Create a key to authenticate machine callers." />
      ) : (
        <DataTable>
          <THead>
            <TH>Name</TH>
            <TH>Key</TH>
            <TH>Scopes</TH>
            <TH>Last Used</TH>
            <TH className="text-right">Actions</TH>
          </THead>
          <TBody>
            {keys.map((k) => (
              <TR key={k.id}>
                <TD className="font-medium text-foreground">{k.name}</TD>
                <TD><code className="font-mono text-xs text-muted">{k.key_prefix}••••••••</code></TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <span key={s} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">{s}</span>
                    ))}
                  </div>
                </TD>
                <TD className="font-mono text-xs text-muted">
                  {k.last_used_at ? formatRelativeTime(k.last_used_at) : "never"}
                </TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-critical hover:text-critical"
                    title="Revoke"
                    onClick={() => setRevokeTarget(k)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create API key</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="k-name">Name</Label>
              <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gateway sync key" />
            </div>
            <div className="space-y-1.5">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-1.5">
                {API_KEY_SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
                      scopes.includes(s)
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-border bg-surface-2 text-faint hover:text-muted",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!name || scopes.length === 0 || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatedKeyModal keyData={createdKey} onClose={() => setCreatedKey(null)} />
      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(v) => !v && setRevokeTarget(null)}
        title="Revoke API key?"
        description={<>Callers using <span className="font-medium text-foreground">{revokeTarget?.name}</span> will immediately lose access.</>}
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget.id)}
      />
    </Panel>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage your profile, team, API access and integrations."
        icon={<SettingsIcon className="h-5 w-5" />}
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile"><UserIcon className="h-4 w-4" /> Profile</TabsTrigger>
          <TabsTrigger value="team"><Users className="h-4 w-4" /> Team</TabsTrigger>
          <TabsTrigger value="apikeys"><KeyRound className="h-4 w-4" /> API Keys</TabsTrigger>
          <TabsTrigger value="detection"><ScanSearch className="h-4 w-4" /> Detection</TabsTrigger>
          <TabsTrigger value="sso"><ShieldCheck className="h-4 w-4" /> SSO</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="h-4 w-4" /> Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="apikeys"><ApiKeysTab /></TabsContent>
        <TabsContent value="detection"><DetectionTab /></TabsContent>
        <TabsContent value="sso"><SSOTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
