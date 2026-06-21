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
          ["Erasure", "Locates every place the principal’s data lives so your team can delete it in the source systems and record the outcome. DataSentinel does not delete data automatically."],
          ["Portability", "Extracts the principal’s data in a machine-readable format."],
          ["Nomination", "Records a nominee for the data principal."],
        ]}
      />

      <H2 id="workflow">Handle a request step by step</H2>
      <Steps>
        <Step title="Log the request">
          <p>
            On the <strong>Rights</strong> page click <strong>New request</strong>,
            choose the type, and enter the data principal’s details. The 90-day due
            date is set automatically.
          </p>
        </Step>
        <Step title="Assign an owner">
          <p>Route the request to a team member to drive it to completion.</p>
        </Step>
        <Step title="Search across your assets">
          <p>
            Trigger a search and DataSentinel scans every connected asset for the
            individual’s data, returning the locations and record counts. This runs
            on the rights worker queue.
          </p>
        </Step>
        <Step title="Complete or reject">
          <p>
            Record the response data to <strong>complete</strong> the request, or{" "}
            <strong>reject</strong> it with a documented reason. Both are captured
            for evidence.
          </p>
        </Step>
      </Steps>

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
