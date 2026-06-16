"use client";

import { useMemo } from "react";
import { Database, Brain, Cloud, Globe, Server } from "lucide-react";
import type { DataFlow } from "@/types/api";
import { EmptyState } from "@/components/common/states";

function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url.slice(0, 24);
  }
}

function destIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("llm")) return Brain;
  if (t.includes("storage")) return Cloud;
  if (t.includes("api")) return Globe;
  return Server;
}

/**
 * Force-directed-style data-flow map: a central data estate with destination
 * nodes arranged radially. Edges are colored by approval (mint=approved,
 * red=unapproved) with an animated signal pulse.
 */
export function DataFlowMap({ flows }: { flows: DataFlow[] }) {
  const nodes = useMemo(() => {
    const top = [...flows]
      .sort((a, b) => b.event_count - a.event_count)
      .slice(0, 8);
    const cx = 300;
    const cy = 185;
    const r = 132;
    return top.map((f, i) => {
      const angle = (i / Math.max(top.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        flow: f,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
  }, [flows]);

  if (flows.length === 0) {
    return (
      <EmptyState
        title="No data flows yet"
        description="Once traffic routes through the gateway, observed flows map here."
        className="border-0 bg-transparent py-10"
      />
    );
  }

  const approved = flows.filter((f) => f.is_approved).length;
  const unapproved = flows.length - approved;

  return (
    <div>
      <svg viewBox="0 0 600 370" className="w-full" role="img" aria-label="Data flow map">
        <defs>
          <radialGradient id="estate-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00e5a0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00e5a0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* edges */}
        {nodes.map(({ flow, x, y }, i) => {
          const color = flow.is_approved ? "#00e5a0" : "#ff3b5c";
          return (
            <g key={`edge-${flow.id}`}>
              <line
                x1={300}
                y1={185}
                x2={x}
                y2={y}
                stroke={color}
                strokeOpacity={0.35}
                strokeWidth={1.5}
                strokeDasharray="4 5"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-18"
                  dur={`${1.4 + (i % 3) * 0.3}s`}
                  repeatCount="indefinite"
                />
              </line>
            </g>
          );
        })}

        {/* center estate */}
        <circle cx={300} cy={185} r={64} fill="url(#estate-glow)" />
        <circle cx={300} cy={185} r={34} fill="#0e1320" stroke="#00e5a0" strokeOpacity={0.5} strokeWidth={1.5} />
        <foreignObject x={266} y={151} width={68} height={68}>
          <div className="flex h-full w-full flex-col items-center justify-center">
            <Database className="h-5 w-5 text-accent" />
            <span className="mt-0.5 font-mono text-[8px] uppercase tracking-wide text-accent">Estate</span>
          </div>
        </foreignObject>

        {/* destination nodes */}
        {nodes.map(({ flow, x, y }) => {
          const Icon = destIcon(flow.destination_type);
          const color = flow.is_approved ? "#00e5a0" : "#ff3b5c";
          return (
            <g key={`node-${flow.id}`}>
              <circle cx={x} cy={y} r={20} fill="#121826" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} />
              <foreignObject x={x - 12} y={y - 12} width={24} height={24}>
                <div className="flex h-full w-full items-center justify-center">
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
              </foreignObject>
              <text
                x={x}
                y={y + 34}
                textAnchor="middle"
                className="fill-muted font-mono"
                style={{ fontSize: 9 }}
              >
                {hostOf(flow.destination_url).slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex items-center justify-center gap-5 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" /> Approved · {approved}
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full bg-critical" /> Unapproved · {unapproved}
        </span>
      </div>
    </div>
  );
}
