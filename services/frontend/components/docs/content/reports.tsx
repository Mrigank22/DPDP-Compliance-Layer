import {
  H2,
  H3,
  Lead,
  Steps,
  Step,
  Callout,
  CodeBlock,
  Table,
  Pill,
  DocLink,
} from "@/components/docs/primitives";

export default function Reports() {
  return (
    <>
      <Lead>
        Reports turn your live posture into shareable, audit-ready documents. Each
        is assembled on demand from your current assets, findings, rights and
        consent data, then made available in two formats: a branded, print-ready{" "}
        <strong>HTML report</strong> for people, and a structured{" "}
        <strong>JSON export</strong> for machines.
      </Lead>

      <H2 id="formats">Two formats, one source of truth</H2>
      <p>
        Every report is generated once and offered in both formats from the
        Reports table — pick whichever fits the audience.
      </p>
      <Table
        head={["Format", "What it is", "Best for"]}
        rows={[
          [
            <span key="h"><strong>HTML</strong> <Pill tone="accent">Recommended</Pill></span>,
            "A fully styled, paper-ready compliance document — cover page, executive summary, severity-coded tables and charts, confidentiality watermark and DPO sign-off block.",
            "Regulators, boards, auditors. Open it and use your browser's Print → Save as PDF for a polished deliverable.",
          ],
          [
            <span key="j"><strong>JSON</strong></span>,
            "The same content as structured data.",
            "Feeding a GRC tool, SIEM, data warehouse, or your own automation.",
          ],
        ]}
      />
      <Callout variant="tip" title="From HTML to PDF">
        Open the HTML report and print to PDF (<code>Ctrl/Cmd + P</code> →{" "}
        <em>Save as PDF</em>). The report is laid out for A4 with repeating page
        headers, footers and a <strong>CONFIDENTIAL</strong> watermark, so the PDF
        looks like a professional, legally-marked compliance document.
      </Callout>

      <H2 id="report-types">Report types</H2>
      <p>
        Each type is purpose-built: it pulls only the data that is relevant to its
        audience and lays it out in the structure that compliance and audit
        professionals expect.
      </p>

      <H3 id="type-dpdp">DPDP Compliance Report</H3>
      <p>
        The flagship report: a section-by-section view of your obligations under
        the <strong>Digital Personal Data Protection Act, 2023</strong>.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li>Executive summary with an overall compliance rating and score.</li>
        <li>Scope &amp; methodology statement.</li>
        <li>
          DPDP obligations matrix — each control mapped to its Act reference
          (consent §6, data minimisation §8, cross-border transfer §16, LLM guard)
          with a compliant / gap status and supporting evidence.
        </li>
        <li>Personal-data inventory: assets by type and detected PII categories.</li>
        <li>Findings by severity.</li>
        <li>Data-principal rights handling (§11–§13) with overdue tracking.</li>
        <li>Consent management summary (§6).</li>
        <li>Prioritised gaps &amp; remediation roadmap.</li>
        <li>Attestation and DPO sign-off block.</li>
      </ul>
      <p>
        <strong>Use it for:</strong> demonstrating DPDP compliance to the Data
        Protection Board, leadership or customers. Generate on a quarterly cadence.
      </p>

      <H3 id="type-executive">Executive Summary</H3>
      <p>
        A concise, leadership-level overview of privacy risk — designed to fit on a
        couple of pages.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li>At-a-glance KPI cards: assets, personal-data records, average risk, open critical/high, compliance score.</li>
        <li>Risk-posture statement and findings-by-severity chart.</li>
        <li>Highest-risk assets table.</li>
        <li>Top recommendations.</li>
      </ul>
      <p>
        <strong>Use it for:</strong> board packs, steering committees and executive
        briefings where detail is less important than direction.
      </p>

      <H3 id="type-asset-inventory">Data Asset Inventory</H3>
      <p>
        A register of every connected data asset and the personal data it holds —
        effectively a lightweight{" "}
        <strong>Record of Processing Activities (RoPA)</strong>.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li>Inventory summary with totals and breakdowns by asset type and cloud provider.</li>
        <li>
          Full asset register: name, type, provider, region, status, PII record
          count, risk score and last-scanned date.
        </li>
        <li>Distribution of personal-data categories across the estate.</li>
      </ul>
      <p>
        <strong>Use it for:</strong> data-mapping exercises, RoPA maintenance, and
        answering “where is our personal data?” for auditors.
      </p>

      <H3 id="type-incident">Data Incident Report</H3>
      <p>
        A structured record of a data incident — detection, exposure and response.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li>Incident overview (affected assets, open critical/high, unresolved findings).</li>
        <li>Exposure by severity and the personal-data categories involved.</li>
        <li>Affected-assets table.</li>
        <li>Detection timeline from recent scans.</li>
        <li>
          Regulatory-notification checklist for breach intimation to the Data
          Protection Board and affected Data Principals (DPDP §8(6)).
        </li>
      </ul>
      <p>
        <strong>Use it for:</strong> documenting a suspected or confirmed breach and
        evidencing your notification obligations.
      </p>

      <H3 id="type-dpia">Data Protection Impact Assessment (DPIA)</H3>
      <p>
        A DPIA pre-populated from your detected data flows, following the structure
        required by Article 35 GDPR and good practice under the DPDP Act.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li><strong>1 · Description of processing</strong> — nature, scope, context and purpose, with data categories and locations.</li>
        <li><strong>2 · Necessity &amp; proportionality</strong> — minimisation, masking, transfer-control and consent safeguards.</li>
        <li><strong>3 · Risks to data principals</strong> — a risk register rated by likelihood and impact.</li>
        <li><strong>4 · Measures to mitigate risk</strong>.</li>
        <li><strong>5 · Residual risk &amp; sign-off</strong> — with a DPO sign-off block.</li>
      </ul>
      <p>
        <strong>Use it for:</strong> high-risk processing activities and new
        projects that require a documented impact assessment before go-live.
      </p>

      <H3 id="type-audit">Audit Evidence Pack</H3>
      <p>
        A bundle of operational evidence showing your controls are running.
      </p>
      <p><strong>Contains:</strong></p>
      <ul>
        <li>Evidence scope with the report ID as the evidence reference.</li>
        <li>Policy control inventory (counts by type, active vs total).</li>
        <li>Full scan history log.</li>
        <li>Findings register and consent evidence.</li>
        <li>Rights-handling log.</li>
        <li>Attestation block.</li>
      </ul>
      <p>
        <strong>Use it for:</strong> external audits and certification evidence
        requests where you must show controls operating over a period.
      </p>

      <H2 id="generate">Generate a report</H2>
      <p>When you generate a report, DataSentinel:</p>
      <ul>
        <li>Creates a report record in the <code>generating</code> state and queues the job to a worker.</li>
        <li>Assembles the content from your current data for the chosen type and parameters.</li>
        <li>Renders both the branded HTML document and the JSON body, stores them, and flips the status to <code>ready</code>.</li>
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
        <Step title="Open or export">
          <p>
            On a ready report, click <strong>Open report (HTML)</strong> to view and
            print the branded document, or <strong>Download JSON</strong> for the
            structured export.
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

# Poll for completion, then download either format:
#   HTML:  GET /api/v1/reports/<id>/download?format=html
#   JSON:  GET /api/v1/reports/<id>/download?format=json
curl "https://app.datasentinel.io/api/v1/reports/<report-id>/download?format=html" \\
  -H "X-API-Key: ds_live_••••••••" -o report.html`}
      />

      <Callout variant="tip" title="Keep evidence current">
        Generate a DPDP or audit-evidence report on a regular cadence so you always
        have fresh evidence on file for auditors and regulators. See{" "}
        <DocLink href="/docs/deployment">Deployment</DocLink> to optionally mirror
        report exports to an object-storage bucket.
      </Callout>
    </>
  );
}
