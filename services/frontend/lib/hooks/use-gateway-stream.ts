"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cookie from "js-cookie";
import { gatewayAPI } from "@/lib/api/gateway";
import type { GatewayEvent } from "@/types/api";

const MAX_BUFFER = 120;

type ConnState = "idle" | "connecting" | "live" | "error";

/**
 * Live gateway event feed. Seeds with recent history via the paginated
 * endpoint, then streams new events over SSE (carrying the bearer token via a
 * fetch-based reader, since native EventSource cannot set Authorization).
 */
export function useGatewayLiveFeed(enabled: boolean) {
  const [events, setEvents] = useState<GatewayEvent[]>([]);
  const [state, setState] = useState<ConnState>("idle");
  const [seeded, setSeeded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const pushEvents = useCallback((incoming: GatewayEvent[], prepend: boolean) => {
    if (incoming.length === 0) return;
    setEvents((cur) => {
      const fresh = incoming.filter((e) => !seenRef.current.has(e.id));
      fresh.forEach((e) => seenRef.current.add(e.id));
      if (fresh.length === 0) return cur;
      const next = prepend ? [...fresh, ...cur] : [...cur, ...fresh];
      const trimmed = next.slice(0, MAX_BUFFER);
      // keep the seen-set from growing unbounded
      if (seenRef.current.size > MAX_BUFFER * 2) {
        seenRef.current = new Set(trimmed.map((e) => e.id));
      }
      return trimmed;
    });
  }, []);

  // Seed recent history once.
  useEffect(() => {
    let active = true;
    gatewayAPI
      .listEvents({ page: 1, page_size: 30 })
      .then((res) => {
        if (active) {
          pushEvents(res.data ?? [], false);
          setSeeded(true);
        }
      })
      .catch(() => active && setSeeded(true));
    return () => {
      active = false;
    };
  }, [pushEvents]);

  // Manage the SSE connection.
  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      const controller = new AbortController();
      abortRef.current = controller;
      setState("connecting");
      try {
        const token = Cookie.get("accessToken");
        const res = await fetch(gatewayAPI.liveEventsURL(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setState("live");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const evt = JSON.parse(dataLine.slice(5).trim()) as GatewayEvent;
              if (evt?.id) pushEvents([evt], true);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
        throw new Error("stream closed");
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setState("error");
        retry = setTimeout(connect, 3000);
      }
    }

    // Schedule on a macrotask so we never call setState synchronously in render.
    const start = setTimeout(connect, 0);

    return () => {
      cancelled = true;
      clearTimeout(start);
      if (retry) clearTimeout(retry);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, pushEvents]);

  return { events, state, seeded };
}
