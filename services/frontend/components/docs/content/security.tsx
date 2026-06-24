import {
  H2,
  Lead,
  Callout,
  Cards,
  Card,
  Table,
  Steps,
  Step,
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
      <p>
        Access is enforced on every request by the API and again at the page level
        in the console: roles below the required level never see a restricted page
        or its actions. Team management, settings and the audit trail require Admin;
        rights and consent (which touch data-principal data) require Analyst or
        above.
      </p>

      <H2 id="auth">Authentication &amp; SSO</H2>
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
          <strong>Enterprise SSO</strong> via OpenID Connect and automated user
          provisioning via SCIM 2.0 — see{" "}
          <DocLink href="/docs/sso-scim">SSO &amp; SCIM</DocLink>.
        </li>
      </ul>

      <H2 id="audit">Tamper-evident audit log</H2>
      <p>
        Every privileged action is written to an immutable audit log retained for
        years. Each event is also appended to a per-tenant <strong>hash chain</strong>:
        an entry’s hash covers the previous entry’s hash plus its own contents, so
        altering, inserting or removing any past record breaks the chain.
      </p>
      <Steps>
        <Step title="Open the Audit Trail">
          Go to <strong>Audit</strong> in the console (Admin only).
        </Step>
        <Step title="Verify integrity">
          Select <strong>Verify integrity</strong>. DataSentinel recomputes the
          entire chain and reports whether it is intact — and, if not, the exact
          entry where tampering was detected.
        </Step>
      </Steps>

      <Callout variant="note" title="Data sovereignty">
        Defaults target the <code>ap-south-1</code> (Mumbai) region, and
        cross-border transfer policies let you keep regulated data inside India.
        For complete residency, self-host the platform — see{" "}
        <DocLink href="/docs/deployment">Deployment</DocLink>.
      </Callout>
    </>
  );
}
