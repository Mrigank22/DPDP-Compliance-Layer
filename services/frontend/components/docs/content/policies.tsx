import {
  H2,
  H3,
  Lead,
  Steps,
  Step,
  Callout,
  Cards,
  Card,
  CodeBlock,
  Table,
  DocLink,
} from "@/components/docs/primitives";

export default function Policies() {
  return (
    <>
      <Lead>
        A policy is a set of rules that decide what happens when personal data is
        detected. Build them visually, version every change, and apply ready-made
        compliance packs in one click.
      </Lead>

      <H2 id="anatomy">How a policy works</H2>
      <p>
        Each rule combines <strong>conditions</strong> (PII type, direction,
        destination) with an <strong>action</strong> (mask, block, tokenize, …) and
        an <strong>enforcement mode</strong>:
      </p>
      <ul>
        <li>
          <strong>Alert-only</strong> — observe and report without changing traffic
          (ideal for rollout).
        </li>
        <li><strong>Enforce</strong> — actively apply the action.</li>
        <li><strong>Audit-only</strong> — record for evidence.</li>
      </ul>

      <H2 id="fields">The New policy form, field by field</H2>
      <p>
        Every field in the <strong>New policy</strong> dialog controls real
        behaviour. Here is what each one means.
      </p>

      <H3 id="field-name">Name &amp; description</H3>
      <p>
        Free text. The name identifies the policy in lists, alerts and reports; the
        description is an optional note on what it enforces. Neither affects matching.
      </p>

      <H3 id="field-type">Type</H3>
      <p>
        The governance category the policy belongs to. It signals intent and groups
        policies in the UI and reports.
      </p>
      <Table
        head={["Type", "Purpose", "Enforced where"]}
        rows={[
          ["Data Masking", "Mask, redact or tokenize personal data flowing through the gateway.", "Gateway (when Enforce)"],
          ["Transfer Control", "Restrict personal data going to unapproved or cross-border destinations.", "Gateway (when Enforce)"],
          ["LLM Guard", "Strip personal data from prompts and responses to AI models.", "Gateway (when Enforce)"],
          ["Access Control", "Govern access to PII-bearing routes.", "Gateway (when Enforce)"],
          ["Retention", "Define how long categories of data may be kept.", "Scans & governance"],
          ["Consent", "Require valid consent before processing.", "Workflows & governance"],
          ["Breach Response", "Codify breach handling and notification steps.", "Workflows & evidence"],
        ]}
      />

      <H3 id="field-enforcement">Enforcement</H3>
      <p>This is the single biggest control — it decides whether traffic is changed.</p>
      <Table
        head={["Mode", "What happens", "Linked gateway rule"]}
        rows={[
          ["alert", "Personal data is detected and an alert is raised, but traffic is not modified. Ideal for rollout.", "Active — action becomes alert"],
          ["enforce", "The DSL action (mask / redact / block / tokenize) is actively applied to matching traffic.", "Active — action is your action"],
          ["audit_only", "The policy is recorded for evidence and scan evaluation only; it does not touch live gateway traffic.", "Inactive"],
        ]}
      />

      <H3 id="field-priority">Priority (lower = higher)</H3>
      <p>
        An integer (default <code>100</code>, minimum <code>1</code>). A{" "}
        <strong>lower number means higher priority</strong>. It orders policies in
        the list and the order in which they are evaluated. Note that at the gateway
        all active matching rules are applied in turn and a <code>block</code> always
        takes precedence by short-circuiting — so priority expresses intended
        precedence and ordering rather than a hard gateway tie-breaker.
      </p>

      <H2 id="dsl">Rule DSL reference</H2>
      <p>
        The <strong>Rule DSL (JSON)</strong> is the heart of the policy: it defines
        the condition tree and the action to take. A typical rule looks like this:
      </p>
      <CodeBlock
        lang="json"
        code={`{
  "name": "Mask Aadhaar in API responses",
  "enabled": true,
  "conditions": {
    "operator": "AND",
    "predicates": [
      { "field": "pii_type",  "operator": "in",     "value": ["AADHAAR", "PAN"] },
      { "field": "direction", "operator": "equals", "value": "response" }
    ]
  },
  "action": { "type": "mask", "config": { "preserve_last": 4 } }
}`}
      />

      <H3 id="dsl-conditions">conditions</H3>
      <p>
        <code>operator</code> is <code>AND</code> or <code>OR</code> and decides how
        the <code>predicates</code> combine. Each predicate is{" "}
        <code>{`{ field, operator, value }`}</code>. The fields the gateway acts on:
      </p>
      <Table
        head={["field", "Example value", "Effect"]}
        rows={[
          [<code key="p">pii_type</code>, '["AADHAAR", "PAN"]', "Which personal-data categories the rule targets. Omit or leave empty to target all detected types."],
          [<code key="d">direction</code>, '"request" | "response" | "both"', "Which phase of the exchange to inspect. Defaults to both."],
        ]}
      />
      <p className="text-[13px] text-faint">
        Additional fields — <code>asset_type</code>, <code>destination</code>,{" "}
        <code>data_volume</code> — are available for scan-time and governance
        evaluation. Supported operators: <code>in</code>, <code>not_in</code>,{" "}
        <code>equals</code>, <code>contains</code>, <code>greater_than</code>.
      </p>

      <H3 id="dsl-action">action</H3>
      <p>
        <code>type</code> is one of <code>mask</code>, <code>redact</code>,{" "}
        <code>block</code>, <code>tokenize</code> or <code>alert</code>.{" "}
        <code>config</code> takes the same masking parameters as a gateway rule:
      </p>
      <Table
        head={["config key", "Default", "Meaning"]}
        rows={[
          [<code key="st">strategy</code>, "partial", "partial, full, redact or tokenize."],
          [<code key="mc">mask_char</code>, "*", "Character used to mask."],
          [<code key="pf">preserve_first</code>, "0", "Characters kept at the start."],
          [<code key="pl">preserve_last</code>, "4", "Characters kept at the end."],
          [<code key="rl">redact_label</code>, "[REDACTED]", "Label used when redacting."],
        ]}
      />

      <Callout variant="tip" title="How a policy reaches the gateway">
        A policy that is <strong>Active</strong> and set to <strong>Enforce</strong>{" "}
        automatically creates and keeps a linked gateway rule in sync. That generated
        rule matches <strong>all routes</strong> (<code>*</code>) and{" "}
        <strong>all methods</strong>, using the action, PII types and direction from
        your DSL. If you need to scope by route or HTTP method, create a rule directly
        under <DocLink href="/docs/gateway">Gateway → Rules</DocLink>.
      </Callout>

      <H2 id="create">Create or apply a policy</H2>
      <Steps>
        <Step title="Start from a template or scratch">
          <p>
            Go to <strong>Policies</strong>. Apply a built-in pack from{" "}
            <strong>Templates</strong>, or click <strong>New policy</strong> to
            build your own.
          </p>
        </Step>
        <Step title="Choose what it applies to">
          <p>Select the assets, asset types or tags the policy should cover.</p>
        </Step>
        <Step title="Define conditions and an action">
          <p>
            Pick the PII types and direction to match, then the action and its
            parameters (for example, mask keeping the last four characters). A live
            preview shows the underlying rule as you build.
          </p>
        </Step>
        <Step title="Set the mode and activate">
          <p>
            Choose alert-only or enforce, set a priority, and activate. Every change
            creates a new version you can roll back to.
          </p>
        </Step>
      </Steps>

      <H2 id="packs">Built-in compliance packs</H2>
      <Cards>
        <Card title="DPDP compliance">
          Mask Indian PII to unapproved destinations, block out-of-country
          transfers, alert on PII in LLM prompts, redact PII from logs, enforce
          rights deadlines and retention, and guard children’s data.
        </Card>
        <Card title="RBI data localization">
          Keep payment data on Indian infrastructure, mask card numbers (keep last
          4) and tokenize account numbers in API traffic.
        </Card>
        <Card title="IRDAI">
          Alert on policyholder data in cross-border transfers and mask health-data
          fields on non-clinical paths.
        </Card>
        <Card title="AI / LLM guard">
          Redact PII from prompts to external models, alert on PII in responses and
          block sensitive financial data.
        </Card>
        <Card title="General security">
          Alert on bulk exports, block unauthorised IP ranges, flag PII access
          out-of-hours, detect secrets in traffic and rate-limit PII endpoints.
        </Card>
      </Cards>

      <H2 id="versioning">Versioning &amp; rollback</H2>
      <Table
        head={["Capability", "What it gives you"]}
        rows={[
          ["Version history", "Every edit is captured with who changed it and when."],
          ["One-click rollback", "Restore any previous version instantly."],
          ["Activate / deactivate", "Switch a policy between enforce and alert-only without deleting it."],
        ]}
      />

      <Callout variant="tip" title="Safe rollout">
        Apply packs in alert-only mode, review the{" "}
        <DocLink href="/docs/gateway">gateway live feed</DocLink> for a few days, then switch to
        enforce once you are confident.
      </Callout>
    </>
  );
}
