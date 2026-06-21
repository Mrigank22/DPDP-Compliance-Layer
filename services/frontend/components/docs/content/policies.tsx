import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  Cards,
  Card,
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
