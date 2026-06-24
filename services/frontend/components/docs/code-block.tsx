"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Highlight, Prism, type PrismTheme } from "prism-react-renderer";
import { cn } from "@/lib/cn";

// prism-react-renderer's bundled Prism omits the shell grammar, so curl / CLI
// snippets (the bulk of our examples) would render unhighlighted. Register a
// focused bash grammar once so they get the same on-brand colours.
if (typeof Prism !== "undefined" && Prism.languages && !Prism.languages.bash) {
  Prism.languages.bash = {
    comment: { pattern: /(^|[^"\\$])#.*/, lookbehind: true, greedy: true },
    string: [
      { pattern: /"(?:\\[\s\S]|\$\([^)]*\)|`[^`]*`|[^"\\])*"/, greedy: true },
      { pattern: /'[^']*'/, greedy: true },
    ],
    variable: /\$(?:\{[^}]+\}|\w+)/,
    function: {
      pattern:
        /(^|[\s;|&(])(?:curl|cd|npm|npx|pnpm|yarn|docker|docker-compose|kubectl|helm|git|python3?|pip3?|echo|cat|sudo|apt|apt-get|brew|node|go|make|bash|sh|chmod|mkdir|cp|mv|rm|ssh|scp|psql|mysql|terraform)(?=$|[\s;|&)])/,
      lookbehind: true,
    },
    keyword: {
      pattern: /(^|[\s;|&])(?:if|then|else|elif|fi|for|in|do|done|while|case|esac|function|return|export)(?=$|[\s;|&])/,
      lookbehind: true,
    },
    operator: /--[\w-]+|-\w+|[|&]{1,2}|[<>]=?/,
    number: /\b0x[\da-f]+\b|\b\d+\b/i,
  };
  Prism.languages.shell = Prism.languages.bash;
  Prism.languages.sh = Prism.languages.bash;
}

interface CodeBlockProps {
  code: string;
  /** Language label shown in the header (e.g. "bash", "json", "http"). */
  lang?: string;
  /** Optional filename/title shown on the left of the header. */
  title?: string;
  className?: string;
}

/** Common language labels → Prism grammar keys bundled with the renderer. */
const LANG_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  curl: "bash",
  js: "javascript",
  ts: "typescript",
  yml: "yaml",
  http: "bash",
};

/**
 * Syntax theme tuned to the DataSentinel "Threat Console" palette (signal-mint
 * strings, electric-cyan functions, violet keywords, warm-amber numbers) so code
 * reads on-brand on the obsidian code surface.
 */
const DS_THEME: PrismTheme = {
  plain: { color: "#d3dbea", backgroundColor: "transparent" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "#5a6680", fontStyle: "italic" } },
    { types: ["punctuation"], style: { color: "#8b98b0" } },
    { types: ["operator", "entity", "url"], style: { color: "#9aa7bf" } },
    { types: ["keyword", "atrule", "rule", "important", "selector"], style: { color: "#9b8cff" } },
    { types: ["boolean", "number", "constant", "symbol", "regex"], style: { color: "#ffb86b" } },
    { types: ["string", "char", "attr-value", "inserted"], style: { color: "#3ddc97" } },
    { types: ["function", "tag"], style: { color: "#34d2f0" } },
    { types: ["attr-name", "property"], style: { color: "#7cc7ff" } },
    { types: ["class-name", "builtin", "namespace", "maybe-class-name"], style: { color: "#ffd66b" } },
    { types: ["variable"], style: { color: "#d3dbea" } },
    { types: ["deleted"], style: { color: "#ff3b5c" } },
  ],
};

/**
 * Themed, copyable code block with on-brand syntax highlighting (powered by
 * prism-react-renderer, tokenised at render time so it is SSR-safe).
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

  const cleaned = code.replace(/\n$/, "");
  const key = (lang ?? "").toLowerCase();
  const language = LANG_ALIASES[key] ?? key ?? "text";

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
      <Highlight code={cleaned} language={language} theme={DS_THEME}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed">
            {tokens.map((line, i) => {
              const isBlank = line.length === 1 && line[0].content === "";
              return (
                <div key={i} {...getLineProps({ line })} className="whitespace-pre">
                  {isBlank
                    ? "\u00A0"
                    : line.map((token, k) => (
                        <span key={k} {...getTokenProps({ token })} />
                      ))}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
