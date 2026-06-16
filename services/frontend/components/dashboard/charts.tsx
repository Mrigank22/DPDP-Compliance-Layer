"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { PII_LABELS } from "@/lib/utils/labels";
import { getSeverityHex } from "@/lib/utils/helpers";
import { EmptyState } from "@/components/common/states";

const PII_PALETTE = [
  "#00e5a0",
  "#29d8f0",
  "#ffc23d",
  "#ff7a3d",
  "#3fb6ff",
  "#8b7dff",
  "#ff3b5c",
  "#5eead4",
  "#f0abfc",
  "#a3e635",
];

interface ThemeTooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

function ThemeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ThemeTooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-xl backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-faint">
          {label}
        </p>
      )}
      {payload.map((p, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="capitalize text-muted">{p.name}</span>
          <span className="ml-auto font-mono font-semibold text-foreground">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** PII type distribution donut. */
export function PiiDonut({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No PII detected yet"
        description="Run a scan to populate the PII distribution."
        className="border-0 bg-transparent py-10"
      />
    );
  }

  const chartData = entries.map(([k, v], i) => ({
    name: PII_LABELS[k] ?? k,
    value: v,
    fill: PII_PALETTE[i % PII_PALETTE.length],
  }));
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip content={<ThemeTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold text-foreground">
            {total.toLocaleString("en-IN")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-faint">
            records
          </span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {chartData.slice(0, 8).map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: d.fill }}
            />
            <span className="truncate text-muted">{d.name}</span>
            <span className="ml-auto font-mono text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

/** Stacked findings-over-time area chart. */
export function FindingsTrend({
  data,
}: {
  data: { date: string; critical?: number; high?: number; medium?: number; low?: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No trend data"
        description="Findings over time will appear here once scans run."
        className="border-0 bg-transparent py-10"
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {SEVERITIES.map((s) => (
            <linearGradient key={s} id={`grad-${s}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={getSeverityHex(s)} stopOpacity={0.5} />
              <stop offset="100%" stopColor={getSeverityHex(s)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          tick={{ fill: "var(--color-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<ThemeTooltip />} />
        {SEVERITIES.map((s) => (
          <Area
            key={s}
            type="monotone"
            dataKey={s}
            stackId="1"
            stroke={getSeverityHex(s)}
            strokeWidth={1.5}
            fill={`url(#grad-${s})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Findings-by-severity horizontal bars. */
export function SeverityBars({ data }: { data: Record<string, number> }) {
  const order = ["critical", "high", "medium", "low", "info"];
  const chartData = order
    .filter((s) => (data?.[s] ?? 0) >= 0)
    .map((s) => ({ name: s, value: data?.[s] ?? 0, fill: getSeverityHex(s) }));
  const hasData = chartData.some((d) => d.value > 0);

  if (!hasData) {
    return (
      <EmptyState
        title="No open findings"
        description="Severity breakdown will appear here."
        className="border-0 bg-transparent py-8"
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
      >
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--color-faint)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={70}
          tick={{ fill: "var(--color-muted)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ThemeTooltip />} cursor={{ fill: "var(--color-surface-2)" }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
