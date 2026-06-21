"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2,
  Users,
  Database,
  Bug,
  Radar,
  ShieldCheck,
  Activity,
  Power,
  Loader2,
  QrCode,
} from "lucide-react";
import { adminAPI } from "@/lib/api/admin";
import { useAdminStore } from "@/lib/store/admin.store";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function StatTile({
  label,
  value,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: number | string;
  icon: typeof Building2;
  tone?: "accent" | "danger" | "muted";
}) {
  const toneCls =
    tone === "danger" ? "text-danger" : tone === "muted" ? "text-faint" : "text-accent";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{label}</p>
        <Icon className={`h-4 w-4 ${toneCls}`} />
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const admin = useAdminStore((s) => s.admin);
  const setAdmin = useAdminStore((s) => s.setAdmin);

  const statsQ = useQuery({ queryKey: ["admin", "stats"], queryFn: () => adminAPI.stats().then((r) => r.data) });
  const s = statsQ.data;

  // MFA enrollment
  const [enroll, setEnroll] = useState<{ otpauth_url: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const beginMFA = useMutation({
    mutationFn: () => adminAPI.beginMFA().then((r) => r.data),
    onSuccess: (d) => setEnroll(d),
    onError: (e) => toast.error("Could not start MFA setup", getApiErrorMessage(e)),
  });
  const verifyMFA = useMutation({
    mutationFn: () => adminAPI.verifyMFA(code),
    onSuccess: () => {
      toast.success("MFA enabled", "Your account is now protected with 2FA.");
      setEnroll(null);
      setCode("");
      if (admin) setAdmin({ ...admin, mfa_enabled: true });
    },
    onError: (e) => toast.error("Verification failed", getApiErrorMessage(e)),
  });

  return (
    <div className="space-y-7">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Platform Control</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          Vendor-level visibility and control across every tenant, service and data set.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tenants" value={s?.total_tenants ?? "—"} icon={Building2} />
        <StatTile label="Active" value={s?.active_tenants ?? "—"} icon={Activity} />
        <StatTile label="Suspended" value={s?.suspended_tenants ?? "—"} icon={Power} tone={s && s.suspended_tenants > 0 ? "danger" : "muted"} />
        <StatTile label="Platform admins" value={s?.platform_admins ?? "—"} icon={ShieldCheck} />
        <StatTile label="Users" value={s?.total_users ?? "—"} icon={Users} />
        <StatTile label="Assets" value={s?.total_assets ?? "—"} icon={Database} />
        <StatTile label="Findings" value={s?.total_findings ?? "—"} icon={Bug} />
        <StatTile label="Scans" value={s?.total_scans ?? "—"} icon={Radar} />
      </div>

      {/* Security / MFA */}
      <div className="panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h2 className="font-display text-sm font-semibold text-foreground">Your account security</h2>
        </div>

        {admin?.mfa_enabled ? (
          <p className="text-sm text-muted">
            Multi-factor authentication is{" "}
            <span className="font-semibold text-success">enabled</span> on your account.
          </p>
        ) : enroll ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Scan this URL with your authenticator app (or enter the secret manually), then confirm the 6-digit code.
            </p>
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="flex items-center gap-2 font-mono text-[11px] text-faint">
                <QrCode className="h-3.5 w-3.5" /> SECRET
              </p>
              <p className="mt-1 break-all font-mono text-[13px] text-accent">{enroll.secret}</p>
              <p className="mt-2 break-all font-mono text-[10px] text-faint">{enroll.otpauth_url}</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code">Authenticator code</Label>
                <Input
                  id="mfa-code"
                  value={code}
                  inputMode="numeric"
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  className="w-36 font-mono tracking-[0.3em]"
                />
              </div>
              <Button onClick={() => verifyMFA.mutate()} disabled={verifyMFA.isPending || code.length < 6}>
                {verifyMFA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted">
              MFA is <span className="font-semibold text-warning">not enabled</span>. Strongly recommended for super-admin accounts.
            </p>
            <Button variant="outline" onClick={() => beginMFA.mutate()} disabled={beginMFA.isPending}>
              {beginMFA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable MFA"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
