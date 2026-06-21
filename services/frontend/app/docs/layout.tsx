import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/docs-shell";

export const metadata: Metadata = {
  title: {
    default: "Documentation — DataSentinel",
    template: "%s — DataSentinel Docs",
  },
  description:
    "Guides, how-tos and reference for DataSentinel — the DPDP-native data governance and sovereignty platform.",
};

/**
 * Public documentation layout. Lives outside the dashboard auth guard, so /docs
 * is readable by anyone without signing in.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
