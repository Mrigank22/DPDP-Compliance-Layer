import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  Table,
  CodeBlock,
} from "@/components/docs/primitives";

export default function Findings() {
  return (
    <>
      <Lead>
        A finding is a single discovered exposure — either personal data
        (<code>pii_exposure</code>) or a risky setting
        (<code>misconfiguration</code>) — with a severity, location and remediation
        hint. The Findings page is where your team triages risk.
      </Lead>

      <H2 id="anatomy">What a finding contains</H2>
      <Table
        head={["Field", "Meaning"]}
        rows={[
          ["Type", "pii_exposure or misconfiguration."],
          ["Severity", "critical, high, medium, low or info."],
          ["PII types", "The identifiers detected, e.g. AADHAAR, PAN, EMAIL."],
          ["Location", "Where it was found — bucket/object or schema/table/column."],
          ["Sample count", "How many records matched in the sampled data."],
          ["Status", "Open, resolved or marked as a false positive."],
        ]}
      />

      <H2 id="triage">Triage findings</H2>
      <Steps>
        <Step title="Filter to what matters">
          <p>
            On the <strong>Findings</strong> page, filter by severity, type, PII
            type or asset. The URL keeps your filters, so you can bookmark a view
            (for example all unresolved critical findings).
          </p>
        </Step>
        <Step title="Inspect the evidence">
          <p>
            Open a finding to see its exact location, masked sample and how it was
            detected.
          </p>
        </Step>
        <Step title="Resolve or dismiss">
          <p>
            Mark genuine issues <strong>resolved</strong> with a note once
            remediated, or mark noise as a <strong>false positive</strong> to keep
            your signal clean. You can act on many findings at once with bulk
            selection.
          </p>
        </Step>
      </Steps>

      <H2 id="metrics">Summary &amp; trends</H2>
      <p>
        The Findings summary aggregates counts by severity, type and PII type, and
        a trend view shows findings over time — both also surface on the dashboard.
        Use these to show progress as your team drives exposures down.
      </p>

      <H2 id="via-api">Work with findings via the API</H2>
      <CodeBlock
        lang="bash"
        code={`# List unresolved critical findings
curl "https://app.datasentinel.io/api/v1/findings?severity=critical&resolved=false" \\
  -H "X-API-Key: ds_live_••••••••"

# Resolve a finding
curl -X POST https://app.datasentinel.io/api/v1/findings/<id>/resolve \\
  -H "X-API-Key: ds_live_••••••••" \\
  -d '{ "resolution_note": "Masked column and rotated export" }'`}
      />

      <Callout variant="tip" title="Triage order">
        Resolve critical Aadhaar, PAN and financial exposures first, then work down
        the severity ladder. Keeping false positives marked makes every future scan
        easier to read.
      </Callout>
    </>
  );
}
