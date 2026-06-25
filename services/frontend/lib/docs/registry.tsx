import type { ComponentType } from "react";

import Introduction from "@/components/docs/content/introduction";
import Quickstart from "@/components/docs/content/quickstart";
import Architecture from "@/components/docs/content/architecture";
import Concepts from "@/components/docs/content/concepts";
import ConnectAssets from "@/components/docs/content/connect-assets";
import Scans from "@/components/docs/content/scans";
import Findings from "@/components/docs/content/findings";
import Policies from "@/components/docs/content/policies";
import Gateway from "@/components/docs/content/gateway";
import LlmGuard from "@/components/docs/content/llm-guard";
import AIGovernance from "@/components/docs/content/ai-governance";
import Rights from "@/components/docs/content/rights";
import Consent from "@/components/docs/content/consent";
import BreachResponse from "@/components/docs/content/breach-response";
import Reports from "@/components/docs/content/reports";
import ApiKeys from "@/components/docs/content/api-keys";
import ApiReference from "@/components/docs/content/api-reference";
import AlertsWebhooks from "@/components/docs/content/alerts-webhooks";
import SsoScim from "@/components/docs/content/sso-scim";
import Monitoring from "@/components/docs/content/monitoring";
import Security from "@/components/docs/content/security";
import Deployment from "@/components/docs/content/deployment";
import Faq from "@/components/docs/content/faq";

/**
 * Maps a doc slug to its content component. To add a page: create the content
 * component under `components/docs/content/`, import it here, and add the slug to
 * `lib/docs/nav.ts`. Everything else (sidebar, routing, prev/next) follows.
 */
export const DOC_COMPONENTS: Record<string, ComponentType> = {
  introduction: Introduction,
  quickstart: Quickstart,
  architecture: Architecture,
  concepts: Concepts,
  "connect-assets": ConnectAssets,
  scans: Scans,
  findings: Findings,
  policies: Policies,
  gateway: Gateway,
  "llm-guard": LlmGuard,
  "ai-governance": AIGovernance,
  rights: Rights,
  consent: Consent,
  "breach-response": BreachResponse,
  reports: Reports,
  "api-keys": ApiKeys,
  "api-reference": ApiReference,
  "alerts-webhooks": AlertsWebhooks,
  "sso-scim": SsoScim,
  monitoring: Monitoring,
  security: Security,
  deployment: Deployment,
  faq: Faq,
};

export function getDocComponent(slug: string): ComponentType | undefined {
  return DOC_COMPONENTS[slug];
}
