"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Power,
  PlayCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { adminAPI, type TenantAdminView } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

export default function AdminTenantsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<TenantAdminView | null>(null);

  const tenantsQ = useQuery({
    queryKey: ["admin", "tenants", page],
    queryFn: () => adminAPI.tenants(page, 20),
  });

  const tenants = tenantsQ.data?.data ?? [];
  const pg = tenantsQ.data?.meta?.pagination;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "tenants"] });

  const suspend = useMutation({
    mutationFn: (id: string) => adminAPI.suspendTenant(id),
    onSuccess: () => { invalidate(); toast.success("Tenant suspended", "Its users can no longer sign in."); },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });
  const activate = useMutation({
    mutationFn: (id: string) => adminAPI.activateTenant(id),
    onSuccess: () => { invalidate(); toast.success("Tenant reactivated"); },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminAPI.deleteTenant(id),
    onSuccess: () => { invalidate(); toast.success("Tenant deleted", "All of its data has been removed."); setDeleteTarget(null); },
    onError: (e) => toast.error("Delete failed", getApiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
          <Building2 className="h-5 w-5 text-accent" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Tenants</h1>
          <p className="text-sm text-muted">Every customer workspace on the platform.</p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Workspace</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Plan</th>
                <th className="px-4 py-3 text-right font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Users</th>
                <th className="px-4 py-3 text-right font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Assets</th>
                <th className="px-4 py-3 text-right font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Findings</th>
                <th className="px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Status</th>
                <th className="px-4 py-3 text-right font-display text-[12px] font-semibold uppercase tracking-wide text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenantsQ.isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted"><Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" /></td></tr>
              ) : tenants.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No tenants yet.</td></tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="font-mono text-[11px] text-faint">{t.slug} · {t.data_region}</p>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">{t.plan}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted">{t.user_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted">{t.asset_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted">{t.finding_count}</td>
                    <td className="px-4 py-3">
                      {t.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                          <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Suspended
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.is_active ? (
                          <Button size="sm" variant="ghost" onClick={() => suspend.mutate(t.id)} disabled={suspend.isPending} title="Suspend">
                            <Power className="h-4 w-4 text-warning" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => activate.mutate(t.id)} disabled={activate.isPending} title="Reactivate">
                            <PlayCircle className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(t)} title="Delete">
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pg && pg.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="font-mono text-[11px] text-faint">
              Page {pg.page} of {pg.total_pages} · {pg.total_items} tenants
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={!pg.has_prev} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={!pg.has_next} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete tenant permanently?"
        confirmLabel="Delete everything"
        loading={remove.isPending}
        description={
          <>
            This will <strong className="text-danger">permanently delete</strong>{" "}
            <strong>{deleteTarget?.name}</strong> and all of its data — users,
            assets, findings, policies and history. This cannot be undone.
          </>
        }
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
}
