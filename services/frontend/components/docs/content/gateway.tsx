import {
  H2,
  H3,
  Lead,
  Callout,
  CodeBlock,
  Table,
  DocLink,
} from "@/components/docs/primitives";

export default function Gateway() {
  return (
    <>
      <Lead>
        The enforcement gateway is a transparent HTTP proxy you place in front of
        selected APIs, or use as an egress proxy for outbound calls. It inspects
        request and response bodies and applies your policy actions{" "}
        <strong>before</strong> personal data leaves your estate — typically adding
        only a few milliseconds of latency.
      </Lead>

      <H2 id="how-it-works">How it works</H2>
      <p>For each request that passes through, the gateway:</p>
      <ul>
        <li>Identifies your tenant and loads the applicable policies from cache.</li>
        <li>Parses the body and runs PII detection on both request and response.</li>
        <li>Applies the matched action (mask, redact, block, tokenize, encrypt, hash or alert).</li>
        <li>Forwards the sanitised request upstream and logs the decision for evidence.</li>
      </ul>

      <H2 id="routing">How to route traffic</H2>
      <p>
        Point your client (or egress configuration) at the gateway and tell it the
        real destination with request headers:
      </p>
      <Table
        head={["Header", "Required", "Purpose"]}
        rows={[
          [<code key="u">X-Upstream-URL</code>, "Yes", "The real destination the gateway forwards to."],
          [<code key="t">X-Tenant-ID</code>, "Yes*", "Identifies your tenant."],
          [<code key="k">X-API-Key</code>, "Yes*", "Service authentication for the gateway."],
          [<code key="b">Authorization: Bearer</code>, "Optional", "A verified RS256 JWT; the tenant is taken from the token."],
        ]}
      />
      <p className="text-[13px] text-faint">
        *Provide either an API key plus tenant header, or a verified Bearer JWT.
      </p>

      <H3 id="example">Example — proxy an outbound API call</H3>
      <CodeBlock
        lang="bash"
        code={`curl https://gateway.acme.com/v1/customers \\
  -H "X-API-Key: <service-key>" \\
  -H "X-Tenant-ID: 7f3c..." \\
  -H "X-Upstream-URL: https://partner-api.example.com/v1/customers" \\
  -H "Content-Type: application/json" \\
  -d '{ "pan": "ABCDE1234F", "phone": "+91 98xxxxxx10" }'

# PII is masked / blocked per policy before reaching the partner API`}
      />

      <H2 id="actions">Enforcement actions</H2>
      <p>
        Each gateway rule matches a route, direction (request or response) and PII
        types, then applies one action:
      </p>
      <Table
        head={["Action", "Effect"]}
        rows={[
          ["mask", "Replace characters while keeping format, e.g. XXXX-XXXX-1234."],
          ["redact", "Remove the field from the payload entirely."],
          ["block", "Reject the request with HTTP 403 and log the violation."],
          ["tokenize", "Swap the value for a reversible, format-preserving token from the per-tenant vault."],
          ["encrypt", "AES-256-GCM encrypt the field with the tenant key."],
          ["hash", "One-way SHA-256 pseudonymisation."],
          ["alert", "Allow the traffic but raise an alert."],
        ]}
      />

      <H2 id="rules">Manage gateway rules</H2>
      <p>
        Create and toggle rules under <strong>Gateway → Rules</strong>, or apply a
        ready-made <DocLink href="/docs/policies">policy pack</DocLink>. Roll out in
        alert-only mode first, watch the live feed, then switch to enforce.
      </p>

      <H2 id="safety">Built-in safety</H2>
      <ul>
        <li>
          <strong>SSRF protection</strong> — the gateway refuses to proxy to cloud
          metadata and link-local endpoints.
        </li>
        <li>
          <strong>Fail-open</strong> — if policy cannot be loaded, legitimate
          traffic is forwarded rather than dropped.
        </li>
        <li>
          <strong>Observability</strong> — <code>/healthz</code>,{" "}
          <code>/readyz</code> and Prometheus <code>/metrics</code> are exposed for
          probes and scraping.
        </li>
      </ul>

      <Callout variant="tip" title="Monitor enforcement live">
        The <strong>Gateway live feed</strong> streams every decision (masked,
        blocked, tokenized) with PII types, action and latency. See{" "}
        <DocLink href="/docs/monitoring">Monitoring</DocLink>.
      </Callout>
    </>
  );
}
