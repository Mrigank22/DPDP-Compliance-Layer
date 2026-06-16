"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth.store";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, hydrated, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!hydrated) return;
    router.replace(isAuthenticated ? "/dashboard" : "/login");
  }, [hydrated, isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
          <Radar className="h-7 w-7 animate-pulse text-accent" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
          Initializing console…
        </p>
      </div>
    </div>
  );
}



