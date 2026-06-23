import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  Table,
} from "@/components/docs/primitives";

export default function Rights() {
  return (
    <>
      <Lead>
        When an individual exercises their rights, log the request in{" "}
        <strong>Rights</strong>. DataSentinel tracks it through its lifecycle and
        automatically computes the statutory 90-day deadline under the DPDP Act.
      </Lead>

      <H2 id="request-types">Request types</H2>
      <Table
        head={["Type", "What DataSentinel does"]}
        rows={[
          ["Access", "Searches every connected asset for the principal’s records and compiles a structured export."],
          ["Correction", "Locates the records and flags the exact asset, table and location for your team to correct."],
          ["Erasure", "Discovers everywhere the principal’s data lives, then — after a human approves — automatically deletes it from erasable databases and records the outcome. Object stores and other non-erasable assets are flagged for manual handling."],
          ["Portability", "Extracts the principal’s data in a machine-readable format."],
          ["Nomination", "Records a nominee for the data principal."],
        ]}
      />

      <H2 id="workflow">Handle a request step by step</H2>
      <p>
        Identity verification is a deliberate human gate (you must confirm the
        requester is who they claim). Everything after it — discovery, and for
        erasure the deletion itself — is automated, with a second human gate before
        anything is destroyed.
      </p>
      <Steps>
        <Step title="Log the request">
          <p>
            On the <strong>Rights</strong> page click <strong>New request</strong>,
            choose the type, and enter the data principal’s details. The 90-day due
            date is set automatically.
          </p>
        </Step>
        <Step title="Verify identity">
          <p>
            Confirm the requester’s identity, then click <strong>Verify identity</strong>.
            This records who verified it and immediately starts automated discovery.
          </p>
        </Step>
        <Step title="Automated discovery">
          <p>
            DataSentinel searches every connected asset for the individual’s data
            and returns the locations and record counts. For an erasure request it
            also builds an erasure plan and moves the request to{" "}
            <strong>pending approval</strong>.
          </p>
        </Step>
        <Step title="Approve erasure (erasure only)">
          <p>
            Review the discovered locations and click{" "}
            <strong>Approve &amp; erase</strong>. Only then does DataSentinel delete
            the matched records from erasable databases — capped, transactional and
            fully audited. Non-erasable assets are listed for manual handling.
          </p>
        </Step>
        <Step title="Complete or reject">
          <p>
            Record the response to <strong>complete</strong> the request, or{" "}
            <strong>reject</strong> it with a documented reason. Both are captured
            for evidence.
          </p>
        </Step>
      </Steps>

      <Callout variant="warn" title="Erasure is gated and auditable">
        Destructive deletion never runs automatically: it requires a verified
        request, a completed discovery, and an explicit approval. Each deletion is
        capped, committed in a transaction, and recorded per source in the
        fulfillment result.
      </Callout>

      <H2 id="deadlines">Never miss a deadline</H2>
      <p>
        DataSentinel raises <strong>high-severity</strong> alerts as a deadline
        approaches and <strong>critical</strong> alerts when a request becomes
        overdue. The dashboard surfaces overdue counts and an upcoming-deadline
        calendar so nothing slips.
      </p>

      <Callout variant="note" title="Erasure is assisted, not automated">
        DataSentinel <strong>locates</strong> every copy of the principal’s data and
        tracks the request and its deadline — but it never deletes data itself. A
        team member carries out the deletion in the source systems and records the
        outcome, so a request can never trigger irreversible mass deletion by
        accident.
      </Callout>
    </>
  );
}
