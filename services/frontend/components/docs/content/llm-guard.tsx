import {
  H2,
  Lead,
  Steps,
  Step,
  Callout,
  CodeBlock,
  Cards,
  Card,
  DocLink,
} from "@/components/docs/primitives";
import { ShieldCheck, ScanEye } from "lucide-react";

export default function LlmGuard() {
  return (
    <>
      <Lead>
        When traffic targets a known LLM provider, the gateway switches into{" "}
        <strong>LLM mode</strong>. It understands chat and completion formats,
        scans every prompt for personal data and sanitises it before forwarding —
        so you can adopt AI without sending customer PII to third-party models.
      </Lead>

      <H2 id="what-it-does">What it does</H2>
      <Cards>
        <Card title="Protects prompts" icon={ShieldCheck}>
          Redacts or masks PII in each message before the request reaches the
          provider, and can block prompts that carry sensitive financial data.
        </Card>
        <Card title="Inspects responses" icon={ScanEye}>
          Scans model output for unexpected personal data and logs sanitised,
          hashed versions of both sides for audit.
        </Card>
      </Cards>

      <H2 id="providers">Recognised providers</H2>
      <ul>
        <li>OpenAI — <code>api.openai.com</code></li>
        <li>Anthropic — <code>api.anthropic.com</code></li>
        <li>Google — <code>generativelanguage.googleapis.com</code></li>
        <li>Azure OpenAI and AWS Bedrock</li>
      </ul>

      <H2 id="setup">Route an LLM call through the guard</H2>
      <Steps>
        <Step title="Point your AI client at the gateway">
          <p>
            Change the base URL of your AI SDK/client to the gateway, and set the
            real provider endpoint in <code>X-Upstream-URL</code>.
          </p>
        </Step>
        <Step title="Apply the AI / LLM Guard pack">
          <p>
            From <DocLink href="/docs/policies">Policies → Templates</DocLink>, apply the AI /
            LLM Guard pack to redact PII from prompts, alert on PII in responses and
            block sensitive financial data.
          </p>
        </Step>
        <Step title="Make the gateway the only path">
          <p>
            Restrict egress so external model APIs are reachable only via the
            gateway — then PII can never bypass the guard.
          </p>
        </Step>
      </Steps>

      <H2 id="example">Example — guard an OpenAI call</H2>
      <CodeBlock
        lang="bash"
        code={`curl https://gateway.acme.com/v1/chat/completions \\
  -H "X-API-Key: <service-key>" \\
  -H "X-Tenant-ID: 7f3c..." \\
  -H "X-Upstream-URL: https://api.openai.com/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Summarise: Aadhaar 1234 5678 9012 ..." }
    ]
  }'

# The Aadhaar number is masked before the prompt reaches OpenAI`}
      />

      <Callout variant="tip" title="One policy, full coverage">
        The AI / LLM Guard pack covers prompts and responses out of the box — no
        custom rules required. Start in alert-only mode to see what would be
        redacted, then enforce.
      </Callout>
    </>
  );
}
