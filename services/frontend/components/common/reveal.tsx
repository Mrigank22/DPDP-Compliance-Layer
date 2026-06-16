"use client";

import { useEffect, useLayoutEffect, useRef, ReactNode } from "react";
import gsap from "gsap";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
}

/** Single element entrance, orchestrated with GSAP (no layout flash). */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  duration = 0.6,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y },
        { autoAlpha: 1, y: 0, duration, delay, ease: "power3.out" },
      );
    }, el);
    return () => ctx.revert();
  }, [delay, y, duration]);

  return (
    <div ref={ref} className={className} style={{ visibility: "hidden" }}>
      {children}
    </div>
  );
}

interface StaggerProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  y?: number;
  delay?: number;
}

/**
 * Staggers the entrance of any descendant marked with `data-reveal`.
 * Use for one well-orchestrated page load.
 */
export function Stagger({
  children,
  className,
  stagger = 0.07,
  y = 18,
  delay = 0.05,
}: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-reveal]");
    if (items.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        items,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          stagger,
          delay,
          ease: "power3.out",
        },
      );
    }, el);
    return () => ctx.revert();
  }, [stagger, y, delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

interface CountUpProps {
  value: number;
  className?: string;
  duration?: number;
  decimals?: number;
  suffix?: string;
}

/** Animated numeric counter for headline metrics. */
export function CountUp({
  value,
  className,
  duration = 1.1,
  decimals = 0,
  suffix = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obj = { v: 0 };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        v: value,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent =
            obj.v.toLocaleString("en-IN", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            }) + suffix;
        },
      });
    }, el);
    return () => ctx.revert();
  }, [value, duration, decimals, suffix]);

  return (
    <span ref={ref} className={className}>
      0{suffix}
    </span>
  );
}
