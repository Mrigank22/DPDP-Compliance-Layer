import {
  H2,
  Lead,
  Callout,
  Cards,
  Card,
  CodeBlock,
} from "@/components/docs/primitives";
import { Cloud, Boxes } from "lucide-react";

export default function Deployment() {
  return (
    <>
      <Lead>
        Run DataSentinel as a managed service, or host the whole platform inside
        your own environment for complete data residency and network isolation.
      </Lead>

      <H2 id="options">Choose a model</H2>
      <Cards>
        <Card title="Managed SaaS" icon={Cloud}>
          We host and operate everything. You connect assets and route gateway
          traffic. Fastest path to value; nothing to maintain.
        </Card>
        <Card title="Private / self-hosted" icon={Boxes}>
          Deploy the full stack inside your own VPC or cluster for complete
          residency and isolation.
        </Card>
      </Cards>

      <H2 id="compose">Docker Compose (single host)</H2>
      <p>
        A complete stack — control plane, gateway, workers, dashboard, plus
        PostgreSQL, Redis, ClickHouse and an Nginx TLS terminator. A setup script
        generates secrets, runs migrations and seeds an admin user.
      </p>

      <H2 id="helm">Kubernetes (Helm)</H2>
      <p>A production-grade Helm chart deploys each service with sensible defaults:</p>
      <ul>
        <li>Separate deployments per service; one worker deployment per scan queue plus a scheduler.</li>
        <li>Horizontal Pod Autoscaling and PodDisruptionBudgets for the API and gateway.</li>
        <li>
          cert-manager TLS and ingress routing (<code>/</code> → dashboard,{" "}
          <code>/api</code> → control plane).
        </li>
        <li>External Secrets Operator integration, ServiceMonitors and optional NetworkPolicies.</li>
      </ul>
      <CodeBlock
        lang="bash"
        code={`helm upgrade --install datasentinel ./helm/datasentinel \\
  -n datasentinel --create-namespace \\
  -f values.yaml -f values.prod.yaml \\
  --set-string image.tag=<release>`}
      />

      <H2 id="requirements">Baseline requirements</H2>
      <ul>
        <li>PostgreSQL 16, Redis 7 and ClickHouse 24 (managed or self-hosted).</li>
        <li>A Kubernetes cluster (for example Amazon EKS, Mumbai) or a Docker host for Compose.</li>
        <li>A shared 32-byte master encryption key, kept stable and secret across services.</li>
      </ul>

      <Callout variant="danger" title="Protect the master key">
        Per-tenant encryption keys are derived from one master key. Keep it
        identical across services and never rotate it without a migration — rotating
        it makes previously-encrypted asset credentials unrecoverable.
      </Callout>

      <Callout variant="warn" title="Configure a reports bucket">
        For working report downloads in a self-hosted deployment, configure object
        storage for reports. Without it, generated reports record a placeholder link
        that cannot be served.
      </Callout>
    </>
  );
}
