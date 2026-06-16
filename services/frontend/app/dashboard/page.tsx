"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Database,
  ShieldAlert,
  ShieldCheck,
  Bug,
  BellRing,
  FileBarChart,
  Plus,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  Gauge,
  Clock,
  GitBranch,
} from "lucide-react";
import { dashboardAPI } from "@/lib/api/dashboard";
import { findingsAPI } from "@/lib/api/findings";
import { rightsAPI } from "@/lib/api/rights";
import { gatewayAPI } from "@/lib/api/gateway";
import type { DashboardSummary, DPDPStatus, TrendPoint } from "@/types/api";
import { PageHeader, Panel } from "@/components/common/panel";
import { StatCard } from "@/components/common/stat-card";
import { Stagger } from "@/components/common/reveal";
import { CardSkeleton, Skeleton, EmptyState } from "@/components/common/states";
import { RiskScore, SeverityBadge } from "@/components/common/indicators";
import { ComplianceGauge } from "@/components/dashboard/compliance-gauge";
import { PiiDonut, FindingsTrend, SeverityBars } from "@/components/dashboard/charts";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DataFlowMap } from "@/components/dashboard/data-flow-map";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatDate } from "@/lib/utils/helpers";
import { ASSET_TYPE_LABELS, ALERT_TYPE_LABELS, RIGHTS_TYPE_LABELS, label } from "@/lib/utils/labels";

const DPDP_ICON = {
  compliant: CheckCircle2,
  gap: AlertTriangle,
  non_compliant: CircleSlash,
};
const DPDP_TONE = {
  compliant: "text-accent",
  gap: "text-medium",
  non_compliant: "text-critical",
};

function normalizeTrend(points: TrendPoint[] | undefined) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => {
    const raw = p as unknown as Record<string, unknown>;
    const bySev = (raw.by_severity as Record<string, number>) ?? {};
    const dateVal = (raw.date ?? raw.day ?? raw.ts ?? "") as string;
    const short = dateVal ? dateVal.slice(5, 10) : "";
    const num = (k: string) =>
      Number(raw[k] ?? bySev[k] ?? 0) || 0;
    return {
      date: short,
      critical: num("critical"),
      high: num("high"),
      medium: num("medium"),
      low: num("low"),
    };
  });
}

function daysUntil(due: string) {
  return Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
}

export default function DashboardPage() {
  const summaryQ = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => dashboardAPI.getSummary().then((r) => r.data),
  });
  const dpdpQ = useQuery({
    queryKey: ["dashboard", "dpdp"],
    queryFn: () => dashboardAPI.getDPDPStatus().then((r) => r.data),
  });
  const findingsSummaryQ = useQuery({
    queryKey: ["findings", "summary"],
    queryFn: () => findingsAPI.summary().then((r) => r.data),
  });
  const trendsQ = useQuery({
    queryKey: ["dashboard", "trends"],
    queryFn: () => dashboardAPI.getTrends(30).then((r) => r.data),
  });
  const rightsQ = useQuery({
    queryKey: ["rights", "upcoming"],
    queryFn: () => rightsAPI.list({ page_size: 50 }).then((r) => r.data),
  });
  const flowsQ = useQuery({
    queryKey: ["gateway", "flows"],
    queryFn: () => gatewayAPI.listDataFlows().then((r) => r.data),
  });

  const s: Partial<DashboardSummary> = summaryQ.data ?? {};
  const dpdp: DPDPStatus | undefined = dpdpQ.data;
  const trend = normalizeTrend(trendsQ.data);
  const upcoming = (rightsQ.data ?? [])
    .filter((r) => r.status === "received" || r.status === "in_progress")
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Posture"
        title="Threat Overview"
        description="Real-time view of personal-data exposure, enforcement and DPDP readiness."
        icon={<Gauge className="h-5 w-5" />}
        actions={
          <>
            <Link href="/dashboard/assets">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" /> Connect Asset
              </Button>
            </Link>
            <Link href="/dashboard/reports">
              <Button size="sm">
                <FileBarChart className="h-4 w-4" /> Generate Report
              </Button>
            </Link>
          </>
        }
      />

      {!summaryQ.isLoading && <OnboardingChecklist summary={s} />}

      {/* Critical banner */}
      {(s.critical_findings ?? 0) > 0 && (
        <Link
          href="/dashboard/findings?severity=critical"
          className="flex items-center gap-3 rounded-xl border border-critical/30 bg-critical/8 px-4 py-3 transition-colors hover:bg-critical/12"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-critical" />
          <p className="text-sm text-foreground">
            <span className="font-semibold text-critical">
              {s.critical_findings} critical findings
            </span>{" "}
            require immediate remediation.
          </p>
          <ArrowRight className="ml-auto h-4 w-4 text-critical" />
        </Link>
      )}

      {summaryQ.isLoading ? (
        <CardSkeleton count={6} />
      ) : (
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Compliance"
            value={s.compliance_score ?? 0}
            suffix="%"
            tone="accent"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            label="Assets"
            value={s.total_assets ?? 0}
            icon={<Database className="h-4 w-4" />}
            href="/dashboard/assets"
          />
          <StatCard
            label="PII Exposed"
            value={s.pii_records_exposed ?? 0}
            tone="medium"
            icon={<Activity className="h-4 w-4" />}
            href="/dashboard/findings?type=pii_exposure"
          />
          <StatCard
            label="Open Findings"
            value={s.open_findings ?? 0}
            tone="high"
            icon={<Bug className="h-4 w-4" />}
            href="/dashboard/findings"
          />
          <StatCard
            label="Critical"
            value={s.critical_findings ?? 0}
            tone="critical"
            icon={<ShieldAlert className="h-4 w-4" />}
            href="/dashboard/findings?severity=critical"
          />
          <StatCard
            label="Alerts"
            value={s.unacknowledged_alerts ?? 0}
            tone="low"
            icon={<BellRing className="h-4 w-4" />}
            href="/dashboard/alerts"
          />
        </Stagger>
      )}

      {/* Gauge + DPDP + PII */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Compliance Posture" subtitle="DPDP readiness index" glow>
          {summaryQ.isLoading ? (
            <Skeleton className="mx-auto h-52 w-52 rounded-full" />
          ) : (
            <div className="flex flex-col items-center gap-5 py-2">
              <ComplianceGauge score={s.compliance_score ?? 0} />
              <div className="grid w-full grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-surface-2/50 py-2">
                  <p className="font-display text-lg font-bold text-foreground">
                    {s.active_policies ?? 0}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-faint">
                    Policies
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/50 py-2">
                  <p className="font-display text-lg font-bold text-foreground">
                    {s.overdue_rights_requests ?? 0}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-faint">
                    Overdue DSR
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/50 py-2">
                  <p className="font-display text-lg font-bold text-foreground">
                    {s.last_scan_at ? formatRelativeTime(s.last_scan_at).replace(" ago", "") : "—"}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-faint">
                    Last Scan
                  </p>
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="DPDP Control Status"
          subtitle="Statutory requirement checks"
          actions={
            dpdp && (
              <SeverityBadge
                severity={
                  dpdp.overall_status === "compliant"
                    ? "low"
                    : dpdp.overall_status === "gap"
                      ? "medium"
                      : "critical"
                }
              />
            )
          }
        >
          {dpdpQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : dpdp && dpdp.checks?.length ? (
            <div className="space-y-1.5">
              {dpdp.checks.slice(0, 6).map((c, i) => {
                const Icon = DPDP_ICON[c.status] ?? AlertTriangle;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${DPDP_TONE[c.status]}`} />
                    <span className="truncate text-sm text-foreground">
                      {c.requirement}
                    </span>
                    <span
                      className={`ml-auto font-mono text-[10px] uppercase tracking-wide ${DPDP_TONE[c.status]}`}
                    >
                      {c.status.replace("_", " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No DPDP checks yet"
              description="Connect assets and run a scan to evaluate compliance."
              className="border-0 bg-transparent py-8"
            />
          )}
        </Panel>

        <Panel title="PII Distribution" subtitle="Detected personal-data types">
          {findingsSummaryQ.isLoading ? (
            <Skeleton className="h-52" />
          ) : (
            <PiiDonut data={findingsSummaryQ.data?.by_pii_type ?? {}} />
          )}
        </Panel>
      </div>

      {/* Trend + severity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Findings Over Time"
          subtitle="Last 30 days · stacked by severity"
          className="lg:col-span-2"
        >
          {trendsQ.isLoading ? <Skeleton className="h-60" /> : <FindingsTrend data={trend} />}
        </Panel>
        <Panel title="Severity Breakdown" subtitle="Open findings">
          {summaryQ.isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <SeverityBars data={s.findings_by_severity ?? {}} />
          )}
        </Panel>
      </div>

      {/* Deadlines + data flow map */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Compliance Calendar"
          subtitle="Upcoming DPDP rights deadlines"
          actions={
            <Link href="/dashboard/rights" className="font-mono text-xs text-accent hover:underline">
              view all →
            </Link>
          }
        >
          {rightsQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-6 w-6" />}
              title="No open deadlines"
              description="DSR due dates will appear here against the 90-day SLA."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <div className="space-y-1.5">
              {upcoming.map((r) => {
                const left = daysUntil(r.due_date);
                const tone = left < 0 ? "text-critical" : left <= 14 ? "text-medium" : "text-muted";
                return (
                  <Link
                    key={r.id}
                    href="/dashboard/rights"
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-border-bright"
                  >
                    <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-surface">
                      <span className="font-display text-sm font-bold leading-none text-foreground">
                        {new Date(r.due_date).getDate()}
                      </span>
                      <span className="font-mono text-[8px] uppercase text-faint">
                        {new Date(r.due_date).toLocaleString("en-IN", { month: "short" })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.data_principal_email}
                      </p>
                      <p className="font-mono text-[11px] text-faint">
                        {label(RIGHTS_TYPE_LABELS, r.request_type)} · due {formatDate(r.due_date)}
                      </p>
                    </div>
                    <span className={`font-mono text-[11px] ${tone}`}>
                      {left < 0 ? `${Math.abs(left)}d over` : `${left}d`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Data Flow Map"
          subtitle="Where personal data leaves your estate"
          className="lg:col-span-2"
          actions={
            <Link href="/dashboard/gateway" className="font-mono text-xs text-accent hover:underline">
              <GitBranch className="mr-1 inline h-3 w-3" /> gateway
            </Link>
          }
        >
          {flowsQ.isLoading ? (
            <div className="h-64 skeleton rounded-lg" />
          ) : (
            <DataFlowMap flows={flowsQ.data ?? []} />
          )}
        </Panel>
      </div>

      {/* Risk assets + recent alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel
          title="Top Risk Assets"
          actions={
            <Link
              href="/dashboard/assets"
              className="font-mono text-xs text-accent hover:underline"
            >
              view all →
            </Link>
          }
        >
          {summaryQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : s.top_risk_assets?.length ? (
            <div className="space-y-1.5">
              {s.top_risk_assets.slice(0, 5).map((a) => (
                <Link
                  key={a.id}
                  href={`/dashboard/assets/${a.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-border-bright"
                >
                  <Database className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {a.name}
                    </p>
                    <p className="font-mono text-[11px] text-faint">
                      {label(ASSET_TYPE_LABELS, a.asset_type)}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <RiskScore score={a.risk_score} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Database className="h-6 w-6" />}
              title="No assets connected"
              description="Connect your first data source to begin discovery."
              action={
                <Link href="/dashboard/assets">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Connect Asset
                  </Button>
                </Link>
              }
              className="border-0 bg-transparent py-8"
            />
          )}
        </Panel>

        <Panel
          title="Recent Alerts"
          actions={
            <Link
              href="/dashboard/alerts"
              className="font-mono text-xs text-accent hover:underline"
            >
              view all →
            </Link>
          }
        >
          {summaryQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : s.recent_alerts?.length ? (
            <div className="space-y-1.5">
              {s.recent_alerts.slice(0, 5).map((al) => (
                <div
                  key={al.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2.5"
                >
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {al.title}
                    </p>
                    <p className="font-mono text-[11px] text-faint">
                      {label(ALERT_TYPE_LABELS, al.alert_type)} ·{" "}
                      {formatRelativeTime(al.created_at)}
                    </p>
                  </div>
                  <SeverityBadge severity={al.severity} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<UserCheck className="h-6 w-6" />}
              title="All clear"
              description="No alerts to review right now."
              className="border-0 bg-transparent py-8"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
