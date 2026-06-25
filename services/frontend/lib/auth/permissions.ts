import { ROLES, type User } from "@/types/api";

export type Role = (typeof ROLES)[number];

/** Role hierarchy: owner > admin > analyst > viewer. */
const RANK: Record<Role, number> = {
  viewer: 1,
  analyst: 2,
  admin: 3,
  owner: 4,
};

/** True when `role` is at least `min` in the hierarchy. */
export function hasRole(role: Role | string | undefined | null, min: Role): boolean {
  const r = RANK[(role as Role) ?? "viewer"] ?? 0;
  return r >= RANK[min];
}

/**
 * Page access policy — the minimum role required to open a route. Checked
 * most-specific-prefix first; anything not listed defaults to `viewer` (any
 * authenticated user). The backend independently enforces the same rules, so
 * this is defence-in-depth + UX, never the only gate.
 */
const PAGE_ACCESS: { prefix: string; min: Role }[] = [
  { prefix: "/dashboard/settings", min: "admin" },
  { prefix: "/dashboard/audit", min: "admin" },
  { prefix: "/dashboard/team", min: "admin" },
  { prefix: "/dashboard/rights", min: "analyst" },
  { prefix: "/dashboard/consent", min: "analyst" },
  { prefix: "/dashboard/breaches", min: "analyst" },
];

/** Minimum role required to view a given dashboard path. */
export function minRoleForPath(path: string): Role {
  const match = PAGE_ACCESS
    .filter((p) => path === p.prefix || path.startsWith(p.prefix + "/") || path.startsWith(p.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.min ?? "viewer";
}

/** Whether a role may open a given dashboard path. */
export function canAccessPath(role: Role | string | undefined | null, path: string): boolean {
  return hasRole(role, minRoleForPath(path));
}

/** Convenience accessor for a user's role with a safe default. */
export function roleOf(user: User | null | undefined): Role {
  return (user?.role as Role) ?? "viewer";
}
