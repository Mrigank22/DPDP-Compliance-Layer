import {
  H2,
  Lead,
  Cards,
  Card,
  Callout,
  Table,
  DocLink,
} from "@/components/docs/primitives";
import { Server, ShieldCheck, Cpu, MonitorSmartphone } from "lucide-react";

export default function Architecture() {
  return (
    <>
      <Lead>
        DataSentinel is four lightweight, independently deployable services backed
        by standard data stores. You can run the managed SaaS or host everything in
        your own environment.
      </Lead>

      <H2 id="the-services">The services</H2>
      <Cards>
        <Card title="Control plane" icon={Server}>
          The brain. Exposes the REST API, evaluates policies, stores findings, and
          orchestrates scans and reports.
        </Card>
        <Card title="Enforcement gateway" icon={ShieldCheck}>
          A high-performance proxy that inspects request and response bodies and
          applies policy actions inline, with only a few milliseconds of overhead.
        </Card>
        <Card title="Scan workers" icon={Cpu}>
          Background workers that connect to your assets, sample data, classify PII
          and check cloud posture, on a queue per job type.
        </Card>
        <Card title="Console" icon={MonitorSmartphone}>
          The web dashboard your analysts, DPOs and admins work in every day —
          including these docs.
        </Card>
      </Cards>

      <H2 id="data-stores">The data stores</H2>
      <Table
        head={["Store", "Used for"]}
        rows={[
          [
            "PostgreSQL 16",
            "Application state — assets, policies, findings, rights and consent — isolated per tenant with row-level security.",
          ],
          [
            "Redis 7",
            "Policy cache, the tokenization vault and the worker task queue.",
          ],
          [
            "ClickHouse 24",
            "High-volume audit logs and gateway events, retained for years for evidence.",
          ],
        ]}
      />
      <p>
        You can run these as managed services (Amazon RDS, ElastiCache, ClickHouse
        Cloud) or self-host them. See <DocLink href="/docs/deployment">Deployment</DocLink>.
      </p>

      <H2 id="how-data-moves">How data moves</H2>
      <ul>
        <li>
          <strong>Discovery</strong> — workers connect to a registered asset,
          sample records, and write classified findings to the control plane.
        </li>
        <li>
          <strong>Enforcement</strong> — application traffic routed through the
          gateway is inspected; matched policies mask, redact, block or tokenize
          PII before it leaves your estate, and every decision is logged.
        </li>
        <li>
          <strong>Governance</strong> — findings, gateway events, rights requests
          and consent records roll up into the dashboard, alerts and compliance
          reports.
        </li>
      </ul>

      <Callout variant="note" title="Data residency">
        Defaults target the <code>ap-south-1</code> (Mumbai) region. For full
        residency, run the entire platform inside your own VPC or Kubernetes
        cluster — see <DocLink href="/docs/deployment">Deployment</DocLink>.
      </Callout>
    </>
  );
}
