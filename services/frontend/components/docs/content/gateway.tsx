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
          ["mask", "Replace characters while keeping length, e.g. ABCDE****F. Controlled by the mask settings below."],
          ["redact", "Replace the value with a fixed label such as [REDACTED]."],
          ["block", "Reject the request with HTTP 403 and log the violation — it never reaches the destination."],
          ["tokenize", "Swap the value for a reversible, format-preserving token from the per-tenant vault."],
          ["alert", "Forward the traffic unchanged but raise a high-severity alert."],
          ["allow", "Explicitly forward unchanged — an allow-list exception."],
        ]}
      />
      <p className="text-[13px] text-faint">
        These six actions are selectable when you create a rule. The engine also
        supports <code>encrypt</code> (AES-256-GCM) and <code>hash</code> (SHA-256)
        transforms used by some built-in policy packs.
      </p>

      <H2 id="configure-rule">Configure a rule, field by field</H2>
      <p>
        When you click <strong>New gateway rule</strong>, every field maps directly
        to how the proxy matches and transforms traffic. Here is exactly what each
        one does.
      </p>

      <H3 id="field-name">Name</H3>
      <p>
        A human label shown in the live feed, alerts and evidence logs (for example{" "}
        <em>“Mask PII to external LLMs”</em>). It has no effect on matching.
      </p>

      <H3 id="field-route">Route pattern</H3>
      <p>
        Decides which traffic the rule applies to. It is{" "}
        <strong>not a regular expression</strong>. The pattern is tested against
        three forms of the destination, so you can scope by service or by path: the
        destination <strong>host</strong> (<code>api.openai.com</code>), the{" "}
        <strong>host + path</strong> (<code>api.openai.com/v1/chat/completions</code>),
        and the request <strong>path</strong> alone (<code>/v1/chat/completions</code>).
        The destination itself is set by the <code>X-Upstream-URL</code> header.
        Supported syntax:
      </p>
      <Table
        head={["Pattern", "Matches"]}
        rows={[
          [<code key="a">*</code>, "Everything — every destination and path."],
          [<code key="e">api.openai.com/*</code>, "All calls to that host (host + any path)."],
          [<code key="f">api.openai.com</code>, "That host exactly."],
          [<code key="c">/v1/*</code>, "Any request path beginning with /v1/ (prefix match), regardless of host."],
          [<code key="b">/v1/chat/completions</code>, "Exactly that path."],
          [<code key="d">/users/:id/profile</code>, ":id matches any single segment (e.g. /users/42/profile); segment counts must be equal."],
        ]}
      />
      <Callout variant="tip" title="Scope by destination or by path">
        Use a host pattern like <code>api.openai.com/*</code> to cover all traffic to
        a service, or a path pattern like <code>/v1/*</code> to match by API path
        across destinations. Use <code>*</code> to apply a rule to everything.
      </Callout>

      <H3 id="field-direction">Direction</H3>
      <p>The phase of the exchange the rule inspects and transforms.</p>
      <Table
        head={["Direction", "Inspects", "Typical use"]}
        rows={[
          ["request", "The body you send upstream (e.g. an LLM prompt).", "Stop personal data leaving in prompts or API calls."],
          ["response", "The body returned to you.", "Redact personal data the upstream sends back."],
          ["both", "Request and response.", "Full coverage — the default."],
        ]}
      />

      <H3 id="field-methods">HTTP methods</H3>
      <p>
        Comma-separated list of methods the rule applies to. Use{" "}
        <code>*</code> for all methods, or restrict to specific ones such as{" "}
        <code>POST, PUT</code>. Methods are matched exactly (uppercase).
      </p>

      <H3 id="field-pii">PII types to target</H3>
      <p>
        Select which categories of personal data the rule acts on. <strong>Leave
        the selection empty to target every supported type</strong>; pick a subset
        to act only on those and ignore the rest. Supported types include Aadhaar,
        PAN, Phone, Email, Name, Address, Bank A/C, UPI, Passport, Voter ID, GSTIN,
        Driving License, Credit Card, IFSC and CIN.
      </p>

      <H3 id="field-mask">Mask settings</H3>
      <p>
        When the action is <code>mask</code>, these parameters (stored as the
        rule&apos;s mask config) control the output:
      </p>
      <Table
        head={["Setting", "Default", "Meaning"]}
        rows={[
          [<code key="s">strategy</code>, "partial", "partial (keep some characters), full (mask everything), redact (replace with a label) or tokenize."],
          [<code key="mc">mask_char</code>, "*", "The character used to mask."],
          [<code key="pf">preserve_first</code>, "0", "Number of characters kept at the start."],
          [<code key="pl">preserve_last</code>, "4", "Number of characters kept at the end (e.g. show the last 4 of a card)."],
          [<code key="rl">redact_label</code>, "[REDACTED]", "The label used when the strategy is redact."],
        ]}
      />
      <p className="text-[13px] text-faint">
        With <code>partial</code>, if <code>preserve_first + preserve_last</code> is
        as long as the value, the whole value is masked.
      </p>

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
