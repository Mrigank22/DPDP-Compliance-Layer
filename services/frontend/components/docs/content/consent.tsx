import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  Cards,
  Card,
} from "@/components/docs/primitives";

export default function Consent() {
  return (
    <>
      <Lead>
        Record and prove the lawful basis for processing, by purpose. DataSentinel
        keeps the full history — including withdrawals — so you can demonstrate
        valid consent at any moment.
      </Lead>

      <H2 id="what-you-can-do">What you can do</H2>
      <Cards>
        <Card title="Capture consent">
          Record each event: who consented, for what purpose, when, through which
          mechanism (form, API, SDK or import) and which notice version they saw.
        </Card>
        <Card title="See the picture">
          Review aggregate consent given vs. withdrawn, a breakdown by purpose, and
          the full timeline for any single data principal.
        </Card>
      </Cards>

      <H2 id="record">Record consent</H2>
      <Steps>
        <Step title="Open Consent">
          <p>
            Go to the <strong>Consent</strong> page to see the summary and recent
            activity.
          </p>
        </Step>
        <Step title="Add a record (or import in bulk)">
          <p>
            Record a single event with the principal, purpose and mechanism — or use{" "}
            <strong>Import</strong> to bring in existing consent from a CSV.
          </p>
        </Step>
        <Step title="Look up a principal">
          <p>
            Search by data-principal identifier to see every consent and withdrawal
            on record for that person.
          </p>
        </Step>
        <Step title="Record a withdrawal">
          <p>
            When someone withdraws, record it against their consent — the timestamp
            is captured and reflected in the summary.
          </p>
        </Step>
      </Steps>

      <Callout variant="note" title="Feeds your evidence">
        Consent records flow directly into your DPDP and DPIA reports, evidencing
        that processing has a valid, documented basis and that withdrawals are
        honoured.
      </Callout>
    </>
  );
}
