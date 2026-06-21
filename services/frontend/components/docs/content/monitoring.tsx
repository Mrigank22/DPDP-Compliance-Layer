import {
  H2,
  Lead,
  Callout,
  Cards,
  Card,
  Table,
} from "@/components/docs/primitives";
import { Gauge, Radio, TrendingUp, Map } from "lucide-react";

export default function Monitoring() {
  return (
    <>
      <Lead>
        Watch your data-protection posture continuously — from a single compliance
        score down to individual enforcement decisions in real time.
      </Lead>

      <H2 id="dashboard">In the dashboard</H2>
      <Cards>
        <Card title="Compliance score" icon={Gauge}>
          A single 0–100 measure of your posture, updated as findings change.
        </Card>
        <Card title="Gateway live feed" icon={Radio}>
          A streaming view of enforcement decisions — masked, blocked, tokenized —
          with PII types, action and latency.
        </Card>
        <Card title="Findings trend" icon={TrendingUp}>
          Findings per day over the last 30 days, stacked by severity.
        </Card>
        <Card title="Data-flow map" icon={Map}>
          Every detected destination for personal data, colour-coded approved
          (green) vs. unapproved (red).
        </Card>
      </Cards>
      <p>
        The dashboard also surfaces DPDP status checks, your top-risk assets, open
        and critical finding counts, unacknowledged alerts and overdue rights
        requests — each linking straight to the relevant page.
      </p>

      <H2 id="metrics">For your platform team</H2>
      <Table
        head={["Signal", "Where"]}
        rows={[
          [
            "Prometheus metrics",
            "The gateway exposes /metrics (requests, PII detections, blocks, LLM calls, latency, uptime) for scraping into Grafana.",
          ],
          [
            "Health endpoints",
            "/healthz (liveness) and /readyz (readiness) on every service for Kubernetes probes.",
          ],
          [
            "Structured logs",
            "Every service logs JSON with request IDs and tenant context — and never logs raw PII.",
          ],
        ]}
      />

      <Callout variant="tip" title="Leading indicators">
        Watch for gateway block-rate spikes, sudden bulk-export findings, rising
        overdue-DSR counts and new unapproved data flows — these are the earliest
        signs of a developing incident.
      </Callout>
    </>
  );
}
