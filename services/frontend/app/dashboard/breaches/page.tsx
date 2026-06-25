"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Siren, Plus, ShieldAlert, Megaphone, CheckCircle2, Clock } from "lucide-react";
import { breachesAPI, type CreateBreachInput, type BreachCategory, type BreachListFilter } from "@/lib/api/breaches";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { SeverityBadge } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatDateTime } from "@/lib/utils/helpers";
import { BreachStatusPill } from "@/components/breaches/status-pill";

const CATEGORIES: BreachCategory[] = ["confidentiality", "integrity", "availability"];

function CreateModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<CreateBreachInput["severity"]>("medium");
  const [categories, setCategories] = useState<Record<BreachCategory, boolean>>({
    confidentiality: true,
    integrity: false,
    availability: false,
  });
  const [dataTypes, setDataTypes] = useState("");
  const [principals, setPrincipals] = useState("");
  const [discoveredAt, setDiscoveredAt] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: (data: CreateBreachInput) => breachesAPI.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["breaches"] });
      toast.success("Breach recorded", "The 72-hour Board intimation clock has started.");
      onOpenChange(false);
      router.push(`/dashboard/breaches/${res.data.id}`);
    },
    onError: (e) => toast.error("Could not record breach", getApiErrorMessage(e)),
  });

  const submit = () => {
    const payload: CreateBreachInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      severity,
      categories: CATEGORIES.filter((c) => categories[c]),
      affected_data_types: dataTypes.split(",").map((s) => s.trim()).filter(Boolean),
      affected_principals: principals ? Number(principals) : 0,
      discovered_at: discoveredAt ? new Date(discoveredAt).toISOString() : undefined,
    };
    create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a breach incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="br-title">Title</Label>
            <Input id="br-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Unauthorized access to CRM export" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as CreateBreachInput["severity"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-discovered">Discovered at</Label>
              <Input id="br-discovered" type="datetime-local" value={discoveredAt} onChange={(e) => setDiscoveredAt(e.target.value)} />
              <p className="text-[11px] text-faint">Defaults to now. Drives the 72-hour Board deadline.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nature of breach</Label>
            <div className="flex flex-wrap gap-4">
              {CATEGORIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm capitalize text-foreground">
                  <Checkbox checked={categories[c]} onChange={(e) => setCategories((p) => ({ ...p, [c]: e.target.checked }))} />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="br-types">Personal data affected</Label>
              <Input id="br-types" value={dataTypes} onChange={(e) => setDataTypes(e.target.value)} placeholder="contact, financial" />
              <p className="text-[11px] text-faint">Comma-separated categories.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-principals">Affected principals (est.)</Label>
              <Input id="br-principals" type="number" min={0} value={principals} onChange={(e) => setPrincipals(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-desc">What happened</Label>
            <Textarea id="br-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief factual description of the incident." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={submit}>
            {create.isPending ? "Recording…" : "Record incident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BreachesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filters: BreachListFilter = useMemo(
    () => ({
      page,
      page_size: 20,
      status: status || undefined,
      severity: severity || undefined,
    }),
    [page, status, severity],
  );

  const statsQ = useQuery({ queryKey: ["breaches", "stats"], queryFn: () => breachesAPI.stats().then((r) => r.data) });
  const listQ = useQuery({ queryKey: ["breaches", filters], queryFn: () => breachesAPI.list(filters) });

  const incidents = listQ.data?.data ?? [];
  const stats = statsQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="DPDP §8(6)"
        title="Breach Response"
        description="Record personal data breaches, track the statutory intimations to the Data Protection Board and affected principals, and keep an evidence trail."
        icon={<Siren className="h-5 w-5" />}
        actions={
          <Can min="analyst">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Record breach
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open incidents" value={stats?.open ?? 0} icon={<ShieldAlert className="h-4 w-4" />} tone="high" />
        <StatCard label="Board overdue" value={stats?.board_overdue ?? 0} icon={<Clock className="h-4 w-4" />} tone="critical" hint="Past the 72-hour deadline" />
        <StatCard label="Awaiting principals" value={stats?.awaiting_principals ?? 0} icon={<Megaphone className="h-4 w-4" />} tone="medium" />
        <StatCard label="Closed" value={stats?.closed ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="low" />
      </div>

      <Panel
        title="Incidents"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status || "all"} onValueChange={(v) => { setPage(1); setStatus(v === "all" ? "" : v); }}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assessing">Assessing</SelectItem>
                <SelectItem value="contained">Contained</SelectItem>
                <SelectItem value="notified">Notified</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity || "all"} onValueChange={(v) => { setPage(1); setSeverity(v === "all" ? "" : v); }}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {listQ.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : listQ.isError ? (
          <ErrorState message={getApiErrorMessage(listQ.error)} onRetry={() => listQ.refetch()} />
        ) : incidents.length === 0 ? (
          <EmptyState icon={<Siren className="h-6 w-6" />} title="No breach incidents" description="When a personal data breach occurs, record it here to start the statutory notification clock." />
        ) : (
          <>
            <DataTable>
              <THead>
                <TH>Reference</TH>
                <TH>Title</TH>
                <TH>Severity</TH>
                <TH>Status</TH>
                <TH>Discovered</TH>
                <TH>Board deadline</TH>
              </THead>
              <TBody>
                {incidents.map((b) => (
                  <TR key={b.id} onClick={() => router.push(`/dashboard/breaches/${b.id}`)}>
                    <TD className="font-mono text-xs text-muted">{b.reference}</TD>
                    <TD><span className="text-foreground">{b.title}</span></TD>
                    <TD><SeverityBadge severity={b.severity} /></TD>
                    <TD><BreachStatusPill status={b.status} /></TD>
                    <TD className="font-mono text-xs text-muted">{formatDateTime(b.discovered_at)}</TD>
                    <TD>
                      {b.board_notified_at ? (
                        <span className="text-xs text-success">Notified</span>
                      ) : b.board_overdue ? (
                        <span className="text-xs font-semibold text-critical">Overdue</span>
                      ) : (
                        <span className="font-mono text-xs text-muted">{formatDateTime(b.board_deadline)}</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </DataTable>
            <div className="mt-4">
              <Pager pagination={listQ.data?.meta?.pagination} onPageChange={setPage} />
            </div>
          </>
        )}
      </Panel>

      <CreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
