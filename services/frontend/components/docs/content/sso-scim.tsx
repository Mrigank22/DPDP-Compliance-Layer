import {
  H2,
  H3,
  Lead,
  Callout,
  Cards,
  Card,
  Table,
  Steps,
  Step,
  Field,
  FieldList,
  CodeBlock,
  DocLink,
} from "@/components/docs/primitives";
import { KeyRound, Users, ShieldCheck, Building2 } from "lucide-react";

export default function SsoScim() {
  return (
    <>
      <Lead>
        Connect your identity provider so your team signs in with your corporate
        credentials, and let user accounts be created, updated and deactivated
        automatically. DataSentinel supports OpenID Connect (OIDC) for single
        sign-on and SCIM 2.0 for automated provisioning.
      </Lead>

      <Cards>
        <Card title="Single sign-on (OIDC)" icon={KeyRound}>
          Users on your verified email domains are redirected to your identity
          provider to authenticate — no separate password to manage.
        </Card>
        <Card title="Provisioning (SCIM 2.0)" icon={Users}>
          Your IdP creates and deactivates accounts for you, so joiners and leavers
          are handled the moment they change in your directory.
        </Card>
      </Cards>

      <Callout variant="note" title="Where to configure">
        Everything below lives under <strong>Settings → SSO</strong> and requires the
        Admin role. Set up SSO first — the SCIM token is attached to your SSO
        connection.
      </Callout>

      <H2 id="sso">Set up enterprise SSO (OIDC)</H2>
      <p className="text-muted">
        DataSentinel works with any OIDC-compliant provider — Okta, Microsoft Entra
        ID, Google Workspace, Ping and others. You will register DataSentinel as an
        application in your IdP, then paste the resulting credentials back into
        DataSentinel.
      </p>

      <Steps>
        <Step title="Create an OIDC app in your IdP">
          Add a new web/OIDC application. When asked for the redirect (callback)
          URL, use the value shown on the SSO settings page:
          <CodeBlock
            lang="bash"
            code={`https://app.datasentinel.io/api/v1/auth/sso/callback`}
          />
        </Step>
        <Step title="Copy the issuer and client credentials">
          From your IdP, copy the issuer URL, client ID and client secret into the
          matching fields in DataSentinel.
        </Step>
        <Step title="Add your email domains">
          List the domains your users sign in with (for example
          <code> acme.com</code>). Anyone with a matching email is routed to your
          provider at login.
        </Step>
        <Step title="Choose the default role and provisioning">
          Pick the role new users receive on first login, and decide whether to
          auto-provision accounts the first time someone signs in.
        </Step>
        <Step title="Enable and save">
          Toggle SSO on and save. Users can now choose “Continue with SSO” on the
          login screen.
        </Step>
      </Steps>

      <H3 id="sso-fields">Connection fields</H3>
      <FieldList>
        <Field name="issuer_url" type="string" required>
          The OIDC issuer/discovery URL. DataSentinel reads the provider metadata
          from <code>/.well-known/openid-configuration</code> under this URL.
        </Field>
        <Field name="client_id" type="string" required>
          The client identifier issued by your IdP.
        </Field>
        <Field name="client_secret" type="string" required>
          The client secret. It is encrypted at rest; leave it blank when editing to
          keep the stored value.
        </Field>
        <Field name="email_domains" type="string[]" required>
          Comma-separated domains routed to your IdP at login.
        </Field>
        <Field name="default_role" type="viewer | analyst | admin" required>
          The role assigned to newly provisioned users. Never grants Owner.
        </Field>
        <Field name="auto_provision" type="boolean">
          When on, a matching user is created on first successful SSO login. When
          off, only users an admin has already invited may sign in.
        </Field>
      </FieldList>

      <Callout variant="note" title="How SSO users sign in">
        Accounts created through SSO have no password — they always authenticate via
        your provider. Disabled accounts are rejected even with a valid IdP session.
      </Callout>

      <H2 id="scim">Automate user provisioning (SCIM 2.0)</H2>
      <p className="text-muted">
        With SCIM enabled, your identity provider keeps DataSentinel in sync: it
        creates accounts when people join a group, updates them when details change,
        and deactivates them when people leave.
      </p>

      <Steps>
        <Step title="Generate a SCIM token">
          On the SSO settings page, select <strong>Generate token</strong>. The
          bearer token is shown <strong>once</strong> — copy it immediately. This
          also enables SCIM for your workspace.
        </Step>
        <Step title="Configure your IdP">
          In your provider’s provisioning settings, paste the SCIM base URL and the
          token as a bearer credential:
          <CodeBlock
            lang="bash"
            code={`Base URL:  https://app.datasentinel.io/scim/v2
Auth:      Bearer <your-scim-token>`}
          />
        </Step>
        <Step title="Map attributes">
          Map the user’s primary email to <code>userName</code>. New users receive
          the default role from your SSO connection.
        </Step>
      </Steps>

      <H3 id="scim-operations">Supported operations</H3>
      <Table
        head={["Operation", "SCIM call", "Effect in DataSentinel"]}
        rows={[
          ["Create user", "POST /Users", "Creates an account with the SSO default role; no password."],
          ["Update user", "PUT / PATCH /Users/:id", "Updates the display name and active state."],
          ["Deactivate", "PATCH active=false or DELETE /Users/:id", "Disables the account and revokes its active sessions."],
          ["Look up", "GET /Users?filter=userName eq \"x\"", "Finds a user by email (used by your IdP to reconcile)."],
          ["List", "GET /Users", "Returns a paginated list of the tenant’s users."],
        ]}
      />

      <Callout variant="warn" title="Treat the token like a password">
        The SCIM token grants directory access to your workspace. It is stored only
        as a hash and cannot be retrieved after generation — regenerate to rotate it,
        which immediately invalidates the previous token. Use{" "}
        <strong>Disable SCIM</strong> to revoke it entirely.
      </Callout>

      <H3 id="deprovisioning">Deprovisioning</H3>
      <p className="text-muted">
        When your IdP deactivates or removes a user, DataSentinel disables the
        account and revokes its refresh tokens, so existing sessions can no longer be
        renewed. Accounts are soft-disabled rather than deleted, preserving the audit
        trail of their past actions.
      </p>

      <Cards>
        <Card title="Access control" icon={ShieldCheck} href="/docs/security">
          How roles map to capabilities and page access.
        </Card>
        <Card title="Deployment" icon={Building2} href="/docs/deployment">
          Self-host to keep identity and data inside your own environment.
        </Card>
      </Cards>

      <Callout variant="note" title="Self-hosted URLs">
        Replace <code>app.datasentinel.io</code> with your own host. The exact
        redirect and SCIM URLs for your workspace are always shown on the SSO
        settings page. See <DocLink href="/docs/deployment">Deployment</DocLink>.
      </Callout>
    </>
  );
}
