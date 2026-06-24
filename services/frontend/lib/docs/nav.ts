import type { LucideIcon } from "lucide-react";
import {
  Rocket,
  Boxes,
  PlugZap,
  Activity,
  LifeBuoy,
} from "lucide-react";

/**
 * Documentation information architecture.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the docs navigation, the static
 * routes that get generated, and the prev/next links. To add a new page:
 *   1. Add an item to the relevant group below (slug + title + description).
 *   2. Create `components/docs/content/<slug>.tsx` (default export).
 *   3. Register it in `lib/docs/registry.tsx`.
 * The sidebar, breadcrumbs, search and prev/next wiring update automatically.
 *
 * Keep this module free of heavy/client-only imports — it is consumed by both
 * server (route generation) and client (sidebar) code.
 */

export interface DocItem {
  slug: string;
  title: string;
  /** One-line summary shown in search results and the overview cards. */
  description: string;
}

export interface DocGroup {
  title: string;
  icon: LucideIcon;
  items: DocItem[];
}

export const DOC_NAV: DocGroup[] = [
  {
    title: "Getting Started",
    icon: Rocket,
    items: [
      {
        slug: "introduction",
        title: "Introduction",
        description: "What DataSentinel is and the problems it solves.",
      },
      {
        slug: "quickstart",
        title: "Quickstart",
        description: "Go from sign-in to your first findings in five steps.",
      },
      {
        slug: "architecture",
        title: "Architecture",
        description: "How the control plane, gateway, workers and console fit together.",
      },
      {
        slug: "concepts",
        title: "Core concepts",
        description: "Tenants, assets, findings, policies and data flows explained.",
      },
    ],
  },
  {
    title: "Core Features",
    icon: Boxes,
    items: [
      {
        slug: "connect-assets",
        title: "Connect an asset",
        description: "Register S3, PostgreSQL and RDS sources for scanning.",
      },
      {
        slug: "scans",
        title: "Scans & workers",
        description: "Run discovery, classification and posture scans.",
      },
      {
        slug: "findings",
        title: "Findings",
        description: "Triage, resolve and track personal-data exposures.",
      },
      {
        slug: "policies",
        title: "Policies & templates",
        description: "Define and version the rules that govern personal data.",
      },
      {
        slug: "gateway",
        title: "Enforcement gateway",
        description: "Mask, block and tokenize PII on live traffic.",
      },
      {
        slug: "llm-guard",
        title: "AI / LLM guard",
        description: "Strip PII from prompts before they reach external models.",
      },
      {
        slug: "ai-governance",
        title: "AI governance",
        description: "Inventory AI systems and surface unsanctioned shadow AI.",
      },
      {
        slug: "rights",
        title: "Data-principal rights",
        description: "Handle DSRs against the 90-day DPDP deadline.",
      },
      {
        slug: "consent",
        title: "Consent management",
        description: "Record, summarise and withdraw consent by purpose.",
      },
      {
        slug: "reports",
        title: "Reports & evidence",
        description: "Generate DPDP, DPIA and audit-evidence documents.",
      },
    ],
  },
  {
    title: "Integrations & API",
    icon: PlugZap,
    items: [
      {
        slug: "sso-scim",
        title: "SSO & SCIM",
        description: "Connect your IdP for single sign-on and automatic user provisioning.",
      },
      {
        slug: "api-keys",
        title: "API keys",
        description: "Create scoped keys and authenticate machine-to-machine calls.",
      },
      {
        slug: "api-reference",
        title: "API reference",
        description: "Base URL, the response envelope and common endpoints.",
      },
      {
        slug: "alerts-webhooks",
        title: "Alerts & webhooks",
        description: "Route incidents to Slack, PagerDuty, JIRA and email.",
      },
    ],
  },
  {
    title: "Operate & Deploy",
    icon: Activity,
    items: [
      {
        slug: "monitoring",
        title: "Monitoring",
        description: "Dashboard widgets, the live feed and Prometheus metrics.",
      },
      {
        slug: "security",
        title: "Security model",
        description: "Encryption, tenant isolation and role-based access.",
      },
      {
        slug: "deployment",
        title: "Deployment",
        description: "SaaS, Docker Compose and Kubernetes (Helm) options.",
      },
    ],
  },
  {
    title: "Reference",
    icon: LifeBuoy,
    items: [
      {
        slug: "faq",
        title: "FAQ & troubleshooting",
        description: "Answers to the questions we hear most often.",
      },
    ],
  },
];

/** Flattened, ordered list of every doc item. */
export const FLAT_DOCS: DocItem[] = DOC_NAV.flatMap((g) => g.items);

/** The default landing doc when visiting /docs. */
export const DEFAULT_DOC_SLUG = "introduction";

export function getDocItem(slug: string): DocItem | undefined {
  return FLAT_DOCS.find((d) => d.slug === slug);
}

export function getGroupForSlug(slug: string): DocGroup | undefined {
  return DOC_NAV.find((g) => g.items.some((i) => i.slug === slug));
}

export interface AdjacentDocs {
  prev?: DocItem;
  next?: DocItem;
}

export function getAdjacentDocs(slug: string): AdjacentDocs {
  const idx = FLAT_DOCS.findIndex((d) => d.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? FLAT_DOCS[idx - 1] : undefined,
    next: idx < FLAT_DOCS.length - 1 ? FLAT_DOCS[idx + 1] : undefined,
  };
}
