"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2, Users, Copy, RefreshCw } from "lucide-react";
import { authAPI, type SSOConnection, type UpsertSSOInput } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Panel } from "@/components/common/panel";
import { LoadingPanel, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
const REDIRECT_URI = `${API_BASE}/auth/sso/callback`;
const SCIM_BASE_URL = `${API_BASE.replace(/\/api\/v1$/, "")}/scim/v2`;

function copyToClipboard(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error("Could not copy to clipboard"));
}

function SSOForm({ initial, onSaved }: { initial: SSOConnection; onSaved: () => void }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [issuer, setIssuer] = useState(initial.issuer_url);
  const [clientId, setClientId] = useState(initial.client_id);
  const [secret, setSecret] = useState("");
  const [domains, setDomains] = useState(initial.email_domains.join(", "));
  const [role, setRole] = useState<UpsertSSOInput["default_role"]>(initial.default_role);
  const [autoProvision, setAutoProvision] = useState(initial.auto_provision);

  const save = useMutation({
    mutationFn: (data: UpsertSSOInput) => authAPI.updateSSO(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SSO settings saved");
      setSecret("");
      onSaved();
    },
    onError: (e) => toast.error("Could not save SSO", getApiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => authAPI.deleteSSO(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SSO connection removed");
      onSaved();
    },
    onError: (e) => toast.error("Could not remove SSO", getApiErrorMessage(e)),
  });

  const submit = () => {
    const payload: UpsertSSOInput = {
      enabled,
      issuer_url: issuer.trim(),
      client_id: clientId.trim(),
      email_domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
      default_role: role,
      auto_provision: autoProvision,
    };
    if (secret.trim()) payload.client_secret = secret.trim();
    save.mutate(payload);
  };

  return (
    <Panel
      title="Enterprise SSO (OIDC)"
      subtitle="Let your team sign in with your identity provider (Okta, Microsoft Entra, Google, Ping)."
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
          <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Enable SSO for this workspace</p>
            <p className="text-xs text-muted">
              When enabled, users on your verified domains can sign in via your provider.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Redirect URI (add this to your IdP)</Label>
          <Input readOnly value={REDIRECT_URI} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <p className="text-[11px] text-faint">Register this as an allowed redirect/callback URL in your OIDC app.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sso-issuer">Issuer URL</Label>
            <Input id="sso-issuer" className="font-mono text-sm" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://your-org.okta.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sso-client">Client ID</Label>
            <Input id="sso-client" className="font-mono text-sm" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="0oa1b2c3..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sso-secret">Client secret</Label>
          <Input
            id="sso-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={initial.client_secret_set ? "•••••••• (configured — leave blank to keep)" : "Paste the OIDC client secret"}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sso-domains">Email domains</Label>
          <Input id="sso-domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="acme.com, acme.co.in" />
          <p className="text-[11px] text-faint">Comma-separated. Users with these email domains are routed to your IdP.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default role for new users</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UpsertSSOInput["default_role"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
              <Checkbox checked={autoProvision} onChange={(e) => setAutoProvision(e.target.checked)} />
              <span className="text-sm text-foreground">Auto-provision new users on first login</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {initial.issuer_url ? (
            <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4 text-critical" /> Remove SSO
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save SSO settings"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function SSOTab() {
  const q = useQuery({
    queryKey: ["sso"],
    queryFn: () => authAPI.getSSO().then((r) => r.data),
  });

  if (q.isLoading) return <LoadingPanel label="Loading SSO settings…" />;
  if (q.isError || !q.data)
    return <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <ShieldCheck className="h-4 w-4 text-accent" />
        Single sign-on with your corporate identity provider via OpenID Connect.
      </div>
      <SSOForm key={JSON.stringify(q.data)} initial={q.data} onSaved={() => q.refetch()} />
      <ScimSection conn={q.data} onChanged={() => q.refetch()} />
    </div>
  );
}

function ScimSection({ conn, onChanged }: { conn: SSOConnection; onChanged: () => void }) {
  const [newToken, setNewToken] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () => authAPI.generateScimToken().then((r) => r.data),
    onSuccess: (data) => {
      setNewToken(data.token);
      toast.success("SCIM token generated", "Copy it now — it won't be shown again.");
      onChanged();
    },
    onError: (e) => toast.error("Could not generate token", getApiErrorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: () => authAPI.revokeScimToken(),
    onSuccess: () => {
      setNewToken(null);
      toast.success("SCIM provisioning disabled");
      onChanged();
    },
    onError: (e) => toast.error("Could not disable SCIM", getApiErrorMessage(e)),
  });

  return (
    <Panel
      title="Automated user provisioning (SCIM 2.0)"
      subtitle="Let your identity provider create, update and deactivate users automatically."
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-accent" />
          <span className="text-muted">Status:</span>
          {conn.scim_enabled && conn.scim_token_set ? (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Active</span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Not configured</span>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>SCIM base URL (set this in your IdP)</Label>
          <div className="flex gap-2">
            <Input readOnly value={SCIM_BASE_URL} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={() => copyToClipboard(SCIM_BASE_URL, "SCIM base URL")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-faint">
            Configure SSO above first. Your IdP authenticates with the bearer token below.
          </p>
        </div>

        {newToken && (
          <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <Label>New SCIM bearer token</Label>
            <div className="flex gap-2">
              <Input readOnly value={newToken} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" onClick={() => copyToClipboard(newToken, "SCIM token")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-warning">
              Copy this now — for security it is shown only once and cannot be retrieved later.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {conn.scim_token_set ? (
            <Button variant="ghost" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
              <Trash2 className="h-4 w-4 text-critical" /> Disable SCIM
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <RefreshCw className="h-4 w-4" />
            {conn.scim_token_set ? "Regenerate token" : "Generate token"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

