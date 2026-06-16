"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function scoreColor(score: number) {
  if (score >= 80) return "#00e5a0";
  if (score >= 60) return "#ffc23d";
  if (score >= 40) return "#ff7a3d";
  return "#ff3b5c";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Strong posture";
  if (score >= 60) return "Needs attention";
  if (score >= 40) return "At risk";
  return "Critical exposure";
}

/** Animated radial compliance gauge driven by GSAP. */
export function ComplianceGauge({ score }: { score: number }) {
  const ringRef = useRef<SVGCircleElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const color = scoreColor(score);

  const size = 200;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75; // 270° arc
  const pct = Math.max(0, Math.min(100, score)) / 100;

  useIso(() => {
    const ring = ringRef.current;
    const num = numRef.current;
    if (!ring) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ring,
        { strokeDashoffset: arc },
        {
          strokeDashoffset: arc * (1 - pct),
          duration: 1.5,
          ease: "power3.out",
        },
      );
      if (num) {
        const obj = { v: 0 };
        gsap.to(obj, {
          v: score,
          duration: 1.5,
          ease: "power3.out",
          onUpdate: () => {
            num.textContent = Math.round(obj.v).toString();
          },
        });
      }
    });
    return () => ctx.revert();
  }, [pct, arc, score]);

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[135deg]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-3)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circ}`}
          strokeLinecap="round"
        />
        <circle
          ref={ringRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circ}`}
          strokeDashoffset={arc}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          ref={numRef}
          className="font-display text-5xl font-bold tabular-nums"
          style={{ color }}
        >
          0
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          / 100
        </span>
        <span className="mt-1 text-xs font-medium" style={{ color }}>
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}
