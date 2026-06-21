import {
  H2,
  H3,
  Lead,
  Steps,
  Step,
  Callout,
  CodeBlock,
  Table,
  DocLink,
} from "@/components/docs/primitives";

export default function Reports() {
  return (
    <>
      <Lead>
        Reports turn your live posture into shareable, audit-ready documents. Each
        is assembled on demand from your current assets, findings, rights and
        consent data, then stored for download.
      </Lead>

      <H2 id="report-types">Report types</H2>
      <Table
        head={["Report", "Use it for"]}
        rows={[
          ["DPDP compliance summary", "Section-by-section status of your DPDP obligations."],
          ["DPIA", "A data-protection impact assessment with assets, findings and consent."],
          ["Asset inventory", "A full register of connected data assets and their risk."],
          ["Executive summary", "Leadership-level metrics and risk posture."],
          ["Incident report", "Findings plus recent scan history for an event."],
          ["Audit-evidence pack", "Scans, findings, rights and consent bundled for auditors."],
        ]}
      />

      <H2 id="generate">Generate a report</H2>
      <p>When you generate a report, DataSentinel:</p>
      <ul>
        <li>Creates a report record in the <code>generating</code> state and queues the job to a worker.</li>
        <li>Assembles the content from your current data for the chosen type and parameters.</li>
        <li>
          Uploads the result to object storage and returns a time-limited,
          download link; the status becomes <code>ready</code>.
        </li>
      </ul>

      <Steps>
        <Step title="Open the generate dialog">
          <p>
            Go to <strong>Reports</strong> and click <strong>Generate report</strong>.
          </p>
        </Step>
        <Step title="Choose type and parameters">
          <p>
            Pick a report type and set any parameters such as a date range or asset
            filter.
          </p>
        </Step>
        <Step title="Generate and wait">
          <p>
            Submit. The report appears in the list as <em>generating</em> and flips
            to <em>ready</em> when complete — usually within seconds.
          </p>
        </Step>
        <Step title="Download">
          <p>
            Click the download action on a ready report to retrieve the file via a
            secure, expiring link.
          </p>
        </Step>
      </Steps>

      <H3 id="via-api">Generate via the API</H3>
      <CodeBlock
        lang="bash"
        code={`curl -X POST https://app.datasentinel.io/api/v1/reports \\
  -H "X-API-Key: ds_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "report_type": "dpdp_compliance",
    "title": "Q2 DPDP Compliance",
    "parameters": { "days": 90 }
  }'

# Poll for completion, then read file_url from the report
curl https://app.datasentinel.io/api/v1/reports/<report-id> \\
  -H "X-API-Key: ds_live_••••••••"`}
      />

      <Callout variant="warn" title="Self-hosted: configure a reports bucket">
        In a self-hosted deployment, set a reports storage bucket so download links
        resolve. Without it, the platform records a placeholder it cannot serve.
        See <DocLink href="/docs/deployment">Deployment</DocLink>.
      </Callout>

      <Callout variant="tip" title="Keep evidence current">
        Generate a DPDP or audit-evidence report on a regular cadence so you always
        have fresh evidence on file for auditors and regulators.
      </Callout>
    </>
  );
}
