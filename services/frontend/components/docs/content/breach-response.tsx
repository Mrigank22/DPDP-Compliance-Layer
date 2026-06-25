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
  DocLink,
} from "@/components/docs/primitives";
import { Siren, Landmark, Megaphone, FileCheck2, ShieldCheck } from "lucide-react";

export default function BreachResponse() {
  return (
    <>
      <Lead>
        When a personal data breach occurs, the DPDP Act 2023 (§8(6)) requires the
        Data Fiduciary to intimate both the Data Protection Board and every affected
        Data Principal. DataSentinel turns that obligation into a tracked workflow:
        record the incident, assess its scope, log the statutory intimations against
        their deadlines, and export an evidence pack.
      </Lead>

      <Cards>
        <Card title="Record &amp; track" icon={Siren}>
          A first-class register of breach incidents with severity, scope and an
          immutable action timeline.
        </Card>
        <Card title="Deadline tracking" icon={Landmark}>
          The 72-hour Board intimation clock starts the moment you record the
          breach, and overdue incidents are flagged.
        </Card>
      </Cards>

      <Callout variant="warn" title="Who can do what">
        Anyone with the <strong>Analyst</strong> role (or above) can record and
        assess incidents and add timeline notes. Recording the Board / principal
        intimations and closing or deleting an incident require <strong>Admin</strong>.
      </Callout>

      <H2 id="workflow">The workflow</H2>
      <Steps>
        <Step title="Record the breach">
          From <strong>Breaches → Record breach</strong>, capture the title, severity,
          nature of the breach (confidentiality, integrity, availability), the
          categories of personal data involved, an estimate of affected principals,
          and when it was discovered. The discovery time starts the 72-hour Board
          deadline.
        </Step>
        <Step title="Assess the scope">
          As the investigation progresses, use <strong>Edit</strong> to record the
          root cause, the likely consequences for data principals, the containment
          (mitigation) actions taken and the remedial measures to prevent recurrence.
          Move the status from <em>open</em> → <em>assessing</em> → <em>contained</em>.
        </Step>
        <Step title="Intimate the Data Protection Board">
          Once the Board has been notified, an Admin records it (with the
          acknowledgement reference) via <strong>Mark intimated</strong>. The deadline
          banner clears.
        </Step>
        <Step title="Intimate affected principals">
          Record the intimation to affected Data Principals, including how many were
          reached. When both intimations are done the incident advances to
          <em> notified</em>.
        </Step>
        <Step title="Close &amp; keep evidence">
          When the incident is resolved, an Admin closes it with a resolution note.
          The full timeline remains as the evidence trail, exportable at any time.
        </Step>
      </Steps>

      <H2 id="deadlines">Statutory intimations &amp; deadlines</H2>
      <Cards>
        <Card title="Data Protection Board" icon={Landmark}>
          A detailed intimation is due <strong>within 72 hours</strong> of the Data
          Fiduciary becoming aware (computed from the discovery time). Overdue
          incidents are highlighted in red across the list and detail views.
        </Card>
        <Card title="Affected principals" icon={Megaphone}>
          Each affected Data Principal must be intimated <strong>without delay</strong>
          — the incident shows an outstanding reminder until this is recorded.
        </Card>
      </Cards>

      <H3 id="statuses">Incident statuses</H3>
      <Table
        head={["Status", "Meaning"]}
        rows={[
          ["open", "Recorded and under initial triage."],
          ["assessing", "Scope and impact are being investigated."],
          ["contained", "The breach has been stopped / mitigated."],
          ["notified", "Both the Board and affected principals have been intimated."],
          ["closed", "Resolved and documented."],
        ]}
      />

      <H2 id="evidence">Evidence pack</H2>
      <p>
        Every action — recording, scope updates, status changes, both intimations
        and closure — is appended to the incident&rsquo;s timeline and to the
        tamper-evident <DocLink href="/docs/security">audit log</DocLink>. The{" "}
        <strong>Evidence</strong> button on an incident downloads a self-contained
        JSON pack (the incident plus its full timeline) you can hand to a regulator
        or attach to an audit.
      </p>

      <Callout variant="tip" title="Tip">
        Use <DocLink href="/docs/policies">policies</DocLink> of type
        <em> breach response</em> to pre-define your runbook, and{" "}
        <DocLink href="/docs/alerts-webhooks">alerts &amp; webhooks</DocLink> to make
        sure the right people are paged the moment a breach is recorded.
      </Callout>

      <Cards>
        <Card title="Security &amp; audit" icon={ShieldCheck} href="/docs/security">
          How the tamper-evident audit log underpins the evidence trail.
        </Card>
        <Card title="Data-principal rights" icon={FileCheck2} href="/docs/rights">
          Handle the DSRs that often follow a breach.
        </Card>
      </Cards>
    </>
  );
}
