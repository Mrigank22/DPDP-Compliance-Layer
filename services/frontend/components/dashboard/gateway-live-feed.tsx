"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Radio, Pause, Play, Brain, ArrowRight, Activity } from "lucide-react";
import type { GatewayEvent } from "@/types/api";
import { useGatewayLiveFeed } from "@/lib/hooks/use-gateway-stream";
import { PiiTags } from "@/components/common/indicators";
import { EmptyState, LoadingPanel } from "@/components/common/states";
import { cn } from "@/lib/cn";

const ACTION_TONE: Record<string, string> = {
  blocked: "text-critical border-critical/40 bg-critical/10",
  redacted: "text-high border-high/40 bg-high/10",
  masked: "text-medium border-medium/40 bg-medium/10",
  tokenized: "text-accent-2 border-accent-2/40 bg-accent-2/10",
  allowed: "text-faint border-border bg-surface-3",
};

function hostOf(url: string) {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url.slice(0, 32);
  }
}

function timeOf(ts: string) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString("en-IN", { hour12: false });
}

export function GatewayLiveFeed({
  live,
  onToggle,
}: {
  live: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { events, state, seeded } = useGatewayLiveFeed(live);

  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            {live && state === "live" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical/70" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                live && state === "live"
                  ? "bg-critical"
                  : state === "connecting"
                    ? "bg-medium"
                    : "bg-faint",
              )}
            />
          </span>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            Live Interception Feed
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
            {live
              ? state === "live"
                ? "streaming"
                : state === "connecting"
                  ? "connecting…"
                  : state === "error"
                    ? "reconnecting…"
                    : "idle"
              : "paused"}
          </span>
        </div>
        <button
          onClick={() => onToggle(!live)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors",
            live
              ? "border-critical/40 bg-critical/10 text-critical hover:bg-critical/20"
              : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
          )}
        >
          {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {live ? "Pause" : "Go Live"}
        </button>
      </header>

      <div className="max-h-[460px] overflow-y-auto">
        {!seeded ? (
          <LoadingPanel label="Loading interception feed…" />
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-6 w-6" />}
            title={live ? "Listening for traffic…" : "No events captured yet"}
            description={
              live
                ? "New interceptions will stream in as traffic flows through the gateway."
                : "Press Go Live to stream gateway interceptions in real time."
            }
            className="border-0 bg-transparent py-12"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            <AnimatePresence initial={false}>
              {events.map((e: GatewayEvent) => (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, backgroundColor: "rgba(0,229,160,0.10)" }}
                  animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                  transition={{ duration: 0.5 }}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5 text-sm"
                >
                  <span className="font-mono text-[11px] tabular-nums text-faint">
                    {timeOf(e.timestamp)}
                  </span>

                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs text-muted">{e.source_ip || "—"}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-faint" />
                    <span className="truncate font-mono text-xs text-foreground">
                      {hostOf(e.destination_url)}
                    </span>
                    {e.was_llm_call && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-violet/40 bg-violet/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-violet">
                        <Brain className="h-3 w-3" />
                        {e.llm_provider || "llm"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    {e.pii_types_detected?.length > 0 && (
                      <PiiTags types={e.pii_types_detected} max={3} />
                    )}
                    <span className="font-mono text-[10px] tabular-nums text-faint">
                      {e.processing_latency_ms}ms
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                        ACTION_TONE[e.action_taken] ?? "text-muted border-border",
                      )}
                    >
                      {e.action_taken}
                    </span>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {events.length > 0 && (
        <footer className="flex items-center justify-between border-t border-border px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-faint">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-accent" />
            {events.length} events buffered
          </span>
          <span>p99 latency budget &lt; 5ms</span>
        </footer>
      )}
    </section>
  );
}
