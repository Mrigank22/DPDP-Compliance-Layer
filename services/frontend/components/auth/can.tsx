"use client";

import { type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth.store";
import { hasRole, roleOf, type Role } from "@/lib/auth/permissions";

/** Current user's role (reactive). */
export function useRole(): Role {
  return useAuthStore((s) => roleOf(s.user));
}

/** True when the current user is at least `min`. */
export function useCan(min: Role): boolean {
  const role = useRole();
  return hasRole(role, min);
}

/**
 * Renders `children` only when the current user meets `min`. Optionally renders
 * `fallback` otherwise. Pure UX — the API still enforces the real check.
 */
export function Can({
  min,
  children,
  fallback = null,
}: {
  min: Role;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(min) ? <>{children}</> : <>{fallback}</>;
}

/** Full-panel “insufficient permissions” screen for guarded routes. */
export function NoAccess({ min }: { min?: Role }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-critical/30 bg-critical/10 text-critical">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <div>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          You don&rsquo;t have access to this page
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted">
          {min
            ? `This area requires the ${min} role or higher.`
            : "Your role doesn't include permission for this area."}{" "}
          Contact a workspace administrator if you need access.
        </p>
      </div>
    </div>
  );
}
