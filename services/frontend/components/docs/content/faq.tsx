import { H2, H3, Lead, Callout, DocLink } from "@/components/docs/primitives";

export default function Faq() {
  return (
    <>
      <Lead>
        Answers to the questions we hear most often. If something is missing, reach
        the team from the in-product help menu with your tenant name and any{" "}
        <code>request_id</code> from an error.
      </Lead>

      <H2 id="scanning">Scanning</H2>

      <H3 id="scan-empty">A scan finds nothing or fails</H3>
      <p>
        Re-run <strong>Test connection</strong>. Confirm the credential is
        read-only but has <code>SELECT</code> or <code>GetObject</code> on the
        target schema or bucket, and that network paths and security groups allow
        the workers to reach the asset.
      </p>

      <H2 id="gateway">Gateway</H2>

      <H3 id="gw-upstream">The gateway returns 400 “X-Upstream-URL is required”</H3>
      <p>
        Every gateway request must include the <code>X-Upstream-URL</code> header
        naming the real destination. Add it to your client or egress configuration.
      </p>

      <H3 id="gw-403">The gateway returns 403 “destination not permitted”</H3>
      <p>
        The destination resolved to a cloud-metadata or link-local address, which
        is blocked for SSRF safety. Use a real external or internal hostname.
      </p>

      <H2 id="reports">Reports</H2>

      <H3 id="report-download">A report link doesn’t download</H3>
      <p>
        Report files are stored in object storage. Ensure a reports bucket is
        configured in your deployment; otherwise the platform records a placeholder
        it cannot serve. See <DocLink href="/docs/deployment">Deployment</DocLink>.
      </p>

      <H2 id="data">Data &amp; privacy</H2>

      <H3 id="raw-data">Is my raw data ever stored by DataSentinel?</H3>
      <p>
        No. Discovery keeps only metadata and safely-masked samples. The gateway
        logs hashed and sanitised versions — never raw PII.
      </p>

      <H3 id="latency">Will the gateway add noticeable latency?</H3>
      <p>
        Overhead is typically a few milliseconds. If policy cannot be loaded, the
        gateway fails open so legitimate traffic is never dropped.
      </p>

      <H3 id="india">Can we keep all data in India?</H3>
      <p>
        Yes — use India-region defaults and cross-border policies, or self-host the
        entire platform for full residency.
      </p>

      <Callout variant="tip" title="Still stuck?">
        Include the <code>request_id</code> shown with any API error when you
        contact support — it lets us find the exact server-side logs for your call
        instantly.
      </Callout>
    </>
  );
}
