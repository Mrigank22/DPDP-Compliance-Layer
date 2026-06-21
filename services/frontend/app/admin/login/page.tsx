"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2, Lock, KeyRound } from "lucide-react";
import { adminAPI } from "@/lib/api/admin";
import { useAdminStore } from "@/lib/store/admin.store";
import { getApiErrorMessage, getApiErrorCode } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const { setAuth, loadFromStorage, isAuthenticated, hydrated } = useAdminStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (hydrated && isAuthenticated) router.replace("/admin");
  }, [hydrated, isAuthenticated, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await adminAPI.login(email, password, totp || undefined);
      const payload = res.data;
      setAuth(payload.admin, payload.access_token, payload.expires_in);
      router.replace("/admin");
    } catch (err) {
      if (getApiErrorCode(err) === "mfa_required") {
        setMfaRequired(true);
        setError("Enter the 6-digit code from your authenticator app.");
      } else {
        setError(getApiErrorMessage(err, "Sign-in failed."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none fixed inset-0 bg-radial-glow" />

      <div className="panel panel-glow relative w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/40 bg-accent/10">
            <ShieldAlert className="h-5 w-5 text-accent" />
          </span>
          <div className="leading-tight">
            <h1 className="font-display text-lg font-bold tracking-tight text-foreground">
              Platform Console
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              DataSentinel · Super-admin
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
          <p className="text-[12px] leading-relaxed text-muted">
            Elevated access to every tenant, service and data set. All actions are
            audited.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@datasentinel.io"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-9"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {mfaRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="totp">Authenticator code</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  className="pl-9 font-mono tracking-[0.3em]"
                  placeholder="000000"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Authenticating…
              </>
            ) : (
              "Enter console →"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center font-mono text-[11px] text-faint">
          No super-admin yet? Run{" "}
          <span className="text-muted">control-plane create-admin</span> on the server.
        </p>
      </div>
    </div>
  );
}
