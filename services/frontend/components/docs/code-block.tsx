"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

interface CodeBlockProps {
  code: string;
  /** Language label shown in the header (e.g. "bash", "json", "http"). */
  lang?: string;
  /** Optional filename/title shown on the left of the header. */
  title?: string;
  className?: string;
}

/**
 * Themed, copyable code block. Kept dependency-free (no syntax-highlight engine)
 * so it stays fast and fully on-brand. Comments (# / //) and shell prompts get a
 * subtle tint via line-level styling.
 */
export function CodeBlock({ code, lang, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const lines = code.replace(/\n$/, "").split("\n");

  return (
    <div
      className={cn(
        "group relative my-5 overflow-hidden rounded-xl border border-border bg-[#080c14]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-surface/40 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          {title ?? lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[11px] transition-colors",
            copied
              ? "border-accent/40 text-accent"
              : "text-faint hover:border-border-bright hover:text-foreground",
          )}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-relaxed">
        <code className="font-mono text-foreground/90">
          {lines.map((line, i) => {
            const trimmed = line.trimStart();
            const isComment =
              trimmed.startsWith("#") || trimmed.startsWith("//");
            return (
              <span
                key={i}
                className={cn(
                  "block whitespace-pre",
                  isComment && "text-faint",
                )}
              >
                {line.length ? line : "\u00A0"}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
