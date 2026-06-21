import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  DocLink,
} from "@/components/docs/primitives";

export default function Quickstart() {
  return (
    <>
      <Lead>
        This guide takes you from signing in to your first real findings in five
        steps. Allow about fifteen minutes, plus read-only credentials for one
        data source.
      </Lead>

      <H2 id="before-you-begin">Before you begin</H2>
      <ul>
        <li>An invitation to a DataSentinel workspace, or your own new workspace.</li>
        <li>
          Read-only access to one asset — for example an Amazon S3 bucket or a
          PostgreSQL database.
        </li>
      </ul>

      <H2 id="steps">Five steps to value</H2>
      <Steps>
        <Step title="Sign in and create your workspace">
          <p>
            Register your organisation, which becomes your isolated{" "}
            <strong>tenant</strong>. The first account is the owner. Invite
            teammates later from <strong>Settings → Team</strong> and give each a
            role.
          </p>
        </Step>
        <Step title="Connect your first asset">
          <p>
            Go to <strong>Assets → Connect asset</strong>, pick a type, and enter
            read-only connection details. Click <strong>Test connection</strong>{" "}
            to confirm credentials before saving. See{" "}
            <DocLink href="/docs/connect-assets">Connect an asset</DocLink> for field-by-field
            help.
          </p>
        </Step>
        <Step title="Run a scan">
          <p>
            Open the asset and click <strong>Run scan</strong>. A worker samples
            records, classifies any personal data, and writes findings. The asset
            status moves from <em>scanning</em> back to <em>connected</em> when it
            completes.
          </p>
        </Step>
        <Step title="Review your findings">
          <p>
            Visit <strong>Findings</strong> to see what was discovered, ranked by
            severity. Each finding lists the PII types, location and a remediation
            hint. Filter by severity, type or asset to focus your triage.
          </p>
        </Step>
        <Step title="Apply a policy and turn on enforcement">
          <p>
            From <strong>Policies → Templates</strong>, apply the DPDP starter
            pack in alert-only mode. When you are ready to actively protect live
            traffic, deploy the{" "}
            <DocLink href="/docs/gateway">enforcement gateway</DocLink>.
          </p>
        </Step>
      </Steps>

      <H2 id="what-you-see">What you will see on the dashboard</H2>
      <p>
        Your home screen now shows a live <strong>compliance score</strong>, the
        total personal-data records and assets discovered, open and critical
        findings, unacknowledged alerts, overdue rights requests, a PII-type
        breakdown, a 30-day findings trend, your top-risk assets and a live
        data-flow map.
      </p>

      <Callout variant="tip" title="Recommended next step">
        Roll policies out in <strong>alert-only</strong> mode first and watch the
        <DocLink href="/docs/gateway"> gateway live feed</DocLink> to understand real traffic
        before you switch to active enforcement.
      </Callout>
    </>
  );
}
