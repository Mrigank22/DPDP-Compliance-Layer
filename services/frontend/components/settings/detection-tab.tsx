"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, SlidersHorizontal, ShieldOff } from "lucide-react";
import {
  detectionAPI,
  type CustomPIIType,
  type IgnorePattern,
  type DetectionSettings,
} from "@/lib/api/detection";
import { getApiErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/store/toast.store";
import { Panel } from "@/components/common/panel";
import { LoadingPanel, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

function isValidRegex(pattern: string): boolean {
  if (!pattern) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

const emptyCustom: CustomPIIType = {
  key: "",
  label: "",
  regex: "",
  score: 0.85,
  enabled: true,
};

const DEFAULTS: DetectionSettings = {
  confidence_threshold: 0.7,
  custom_pii_types: [],
  ignore_patterns: [],
};

export function DetectionTab() {
  const q = useQuery({
    queryKey: ["detection-settings"],
    queryFn: () => detectionAPI.get(),
  });

  if (q.isLoading) return <LoadingPanel label="Loading detection settings…" />;
  if (q.isError)
    return <ErrorState message={getApiErrorMessage(q.error)} onRetry={() => q.refetch()} />;

  // Remount the form when the loaded settings change so initial state stays in
  // sync without a state-syncing effect.
  const initial = q.data?.data ?? DEFAULTS;
  return <DetectionForm key={initial.updated_at ?? "new"} initial={initial} />;
}

function DetectionForm({ initial }: { initial: DetectionSettings }) {
  const qc = useQueryClient();
  const [threshold, setThreshold] = useState(initial.confidence_threshold ?? 0.7);
  const [custom, setCustom] = useState<CustomPIIType[]>(initial.custom_pii_types ?? []);
  const [ignore, setIgnore] = useState<IgnorePattern[]>(initial.ignore_patterns ?? []);

  const save = useMutation({
    mutationFn: () =>
      detectionAPI.update({
        confidence_threshold: threshold,
        custom_pii_types: custom,
        ignore_patterns: ignore,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["detection-settings"] });
      toast.success("Detection settings saved", "New scans will use these rules.");
    },
    onError: (e) => toast.error("Could not save settings", getApiErrorMessage(e)),
  });

  const badCustom = custom.some((c) => c.regex.trim() !== "" && !isValidRegex(c.regex));
  const badIgnore = ignore.some((i) => i.pattern.trim() !== "" && !isValidRegex(i.pattern));
  const blocked = badCustom || badIgnore;

  const setCustomAt = (i: number, patch: Partial<CustomPIIType>) =>
    setCustom((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const setIgnoreAt = (i: number, patch: Partial<IgnorePattern>) =>
    setIgnore((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-6">
      {/* Confidence threshold */}
      <Panel title="Confidence threshold">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            The minimum confidence a detection must reach to be recorded as a finding.
            Raise it to cut false positives; lower it to catch more.
          </p>
          <div className="flex items-center gap-4">
            <SlidersHorizontal className="h-4 w-4 text-accent" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent"
              aria-label="Confidence threshold"
            />
            <span className="w-14 text-right font-mono text-sm text-foreground">
              {threshold.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-faint">Default is 0.70. Range 0.00–1.00.</p>
        </div>
      </Panel>

      {/* Custom detectors */}
      <Panel
        title="Custom PII detectors"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustom((p) => [...p, { ...emptyCustom }])}
          >
            <Plus className="h-4 w-4" /> Add detector
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Define organisation-specific identifiers (e.g. employee or policy numbers)
          as labelled regular expressions. Patterns are validated and run safely.
        </p>
        {custom.length === 0 ? (
          <p className="py-2 text-sm italic text-faint">No custom detectors yet.</p>
        ) : (
          <div className="space-y-2">
            {custom.map((c, i) => {
              const invalid = c.regex.trim() !== "" && !isValidRegex(c.regex);
              return (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface-2/40 p-3 md:grid-cols-12 md:items-center"
                >
                  <Input
                    className="font-mono text-xs uppercase md:col-span-2"
                    placeholder="KEY"
                    value={c.key}
                    onChange={(e) => setCustomAt(i, { key: e.target.value.toUpperCase() })}
                  />
                  <Input
                    className="text-sm md:col-span-3"
                    placeholder="Label"
                    value={c.label}
                    onChange={(e) => setCustomAt(i, { label: e.target.value })}
                  />
                  <Input
                    className={cn(
                      "font-mono text-xs md:col-span-4",
                      invalid && "border-critical text-critical",
                    )}
                    placeholder="regex e.g. EMP-\\d{6}"
                    value={c.regex}
                    onChange={(e) => setCustomAt(i, { regex: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    className="font-mono text-xs md:col-span-1"
                    value={c.score}
                    onChange={(e) => setCustomAt(i, { score: Number(e.target.value) })}
                  />
                  <div className="flex items-center justify-end gap-1 md:col-span-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={c.enabled ? "text-accent" : "text-faint"}
                      onClick={() => setCustomAt(i, { enabled: !c.enabled })}
                    >
                      {c.enabled ? "On" : "Off"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-critical hover:text-critical"
                      onClick={() => setCustom((p) => p.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Ignore list */}
      <Panel
        title="Ignore list (suppress false positives)"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIgnore((p) => [...p, { pattern: "", note: "" }])}
          >
            <Plus className="h-4 w-4" /> Add pattern
          </Button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Values matching any of these regular expressions are never flagged — use
          them to silence known test data or non-sensitive look-alikes.
        </p>
        {ignore.length === 0 ? (
          <p className="py-2 text-sm italic text-faint">No ignore patterns yet.</p>
        ) : (
          <div className="space-y-2">
            {ignore.map((p, i) => {
              const invalid = p.pattern.trim() !== "" && !isValidRegex(p.pattern);
              return (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface-2/40 p-3 md:grid-cols-12 md:items-center"
                >
                  <ShieldOff className="hidden h-4 w-4 text-faint md:col-span-1 md:block" />
                  <Input
                    className={cn(
                      "font-mono text-xs md:col-span-5",
                      invalid && "border-critical text-critical",
                    )}
                    placeholder="regex e.g. ^TEST-"
                    value={p.pattern}
                    onChange={(e) => setIgnoreAt(i, { pattern: e.target.value })}
                  />
                  <Input
                    className="text-sm md:col-span-5"
                    placeholder="Note (optional)"
                    value={p.note}
                    onChange={(e) => setIgnoreAt(i, { note: e.target.value })}
                  />
                  <div className="flex items-center justify-end md:col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-critical hover:text-critical"
                      onClick={() => setIgnore((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="flex items-center justify-end gap-3">
        {blocked && (
          <span className="font-mono text-xs text-critical">
            Fix invalid regular expressions before saving.
          </span>
        )}
        <Button onClick={() => save.mutate()} disabled={blocked || save.isPending}>
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving…" : "Save detection settings"}
        </Button>
      </div>
    </div>
  );
}
