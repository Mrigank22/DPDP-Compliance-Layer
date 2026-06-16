"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock, Mail, ShieldAlert, Terminal } from "lucide-react";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage, getApiErrorCode } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/layout/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.login({
        email,
        password,
        totp_code: totp || undefined,
      });
      const payload = res.data;
      setAuth(payload.user, payload.access_token, payload.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      if (getApiErrorCode(err) === "mfa_required") {
        setMfaRequired(true);
        setError("Enter the 6-digit code from your authenticator app.");
      } else {
        setError(getApiErrorMessage(err, "Invalid credentials. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell badge="Secure Access">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 font-mono text-xs text-accent">
          <Terminal className="h-3.5 w-3.5" />
          <span className="cursor-blink">auth --login</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Operator sign-in
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Authenticate to access the sovereignty console.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/8 px-4 py-3 text-sm text-critical">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="operator@company.in"
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/login"
              className="font-mono text-[11px] text-accent/80 hover:text-accent"
            >
              forgot?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {mfaRequired && (
          <div className="space-y-1.5">
            <Label htmlFor="totp">Authenticator Code</Label>
            <Input
              id="totp"
              inputMode="numeric"
              placeholder="000000"
              className="font-mono tracking-[0.4em]"
              maxLength={6}
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Authenticating…
            </>
          ) : (
            "Sign in →"
          )}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-faint">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Link href="/signup">
        <Button variant="outline" size="lg" className="w-full">
          Provision a new workspace
        </Button>
      </Link>

      <p className="mt-6 text-center font-mono text-[11px] text-faint">
        Demo · admin@acme.com · Acme@123!
      </p>
    </AuthShell>
  );
}

