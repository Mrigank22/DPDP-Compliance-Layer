"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileBarChart,
  Plus,
  Braces,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import { reportsAPI } from "@/lib/api/reports";
import type { Report, GenerateReportInput } from "@/types/api";
import { REPORT_TYPES } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { PageHeader, Panel } from "@/components/common/panel";
import { DataTable, THead, TH, TBody, TR, TD } from "@/components/common/table";
import { TableSkeleton, EmptyState, ErrorState, LoadingPanel } from "@/components/common/states";
import { StatusPill } from "@/components/common/indicators";
import { Pager } from "@/components/common/pager";
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
import { REPORT_TYPE_LABELS, label } from "@/lib/utils/labels";
import { formatDateTime } from "@/lib/utils/helpers";

function bytes(n?: number) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function GenerateModal({
  open,
  onOpenChange,
  initialType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialType?: string;
}) {
  const qc = useQueryClient();
  const [reportType, setReportType] = useState(initialType || "dpdp_compliance");
  const [title, setTitle] = useState("");

  const generate = useMutation({
    mutationFn: (data: GenerateReportInput) => reportsAPI.generate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report queued", "It will be ready shortly.");
      setTitle("");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Could not generate report", getApiErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Report type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{label(REPORT_TYPE_LABELS, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 FY25 DPDP Compliance Summary"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!title || generate.isPending}
            onClick={() =>
              generate.mutate({
                report_type: reportType as GenerateReportInput["report_type"],
                title,
              })
            }
          >
            {generate.isPending ? "Queuing…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading reports…" />}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [page, setPage] = useState(1);
  const [genOpen, setGenOpen] = useState(sp.get("action") === "new");
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);

  const reportsQ = useQuery({
    queryKey: ["reports", page],
    queryFn: () => reportsAPI.list({ page, page_size: 20 }),
    refetchInterval: (q) => {
      const data = q.state.data?.data as Report[] | undefined;
      return data?.some((r) => r.status === "generating") ? 4000 : false;
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => reportsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Could not delete report", getApiErrorMessage(e)),
  });

  const reports = reportsQ.data?.data ?? [];

  // Open the branded, print-ready HTML report in a new tab (rendered from an
  // authenticated blob so it works without S3 and carries no auth in the URL).
  const openHtml = async (r: Report) => {
    try {
      const blob = await reportsAPI.download(r.id, "html");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error("Could not open report", getApiErrorMessage(e));
    }
  };

  // Download the machine-readable JSON body.
  const downloadJson = async (r: Report) => {
    if (r.file_url && /^https?:\/\//i.test(r.file_url)) {
      window.open(r.file_url, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const blob = await reportsAPI.download(r.id, "json");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.title || "report"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Could not download report", getApiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Evidence"
        title="Reports"
        description="Audit-ready DPDP, DPIA and incident evidence packs for regulators and boards."
        icon={<FileBarChart className="h-5 w-5" />}
        actions={
          <Button onClick={() => setGenOpen(true)}>
            <Plus className="h-4 w-4" /> Generate Report
          </Button>
        }
      />

      <Panel title="Generated Reports">
        {reportsQ.isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : reportsQ.isError ? (
          <ErrorState message={getApiErrorMessage(reportsQ.error)} onRetry={() => reportsQ.refetch()} />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No reports yet"
            description="Generate your first DPDP compliance or DPIA report."
            action={
              <Button onClick={() => setGenOpen(true)}>
                <Plus className="h-4 w-4" /> Generate Report
              </Button>
            }
          />
        ) : (
          <DataTable>
            <THead>
              <TH>Report</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH className="text-right">Size</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-foreground">{r.title}</span>
                    </div>
                  </TD>
                  <TD className="font-mono text-xs uppercase text-muted">
                    {label(REPORT_TYPE_LABELS, r.report_type)}
                  </TD>
                  <TD>
                    {r.status === "generating" ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-accent-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> generating
                      </span>
                    ) : (
                      <StatusPill status={r.status} />
                    )}
                  </TD>
                  <TD className="text-right font-mono text-xs text-muted">{bytes(r.file_size_bytes)}</TD>
                  <TD className="font-mono text-xs text-muted">{formatDateTime(r.created_at)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      {r.status === "ready" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Open report (HTML)"
                            onClick={() => openHtml(r)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Download JSON"
                            onClick={() => downloadJson(r)}
                          >
                            <Braces className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        className="text-critical hover:text-critical"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
        {reports.length > 0 && (
          <div className="mt-4">
            <Pager pagination={reportsQ.data?.meta?.pagination} onPageChange={setPage} />
          </div>
        )}
      </Panel>

      <GenerateModal open={genOpen} onOpenChange={setGenOpen} initialType={sp.get("type") ?? undefined} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete report?"
        description={<><span className="font-medium text-foreground">{deleteTarget?.title}</span> will be permanently removed.</>}
        confirmLabel="Delete report"
        loading={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}
