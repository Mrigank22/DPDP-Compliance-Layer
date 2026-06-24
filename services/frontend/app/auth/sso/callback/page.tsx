"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { authAPI } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-client";
import { useAuthStore } from "@/lib/store/auth.store";
import { AppBackground } from "@/components/layout/app-background";

export default function SSOCallbackPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    // The exchange code is single-use; guard against React's double-invoke.
    if (ran.current) return;
    ran.current = true;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      router.replace("/login?sso_error=" + encodeURIComponent("Missing sign-in code."));
      return;
    }
    authAPI
      .ssoExchange(code)
      .then((res) => {
        const p = res.data;
        setAuth(p.user, p.access_token, p.refresh_token);
        router.replace("/dashboard");
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, "Single sign-on could not be completed."));
      });
  }, [router, setAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <AppBackground />
      {error ? (
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-critical/30 bg-critical/10 text-critical">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted">{error}</p>
          <a href="/login" className="font-mono text-xs text-accent hover:underline">
            Back to sign-in
          </a>
        </div>
      ) : (
        <div className="relative z-10 flex items-center gap-3 font-mono text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Completing single sign-on…
        </div>
      )}
    </div>
  );
}
