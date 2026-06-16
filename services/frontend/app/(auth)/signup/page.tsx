"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Loader2, Lock, Mail, ShieldAlert, User } from "lucide-react";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/layout/auth-shell";

export default function SignupPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slug = orgName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!agreed) {
      setError("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.register({
        full_name: fullName,
        email,
        password,
        tenant_name: orgName,
        tenant_slug: slug,
      });
      const payload = res.data;
      setAuth(payload.user, payload.access_token, payload.refresh_token);
      router.push("/dashboard");
    } catch (err) {
      setError(getApiErrorMessage(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell badge="Provision Workspace">
      <Link
        href="/login"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-xs text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        back to sign-in
      </Link>

      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Create your workspace
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Spin up an isolated, India-region tenant in seconds.
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical/8 px-4 py-3 text-sm text-critical">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="name"
              className="pl-9"
              placeholder="Aarav Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Work Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="email"
              type="email"
              className="pl-9"
              placeholder="you@company.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="org">Organization</Label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="org"
              className="pl-9"
              placeholder="Acme Fintech Pvt Ltd"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          </div>
          {slug && (
            <p className="font-mono text-[11px] text-faint">
              tenant: <span className="text-accent">{slug}</span>.datasentinel.io
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              id="password"
              type="password"
              className="pl-9"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <p className="text-[11px] text-faint">
            Minimum 8 characters with uppercase, lowercase & numbers.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 pt-1">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border bg-surface-2 accent-[var(--color-accent)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-xs text-muted">
            I agree to the{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Provisioning…
            </>
          ) : (
            "Create workspace →"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already onboarded?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}