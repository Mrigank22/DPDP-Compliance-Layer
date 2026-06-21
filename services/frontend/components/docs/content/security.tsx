import {
  H2,
  Lead,
  Callout,
  Cards,
  Card,
  Table,
  DocLink,
} from "@/components/docs/primitives";
import { Lock, Users } from "lucide-react";

export default function Security() {
  return (
    <>
      <Lead>
        Security is foundational to DataSentinel, not an add-on. Personal data is
        protected in transit and at rest, tenants are strictly isolated, and access
        is governed by role.
      </Lead>

      <H2 id="encryption">Encryption &amp; isolation</H2>
      <Cards>
        <Card title="Encryption" icon={Lock}>
          Asset credentials and secrets are encrypted with AES-256-GCM using a key
          unique to each tenant (derived via HKDF from a master key). Passwords use
          bcrypt; API keys are SHA-256 hashed and never stored in clear. TLS is
          enforced in transit.
        </Card>
        <Card title="Tenant isolation" icon={Users}>
          Row-level security in PostgreSQL scopes every query to a single tenant,
          and the tenant context is set on each request and scan. One workspace can
          never see another’s data.
        </Card>
      </Cards>

      <H2 id="rbac">Role-based access control</H2>
      <Table
        head={["Role", "Capabilities"]}
        rows={[
          ["Owner", "Full access, including billing; can delete the workspace."],
          ["Admin", "Full access except billing."],
          ["Analyst", "Read and write on findings and policies; cannot manage the team or delete."],
          ["Viewer", "Read-only across the product (except secrets like API keys)."],
        ]}
      />

      <H2 id="auth">Authentication &amp; audit</H2>
      <ul>
        <li>
          <strong>RS256 JWTs</strong> with short-lived access tokens and rotating
          refresh tokens.
        </li>
        <li>
          Optional <strong>multi-factor authentication</strong> (TOTP); accounts
          lock after repeated failed logins.
        </li>
        <li>
          Every privileged action is written to an <strong>immutable audit log</strong>{" "}
          retained for years.
        </li>
      </ul>

      <Callout variant="note" title="Data sovereignty">
        Defaults target the <code>ap-south-1</code> (Mumbai) region, and
        cross-border transfer policies let you keep regulated data inside India.
        For complete residency, self-host the platform — see{" "}
        <DocLink href="/docs/deployment">Deployment</DocLink>.
      </Callout>
    </>
  );
}
