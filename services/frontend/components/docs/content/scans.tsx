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

export default function Scans() {
  return (
    <>
      <Lead>
        A scan inspects a connected asset and classifies the personal data it
        contains. Scans run on background <strong>workers</strong> organised into
        queues, so large jobs never block the console.
      </Lead>

      <H2 id="how-scanning-works">How scanning works</H2>
      <p>When a scan runs, a worker:</p>
      <ul>
        <li>Decrypts the asset’s connection config in-memory and connects read-only.</li>
        <li>
          Enumerates sources (object keys for S3; tables and columns for
          databases).
        </li>
        <li>
          For warehouses and SQL databases, profiles{" "}
          <strong>structured identifiers</strong> — Aadhaar, PAN, GSTIN, IFSC,
          Voter&nbsp;ID, email, phone and card numbers — directly inside the
          database with a single read-only query, so they are counted across{" "}
          <strong>every row</strong> without copying data out.
        </li>
        <li>
          Streams a <strong>sample</strong> of records through the PII engine,
          which is tuned for Indian identifiers and validates checksums (for
          example the Verhoeff check on Aadhaar). This pass catches free-text PII
          such as <strong>names</strong> and <strong>addresses</strong> that only
          natural-language analysis can find.
        </li>
        <li>
          Writes one <strong>finding</strong> per source and PII type, updates the
          asset’s <strong>risk score</strong> and <code>last_scanned_at</code>, and
          records a row in the scan history.
        </li>
      </ul>

      <Callout variant="note" title="Only metadata is stored">
        Scans never persist raw values. A finding records the PII type, location,
        a count and a safely-masked sample — never the underlying personal data.
      </Callout>

      <H2 id="coverage-and-sampling">Coverage &amp; sampling</H2>
      <p>
        To stay fast on very large tables, a scan combines two passes with
        different coverage. Knowing which is which tells you how to read the
        count on a finding.
      </p>
      <Table
        head={["Pass", "Detects", "Coverage"]}
        rows={[
          [
            "In-database profiling",
            "Structured identifiers — Aadhaar, PAN, GSTIN, IFSC, Voter ID, email, phone, card numbers.",
            "Every row — exact counts.",
          ],
          [
            "Sampled analysis",
            "Free-text PII — names, addresses and other entities that need language analysis.",
            "A capped sample of rows — counts are representative estimates.",
          ],
        ]}
      />
      <p>
        The sample is capped at <strong>1,000 rows per source</strong> by default
        for incremental scans, so re-scanning a billion-row table never re-reads
        it in full. A <strong>full</strong> scan removes the cap and runs the
        language model over every row as well — use it for a definitive audit, and
        rely on incremental scans for routine monitoring.
      </p>
      <Callout variant="note" title="Other source types">
        Object stores (Amazon S3, Google Cloud Storage, Azure Blob) are sampled by{" "}
        <em>object</em> up to a configurable per-scan limit, since each file is
        inspected as a whole. Sources without a queryable engine — MongoDB,
        Salesforce and object stores — detect all PII types from the sample rather
        than the in-database pass.
      </Callout>
      <p>
        Building an integration? Each finding’s <code>evidence</code> object
        records how it was detected — <code>detected_by</code>{" "}
        (<code>sql_regex</code> for the full in-database pass, <code>presidio</code>
        for the sampled pass) and <code>coverage</code> (<code>full</code> or{" "}
        <code>sampled</code>) — so you can tell exact counts from estimates
        programmatically.
      </p>

      <H2 id="run-a-scan">Run a scan</H2>
      <Steps>
        <Step title="Open the asset">
          <p>
            Go to <strong>Assets</strong> and open the asset you want to scan.
          </p>
        </Step>
        <Step title="Start the scan">
          <p>
            Click <strong>Run scan</strong> and choose a scan type:{" "}
            <strong>full</strong> (exhaustive — reads every row, no sampling cap)
            or <strong>incremental</strong> (lighter — caps the free-text sample,
            for routine re-checks). The asset status changes to <em>scanning</em>.
          </p>
        </Step>
        <Step title="Watch progress">
          <p>
            The scan is queued to a worker. Progress and a summary appear under the
            asset’s <strong>Scans</strong> tab. When it finishes, status returns to{" "}
            <em>connected</em> and findings appear.
          </p>
        </Step>
        <Step title="Review the results">
          <p>
            Open the <strong>Findings</strong> tab on the asset, or the global{" "}
            <DocLink href="/docs/findings">Findings</DocLink> page, to triage what was found.
          </p>
        </Step>
      </Steps>

      <H3 id="via-api">Trigger a scan via the API</H3>
      <CodeBlock
        lang="bash"
        code={`curl -X POST https://app.datasentinel.io/api/v1/assets/<asset-id>/scan \\
  -H "X-API-Key: ds_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{ "scan_type": "full" }'`}
      />

      <H2 id="scheduled-scans">Scheduled scans</H2>
      <p>
        DataSentinel runs scans automatically so your inventory never goes stale.
        Any connected asset that has not been scanned in the last 24 hours is
        picked up by the scheduler and re-scanned incrementally. You do not need to
        configure anything — connecting an asset is enough.
      </p>

      <H2 id="posture-scans">Posture scans</H2>
      <p>
        Alongside data discovery, workers periodically check each asset’s security
        posture and raise <code>misconfiguration</code> findings for risky
        settings:
      </p>
      <Table
        head={["Asset", "Checks"]}
        rows={[
          [
            "Amazon S3",
            "Public access block, public bucket policy, default encryption, versioning and access logging.",
          ],
          [
            "PostgreSQL / RDS",
            "Whether TLS is required for connections and whether the server has SSL enabled.",
          ],
        ]}
      />

      <H2 id="worker-queues">Worker queues</H2>
      <p>
        In a self-hosted deployment, workers are split into dedicated queues so
        each kind of job scales independently. The scheduler (“beat”) dispatches
        the recurring jobs above.
      </p>
      <Table
        head={["Queue", "Handles"]}
        rows={[
          ["discovery", "Data + posture scans"],
          ["classification", "PII analysis of sampled records"],
          ["rights", "Cross-asset data-principal searches"],
          ["reports", "Report generation"],
          ["notifications", "Alert escalations and digests"],
        ]}
      />
      <p>
        See <DocLink href="/docs/deployment">Deployment</DocLink> for how to size and run these
        queues with Docker Compose or Helm.
      </p>

      <Callout variant="tip" title="Tip">
        Run a <strong>full</strong> scan when you first connect an asset to map it
        completely, then rely on the automatic incremental schedule for ongoing
        monitoring.
      </Callout>
    </>
  );
}
