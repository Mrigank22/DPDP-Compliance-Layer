import {
  H2,
  Lead,
  Callout,
  Cards,
  Card,
  Table,
  DocLink,
} from "@/components/docs/primitives";
import {
  Search,
  ShieldBan,
  ScrollText,
} from "lucide-react";

export default function Introduction() {
  return (
    <>
      <Lead>
        DataSentinel is an India-first data governance and sovereignty platform
        built for the Digital Personal Data Protection (DPDP) Act, 2023. It helps
        you find personal data across your estate, stop it from leaking, and prove
        you are handling it correctly.
      </Lead>

      <H2 id="what-it-does">What DataSentinel does</H2>
      <p>
        Personal data spreads across object storage, databases, internal APIs and,
        increasingly, third-party AI services. Most teams cannot see where it
        lives, where it flows, or whether it is leaking. DataSentinel closes that
        gap with three coordinated functions that work together from a single
        console.
      </p>

      <Cards cols={3}>
        <Card title="Discover" icon={Search}>
          Scan cloud and database assets to find and classify personal data, using
          recognisers tuned for Indian identifiers like Aadhaar, PAN and UPI.
        </Card>
        <Card title="Enforce" icon={ShieldBan}>
          Inspect live request and response traffic through an inline proxy and
          mask, redact, block or tokenize sensitive fields in real time.
        </Card>
        <Card title="Govern" icon={ScrollText}>
          Manage rights requests, consent, policies and audit-ready reporting
          against your DPDP obligations.
        </Card>
      </Cards>

      <H2 id="who-its-for">Who it is for</H2>
      <ul>
        <li>
          <strong>Data-protection officers &amp; compliance teams</strong> — prove
          DPDP compliance with living evidence instead of spreadsheets.
        </li>
        <li>
          <strong>Security engineers</strong> — stop PII from leaking into
          unauthorised APIs, storage and AI systems.
        </li>
        <li>
          <strong>Platform / DevOps teams</strong> — deploy lightweight services
          into existing Kubernetes or Docker estates.
        </li>
        <li>
          <strong>Leadership</strong> — see a single compliance score and risk
          posture across the whole organisation.
        </li>
      </ul>

      <H2 id="why">Why teams choose DataSentinel</H2>
      <Table
        head={["Challenge", "How DataSentinel helps"]}
        rows={[
          [
            "“We don’t know where personal data is.”",
            "Automated discovery and classification across S3, RDS and PostgreSQL with column- and object-level findings.",
          ],
          [
            "“Sensitive data leaks into external APIs and LLMs.”",
            "An inline enforcement gateway that masks, blocks or tokenizes PII in real time, including dedicated AI/LLM protection.",
          ],
          [
            "“We can’t respond to data-principal requests in time.”",
            "A built-in DSR workflow with 90-day deadline tracking and cross-asset data search.",
          ],
          [
            "“Audits are painful and manual.”",
            "One-click DPDP, DPIA and audit-evidence reports backed by an immutable event trail.",
          ],
          [
            "“Our data must stay in India.”",
            "Data-sovereignty controls, India-region defaults and cross-border transfer policies.",
          ],
        ]}
      />

      <Callout variant="tip" title="New here?">
        Start with the <DocLink href="/docs/quickstart">Quickstart</DocLink> to connect your
        first asset and see findings within minutes, then read{" "}
        <DocLink href="/docs/concepts">Core concepts</DocLink> to understand the building
        blocks.
      </Callout>
    </>
  );
}
