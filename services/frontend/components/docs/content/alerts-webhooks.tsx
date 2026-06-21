import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  Cards,
  Card,
} from "@/components/docs/primitives";
import {
  MessageSquare,
  Siren,
  Ticket,
  Mail,
  Webhook,
  SlidersHorizontal,
} from "lucide-react";

export default function AlertsWebhooks() {
  return (
    <>
      <Lead>
        DataSentinel raises alerts for policy violations, detected breaches, scan
        anomalies, rights-request deadlines, retention events and cross-border
        transfers — and fans them out to the tools your team already uses.
      </Lead>

      <H2 id="channels">Where alerts can go</H2>
      <Cards cols={3}>
        <Card title="Slack" icon={MessageSquare}>Post incidents to a channel.</Card>
        <Card title="PagerDuty" icon={Siren}>Page on-call for criticals.</Card>
        <Card title="JIRA" icon={Ticket}>Open tickets automatically.</Card>
        <Card title="Email" icon={Mail}>Notify recipient lists.</Card>
        <Card title="Generic webhook" icon={Webhook}>Signed HTTP POST to any URL.</Card>
        <Card title="Preferences" icon={SlidersHorizontal}>Tune channels &amp; thresholds.</Card>
      </Cards>

      <H2 id="add-webhook">Add a webhook</H2>
      <Steps>
        <Step title="Open integrations">
          <p>
            Go to <strong>Settings → Integrations</strong>.
          </p>
        </Step>
        <Step title="Create a webhook">
          <p>
            Choose a channel (Slack, PagerDuty, JIRA, email or generic HTTP), enter
            the destination, and select which event types it should receive.
          </p>
        </Step>
        <Step title="Save the signing secret">
          <p>
            A signing secret is shown <strong>once</strong>. Store it — you will use
            it to verify that incoming payloads genuinely came from DataSentinel.
          </p>
        </Step>
        <Step title="Send a test event">
          <p>
            Use <strong>Test</strong> to deliver a sample event and confirm your
            endpoint receives and verifies it correctly.
          </p>
        </Step>
      </Steps>

      <H2 id="acknowledge">Acknowledge alerts</H2>
      <p>
        In the <strong>Alerts</strong> page, acknowledge alerts individually or in
        bulk. Unacknowledged counts appear on the dashboard so nothing critical
        goes unseen.
      </p>

      <H2 id="preferences">Notification preferences</H2>
      <p>
        Under <strong>Settings → Integrations</strong> you can set which severities
        and event types trigger notifications, and the recipients for email
        digests — so each team gets the right signal without noise.
      </p>

      <Callout variant="warn" title="Always verify the signature">
        Webhook payloads are signed. Verify the signature with your stored secret
        before acting on an event, so a spoofed request can never trigger your
        automation.
      </Callout>
    </>
  );
}
