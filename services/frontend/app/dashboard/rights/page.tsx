"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCheck,
  Plus,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  ScanSearch,
  Mail,
} from "lucide-react";
import { rightsAPI } from "@/lib/api/rights";
import type {
  RightsRequest,
  CreateRightsRequestInput,
  RightsRequestListFilter,
} from "@/types/api";
import { RIGHTS_TYPES, RIGHTS_STATUSES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, LoadingPanel } from "@/components/common/states";
import { StatusPill } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RIGHTS_TYPE_LABELS, label } from "@/lib/utils/labels";
import { formatDate, formatRelativeTime } from "@/lib/utils/helpers";

function daysLeft(due: string) {
  const ms = new Date(due).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function CreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState("access");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: (data: CreateRightsRequestInput) => rightsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rights"] });
      toast.success("Request logged", "90-day SLA clock has started.");
      setEmail(""); setName(""); setNotes("");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not create request", getApiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New rights request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Request type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RIGHTS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{label(RIGHTS_TYPE_LABELS, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-email">Data principal email</Label>
            <Input id="dp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="citizen@email.in" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-name">Data principal name (optional)</Label>
            <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-notes">Notes (optional)</Label>
            <Textarea id="dp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!email || create.isPending}
            onClick={() =>
              create.mutate({
                request_type: type as CreateRightsRequestInput["request_type"],
                data_principal_email: email,
                data_principal_name: name || undefined,
                notes: notes || undefined,
              })
            }
          >
            {create.isPending ? "Logging…" : "Log request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailModal({
  request,
  onClose,
}: {
  request: RightsRequest | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["rights"] });

  const update = useMutation({
    mutationFn: (status: RightsRequest["status"]) =>
      rightsAPI.update(request!.id, { status }),
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
    onError: (e) => toast.error("Update failed", getApiErrorMessage(e)),
  });
  const complete = useMutation({
    mutationFn: () => rightsAPI.complete(request!.id, { completed_at: new Date().toISOString() }),
    onSuccess: () => { invalidate(); toast.success("Request completed"); onClose(); },
    onError: (e) => toast.error("Could not complete", getApiErrorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => rightsAPI.reject(request!.id, rejectReason),
    onSuccess: () => { invalidate(); toast.success("Request rejected"); onClose(); },
    onError: (e) => toast.error("Could not reject", getApiErrorMessage(e)),
  });
  const search = useMutation({
    mutationFn: () => rightsAPI.search(request!.id),
    onSuccess: (r) => toast.success("Discovery dispatched", r.data?.message),
    onError: (e) => toast.error("Search failed", getApiErrorMessage(e)),
  });

  if (!request) return null;
  const left = daysLeft(request.due_date);

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="default">{label(RIGHTS_TYPE_LABELS, request.request_type)}</Badge>
            <StatusPill status={request.status} />
          </div>
          <DialogTitle className="mt-2 flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted" />
            {request.data_principal_email}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Principal</p>
            <p className="text-sm text-foreground">{request.data_principal_name || "—"}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">SLA Due</p>
            <p className={`text-sm font-medium ${left < 0 ? "text-critical" : left <= 14 ? "text-medium" : "text-foreground"}`}>
              {formatDate(request.due_date)} ({left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`})
            </p>
          </div>
        </div>

        {request.notes && (
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-faint">Notes</p>
            <p className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm text-muted">{request.notes}</p>
          </div>
        )}

        {request.status !== "completed" && request.status !== "rejected" && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={search.isPending} onClick={() => search.mutate()}>
                <ScanSearch className="h-4 w-4" /> Search data
              </Button>
              {request.status === "received" && (
                <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => update.mutate("in_progress")}>
                  Start processing
                </Button>
              )}
              <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate()}>
                <CheckCircle2 className="h-4 w-4" /> Complete
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Rejection reason…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-9 text-sm"
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={!rejectReason || reject.isPending}
                onClick={() => reject.mutate()}
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function RightsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading requests…" />}>
      <RightsContent />
    </Suspense>
  );
}

function RightsContent() {
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(sp.get("action") === "new");
  const [selected, setSelected] = useState<RightsRequest | null>(null);

  const filters: RightsRequestListFilter = useMemo(
    () => ({
      page,
      page_size: 20,
      request_type: type === "all" ? undefined : type,
      status: status === "all" ? undefined : status,
    }),
    [page, type, status],
  );

  const listQ = useQuery({
    queryKey: ["rights", filters],
    queryFn: () => rightsAPI.list(filters),
  });
  const overdueQ = useQuery({
    queryKey: ["rights", "overdue"],
    queryFn: () => rightsAPI.overdue().then((r) => r.data),
  });

  const all = useMemo(() => listQ.data?.data ?? [], [listQ.data]);
  const rows = search
    ? all.filter((r) => r.data_principal_email.toLowerCase().includes(search.toLowerCase()))
    : all;

  const counts = useMemo(() => {
    const c = { received: 0, in_progress: 0, completed: 0 };
    all.forEach((r) => {
      if (r.status === "received") c.received++;
      else if (r.status === "in_progress") c.in_progress++;
      else if (r.status === "completed") c.completed++;
    });
    return c;
  }, [all]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data Principal Rights"
        title="Rights Requests"
        description="Track DPDP access, correction, erasure and portability requests against the 90-day SLA."
        icon={<UserCheck className="h-5 w-5" />}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Request
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Received" value={counts.received} icon={<Mail className="h-4 w-4" />} />
        <StatCard label="In Progress" value={counts.in_progress} tone="low" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Completed" value={counts.completed} tone="accent" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Overdue" value={overdueQ.data?.count ?? 0} tone="critical" icon={<Clock className="h-4 w-4" />} />
      </div>

      <Panel
        title="Request Queue"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Search email…"
                className="h-9 w-44 pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={type} onValueChange={(v) => { setPage(1); setType(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RIGHTS_TYPES.map((t) => <SelectItem key={t} value={t}>{label(RIGHTS_TYPE_LABELS, t)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v); }}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {RIGHTS_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {listQ.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : listQ.isError ? (
          <ErrorState message={getApiErrorMessage(listQ.error)} onRetry={() => listQ.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserCheck className="h-6 w-6" />}
            title="No requests"
            description="Logged data-principal requests will appear here."
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Request</Button>}
          />
        ) : (
          <>
            <DataTable>
              <THead>
                <TH>Data Principal</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>SLA</TH>
                <TH>Logged</TH>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const left = daysLeft(r.due_date);
                  const open = r.status !== "completed" && r.status !== "rejected";
                  return (
                    <TR key={r.id} onClick={() => setSelected(r)}>
                      <TD>
                        <p className="font-medium text-foreground">{r.data_principal_email}</p>
                        {r.data_principal_name && (
                          <p className="font-mono text-[11px] text-faint">{r.data_principal_name}</p>
                        )}
                      </TD>
                      <TD>
                        <Badge variant="default">{label(RIGHTS_TYPE_LABELS, r.request_type)}</Badge>
                      </TD>
                      <TD><StatusPill status={r.status} /></TD>
                      <TD>
                        {open ? (
                          <span className={`font-mono text-xs ${left < 0 ? "text-critical" : left <= 14 ? "text-medium" : "text-muted"}`}>
                            {left < 0 ? `${Math.abs(left)}d overdue` : `${left}d left`}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-faint">—</span>
                        )}
                      </TD>
                      <TD className="font-mono text-xs text-muted">{formatRelativeTime(r.created_at)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </DataTable>
            <div className="mt-4">
              <Pager pagination={listQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>

      <CreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <DetailModal request={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
