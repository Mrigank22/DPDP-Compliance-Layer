"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileCheck2,
  Plus,
  Search,
  ShieldX,
  CircleCheck,
  CircleSlash,
  History,
} from "lucide-react";
import { consentAPI } from "@/lib/api/consent";
import type { ConsentRecord, RecordConsentInput } from "@/types/api";
import { CONSENT_MECHANISMS } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, CardSkeleton } from "@/components/common/states";
import { Stagger } from "@/components/common/reveal";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { humanize } from "@/lib/utils/labels";
import { formatDateTime } from "@/lib/utils/helpers";

function RecordConsentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [principalId, setPrincipalId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [given, setGiven] = useState("true");
  const [mechanism, setMechanism] = useState("form");
  const [notice, setNotice] = useState("");

  const record = useMutation({
    mutationFn: (data: RecordConsentInput) => consentAPI.record(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent"] });
      toast.success("Consent recorded");
      setPrincipalId(""); setPurpose(""); setNotice("");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not record consent", getApiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record consent event</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-principal">Data principal ID</Label>
            <Input id="c-principal" value={principalId} onChange={(e) => setPrincipalId(e.target.value)} placeholder="user_12345 / email / phone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-purpose">Purpose</Label>
            <Input id="c-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Marketing communications" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Decision</Label>
              <Select value={given} onValueChange={setGiven}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Consent given</SelectItem>
                  <SelectItem value="false">Consent denied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mechanism</Label>
              <Select value={mechanism} onValueChange={setMechanism}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSENT_MECHANISMS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-notice">Notice version (optional)</Label>
            <Input id="c-notice" value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="v2.1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!principalId || !purpose || record.isPending}
            onClick={() =>
              record.mutate({
                data_principal_id: principalId,
                purpose,
                consent_given: given === "true",
                mechanism: mechanism as RecordConsentInput["mechanism"],
                notice_version: notice || undefined,
              })
            }
          >
            {record.isPending ? "Recording…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConsentPage() {
  const qc = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [activePrincipal, setActivePrincipal] = useState<string | null>(null);
  const [withdrawAllTarget, setWithdrawAllTarget] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ["consent", "summary"],
    queryFn: () => consentAPI.summary().then((r) => r.data),
  });

  const principalQ = useQuery({
    queryKey: ["consent", "principal", activePrincipal],
    queryFn: () => consentAPI.byPrincipal(activePrincipal!).then((r) => r.data),
    enabled: !!activePrincipal,
  });

  const withdraw = useMutation({
    mutationFn: (recordId: string) => consentAPI.withdraw(recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent"] });
      toast.success("Consent withdrawn");
    },
    onError: (e) => toast.error("Could not withdraw", getApiErrorMessage(e)),
  });

  const withdrawAll = useMutation({
    mutationFn: (principalId: string) => consentAPI.withdrawAll(principalId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["consent"] });
      toast.success("All consents withdrawn", `${res.data?.withdrawn_count ?? 0} record(s) updated.`);
      setWithdrawAllTarget(null);
    },
    onError: (e) => toast.error("Could not withdraw all", getApiErrorMessage(e)),
  });

  const s = summaryQ.data;
  const records: ConsentRecord[] = principalQ.data?.records ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="DPDP Consent Ledger"
        title="Consent"
        description="Immutable record of every consent given and withdrawn, by purpose — your lawful-basis evidence."
        icon={<FileCheck2 className="h-5 w-5" />}
        actions={
          <Button onClick={() => setRecordOpen(true)}>
            <Plus className="h-4 w-4" /> Record Consent
          </Button>
        }
      />

      {summaryQ.isLoading ? (
        <CardSkeleton count={3} />
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Records" value={s?.total_records ?? 0} icon={<History className="h-4 w-4" />} />
          <StatCard label="Active Consents" value={s?.consent_given ?? 0} tone="accent" icon={<CircleCheck className="h-4 w-4" />} />
          <StatCard label="Withdrawn" value={s?.consent_withdrawn ?? 0} tone="critical" icon={<CircleSlash className="h-4 w-4" />} />
        </Stagger>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Consent by Purpose" subtitle="Lawful-basis breakdown">
          {summaryQ.isLoading ? (
            <TableSkeleton rows={5} cols={3} />
          ) : !s?.by_purpose?.length ? (
            <EmptyState title="No consent records" description="Record consent events to populate the ledger." className="border-0 bg-transparent py-8" />
          ) : (
            <DataTable>
              <THead>
                <TH>Purpose</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Given</TH>
                <TH className="text-right">Withdrawn</TH>
              </THead>
              <TBody>
                {s.by_purpose.map((p) => (
                  <TR key={p.purpose}>
                    <TD className="font-medium text-foreground">{p.purpose}</TD>
                    <TD className="text-right font-mono tabular-nums">{p.total}</TD>
                    <TD className="text-right font-mono tabular-nums text-accent">{p.given_count}</TD>
                    <TD className="text-right font-mono tabular-nums text-critical">{p.withdrawn_count}</TD>
                  </TR>
                ))}
              </TBody>
            </DataTable>
          )}
        </Panel>

        <Panel title="Data Principal Lookup" subtitle="Inspect & withdraw consents for a subject">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Data principal ID / email…"
                className="pl-8"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupId && setActivePrincipal(lookupId.trim())}
              />
            </div>
            <Button variant="outline" disabled={!lookupId} onClick={() => setActivePrincipal(lookupId.trim())}>
              Look up
            </Button>
          </div>

          {activePrincipal && (
            <div className="mt-4">
              {principalQ.isLoading ? (
                <TableSkeleton rows={3} cols={3} />
              ) : records.length === 0 ? (
                <EmptyState title="No records" description={`No consent history for "${activePrincipal}".`} className="border-0 bg-transparent py-6" />
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-mono text-xs text-muted">
                      {records.length} record(s) for <span className="text-foreground">{activePrincipal}</span>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-critical hover:text-critical"
                      onClick={() => setWithdrawAllTarget(activePrincipal)}
                    >
                      <ShieldX className="h-4 w-4" /> Withdraw all
                    </Button>
                  </div>
                  <DataTable>
                    <THead>
                      <TH>Purpose</TH>
                      <TH>Status</TH>
                      <TH>When</TH>
                      <TH className="text-right">Action</TH>
                    </THead>
                    <TBody>
                      {records.map((r) => (
                        <TR key={r.id}>
                          <TD>
                            <p className="font-medium text-foreground">{r.purpose}</p>
                            <p className="font-mono text-[11px] text-faint">{humanize(r.consent_mechanism)}</p>
                          </TD>
                          <TD>
                            {r.withdrawal_timestamp ? (
                              <span className="font-mono text-xs text-critical">withdrawn</span>
                            ) : r.consent_given ? (
                              <span className="font-mono text-xs text-accent">active</span>
                            ) : (
                              <span className="font-mono text-xs text-medium">denied</span>
                            )}
                          </TD>
                          <TD className="font-mono text-xs text-muted">{formatDateTime(r.created_at)}</TD>
                          <TD className="text-right">
                            {!r.withdrawal_timestamp && r.consent_given && (
                              <Button variant="ghost" size="sm" className="text-critical hover:text-critical" disabled={withdraw.isPending} onClick={() => withdraw.mutate(r.id)}>
                                Withdraw
                              </Button>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </DataTable>
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      <RecordConsentModal open={recordOpen} onOpenChange={setRecordOpen} />
      <ConfirmDialog
        open={!!withdrawAllTarget}
        onOpenChange={(v) => !v && setWithdrawAllTarget(null)}
        title="Withdraw all consents?"
        description={<>This withdraws every active consent for <span className="font-medium text-foreground">{withdrawAllTarget}</span> — typically done on an erasure request.</>}
        confirmLabel="Withdraw all"
        loading={withdrawAll.isPending}
        onConfirm={() => withdrawAllTarget && withdrawAll.mutate(withdrawAllTarget)}
      />
    </div>
  );
}
