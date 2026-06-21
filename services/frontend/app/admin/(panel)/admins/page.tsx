"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCog, Plus, Power, PlayCircle, ShieldCheck, Loader2 } from "lucide-react";
import { adminAPI, type CreateAdminInput } from "@/lib/api/admin";
import { useAdminStore } from "@/lib/store/admin.store";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AdminAdminsPage() {
  const qc = useQueryClient();
  const me = useAdminStore((s) => s.admin);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateAdminInput>({ email: "", full_name: "", password: "" });

  const adminsQ = useQuery({ queryKey: ["admin", "admins"], queryFn: () => adminAPI.admins().then((r) => r.data) });
  const admins = adminsQ.data?.admins ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "admins"] });

  const create = useMutation({
    mutationFn: () => adminAPI.createAdmin(form),
    onSuccess: () => {
      invalidate();
      toast.success("Platform admin created", `${form.email} can now sign in.`);
      setOpen(false);
      setForm({ email: "", full_name: "", password: "" });
    },
    onError: (e) => toast.error("Could not create admin", getApiErrorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: (id: string) => adminAPI.disableAdmin(id),
    onSuccess: () => { invalidate(); toast.success("Admin disabled"); },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: (id: string) => adminAPI.enableAdmin(id),
    onSuccess: () => { invalidate(); toast.success("Admin enabled"); },
    onError: (e) => toast.error("Action failed", getApiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
            <UserCog className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Platform Admins</h1>
            <p className="text-sm text-muted">Operators with full vendor-level control.</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New admin
        </Button>
      </div>

      <div className="panel divide-y divide-border">
        {adminsQ.isLoading ? (
          <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" /></div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-muted">No platform admins.</div>
        ) : (
          admins.map((a) => (
            <div key={a.id} className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 font-display text-sm font-bold text-accent">
                {(a.full_name || a.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {a.full_name || a.email}
                  {a.id === me?.id && (
                    <span className="rounded border border-accent/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">You</span>
                  )}
                </p>
                <p className="truncate font-mono text-[12px] text-faint">{a.email}</p>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                {a.mfa_enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    <ShieldCheck className="h-3 w-3" /> MFA
                  </span>
                ) : (
                  <span className="rounded-full border border-border-bright px-2 py-0.5 text-[11px] text-faint">No MFA</span>
                )}
              </div>
              <div>
                {a.is_active ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                    Disabled
                  </span>
                )}
              </div>
              <div className="w-9 text-right">
                {a.id !== me?.id &&
                  (a.is_active ? (
                    <Button size="sm" variant="ghost" onClick={() => disable.mutate(a.id)} title="Disable">
                      <Power className="h-4 w-4 text-danger" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => enable.mutate(a.id)} title="Enable">
                      <PlayCircle className="h-4 w-4 text-success" />
                    </Button>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New platform admin</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="a-name">Full name</Label>
              <Input id="a-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Operator" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-email">Email</Label>
              <Input id="a-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@datasentinel.io" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-pass">Temporary password</Label>
              <Input id="a-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="≥ 12 chars, mixed case, digit, symbol" />
              <p className="text-[11px] text-faint">Share securely. They should enable MFA on first sign-in.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.email || !form.full_name || form.password.length < 12}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
