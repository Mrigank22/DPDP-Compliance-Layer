import { H2, Lead, Table, Callout, DocLink } from "@/components/docs/primitives";

export default function Concepts() {
  return (
    <>
      <Lead>
        A few core concepts appear throughout DataSentinel. Understanding them
        makes every other feature easier to use.
      </Lead>

      <H2 id="glossary">The building blocks</H2>
      <Table
        head={["Term", "What it means"]}
        rows={[
          [
            <strong key="t">Tenant / workspace</strong>,
            "Your isolated organisation account. All data is scoped to a tenant and can never be seen by another.",
          ],
          [
            <strong key="a">Asset</strong>,
            "A connected data resource — an S3 bucket, a PostgreSQL database, an RDS instance — that can be scanned.",
          ],
          [
            <strong key="s">Scan</strong>,
            "A single run that samples an asset and classifies the personal data it contains.",
          ],
          [
            <strong key="f">Finding</strong>,
            "A discovered exposure — either personal data (pii_exposure) or a risky setting (misconfiguration) — with a severity and location.",
          ],
          [
            <strong key="p">Policy &amp; rule</strong>,
            "The conditions and actions that govern detected personal data, applied by the gateway and across the platform.",
          ],
          [
            <strong key="g">Gateway event</strong>,
            "A logged record of an enforcement decision (masked, blocked, tokenized…) on live traffic.",
          ],
          [
            <strong key="d">Data principal</strong>,
            "The individual whom the personal data is about.",
          ],
          [
            <strong key="r">DSR</strong>,
            "A data-principal rights request (access, correction, erasure, portability or nomination) under DPDP.",
          ],
          [
            <strong key="df">Data flow</strong>,
            "A detected destination that personal data travels to, which you can approve or flag.",
          ],
        ]}
      />

      <H2 id="severity">How severity works</H2>
      <p>
        Every finding is graded so you can triage quickly. Critical identifiers
        like Aadhaar, PAN, bank account and card numbers score{" "}
        <strong>critical</strong>; statutory IDs such as GSTIN, passport, driving
        licence and voter ID score <strong>high</strong>; contact identifiers like
        UPI, IFSC, phone and email score <strong>medium</strong>; inferred data
        such as names and locations score <strong>info</strong>. An asset’s 0–100
        risk score is derived from the severity and volume of its findings.
      </p>

      <H2 id="roles">Roles</H2>
      <p>
        Access is controlled by role: <strong>owner</strong> (full access plus
        billing), <strong>admin</strong> (full access except billing),{" "}
        <strong>analyst</strong> (read and write findings and policies) and{" "}
        <strong>viewer</strong> (read-only). See the{" "}
        <DocLink href="/docs/security">Security model</DocLink> for details.
      </p>

      <Callout variant="note" title="Privacy by design">
        DataSentinel never stores raw personal data. Findings keep only metadata —
        PII type, location, counts and safely-masked samples — so the platform
        itself never becomes a new copy of your sensitive data.
      </Callout>
    </>
  );
}
