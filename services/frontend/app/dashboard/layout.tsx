"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth.store";
import { canAccessPath, minRoleForPath, roleOf } from "@/lib/auth/permissions";
import { NoAccess } from "@/components/auth/can";
import { AppBackground } from "@/components/layout/app-background";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, hydrated, loadFromStorage, user } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <AppBackground />
        <div className="flex items-center gap-3 font-mono text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Establishing secure session…
        </div>
      </div>
    );
  }

  const allowed = canAccessPath(roleOf(user), pathname);

  return (
    <div className="min-h-screen">
      <AppBackground />
      <CommandPalette />
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            {allowed ? children : <NoAccess min={minRoleForPath(pathname)} />}
          </div>
        </main>
      </div>
    </div>
  );
}

