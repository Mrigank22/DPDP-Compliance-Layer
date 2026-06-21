import {
  H2,
  H3,
  Lead,
  Callout,
  CodeBlock,
  Table,
  DocLink,
} from "@/components/docs/primitives";

export default function ApiReference() {
  return (
    <>
      <Lead>
        Everything in the console is available through a clean REST API. Automate
        onboarding, scanning, reporting and rights workflows from your own systems.
      </Lead>

      <H2 id="base-url">Base URL &amp; authentication</H2>
      <p>
        The API base path is <code>/api/v1</code>. Authenticate with a user’s
        Bearer JWT, or an <DocLink href="/docs/api-keys">API key</DocLink> for
        machine-to-machine use.
      </p>
      <CodeBlock
        lang="bash"
        code={`# API key
curl https://app.datasentinel.io/api/v1/dashboard \\
  -H "X-API-Key: ds_live_••••••••"

# Bearer token
curl https://app.datasentinel.io/api/v1/auth/me \\
  -H "Authorization: Bearer <jwt>"`}
      />

      <H2 id="envelope">The response envelope</H2>
      <p>Every response uses a consistent envelope:</p>
      <CodeBlock
        lang="json"
        code={`{
  "data": { },
  "meta": {
    "pagination": {
      "page": 1, "page_size": 20, "total_items": 137,
      "total_pages": 7, "has_next": true, "has_prev": false
    }
  },
  "error": null,
  "request_id": "req_8f3c2a1b"
}`}
      />
      <p>
        On failure, <code>data</code> is null and <code>error</code> contains a{" "}
        <code>code</code> and <code>message</code>. Always include the{" "}
        <code>request_id</code> when contacting support.
      </p>

      <H3 id="pagination">Pagination</H3>
      <p>
        List endpoints accept <code>page</code> (default 1) and{" "}
        <code>page_size</code> (default 20, max 100), and return pagination details
        under <code>meta.pagination</code>.
      </p>

      <H2 id="endpoints">Common endpoints</H2>
      <Table
        head={["Area", "Endpoints"]}
        rows={[
          ["Assets", <code key="a">GET/POST /assets · /assets/:id/scan · /assets/:id/findings</code>],
          ["Findings", <code key="f">GET /findings · /findings/summary · /findings/:id/resolve</code>],
          ["Policies", <code key="p">GET/POST /policies · /policies/templates · /:id/activate</code>],
          ["Gateway", <code key="g">/gateway/rules · /gateway/events · /gateway/stats · /gateway/data-flows</code>],
          ["Rights", <code key="r">GET/POST /rights-requests · /:id/assign · /:id/complete</code>],
          ["Reports", <code key="rp">GET/POST /reports · /reports/templates</code>],
          ["Consent", <code key="c">/consent/record · /consent/summary · /consent/withdraw/:id</code>],
          ["Alerts", <code key="al">/alerts · /alerts/unread · /alerts/acknowledge</code>],
        ]}
      />

      <Callout variant="note" title="Errors are safe by design">
        Error responses never leak internal details. They return a stable{" "}
        <code>code</code> (such as <code>unauthorized</code>,{" "}
        <code>not_found</code>, <code>invalid_input</code>) and a human-readable
        message, while full diagnostics are logged server-side against the{" "}
        <code>request_id</code>.
      </Callout>
    </>
  );
}
