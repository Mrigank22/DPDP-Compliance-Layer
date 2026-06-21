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

export default function ApiKeys() {
  return (
    <>
      <Lead>
        API keys let your scripts, services and CI pipelines talk to DataSentinel
        without a user login. Each key belongs to your tenant, carries explicit
        scopes, and is shown in full only once.
      </Lead>

      <H2 id="how-keys-work">How keys work</H2>
      <ul>
        <li>
          A key authenticates machine-to-machine calls via the{" "}
          <code>X-API-Key</code> header.
        </li>
        <li>
          Only a <strong>SHA-256 hash</strong> of the key is stored — DataSentinel
          can never show it to you again after creation.
        </li>
        <li>
          Keys carry <strong>scopes</strong> that limit what they can do, and an
          optional expiry. You can revoke a key at any time.
        </li>
      </ul>

      <Table
        head={["Scope", "Grants"]}
        rows={[
          ["read", "Read assets, findings, reports and other resources."],
          ["write", "Create and modify resources (assets, policies, rights…)."],
          ["gateway", "Service authentication for routing traffic through the gateway."],
          ["admin", "Administrative operations."],
        ]}
      />

      <H2 id="create">Create an API key</H2>
      <Steps>
        <Step title="Open API key settings">
          <p>
            Go to <strong>Settings → API Keys</strong>.
          </p>
        </Step>
        <Step title="Create a new key">
          <p>
            Click <strong>Create key</strong>, give it a descriptive name (for
            example “CI – nightly scan”), choose the scopes it needs, and optionally
            set an expiry.
          </p>
        </Step>
        <Step title="Copy the key now">
          <p>
            The full key is displayed <strong>once</strong>. Copy it immediately and
            store it in your secret manager — you will not be able to see it again.
          </p>
        </Step>
        <Step title="Use or rotate">
          <p>
            Use the key in the <code>X-API-Key</code> header (below). To rotate,
            create a new key, switch your clients over, then revoke the old one.
          </p>
        </Step>
      </Steps>

      <Callout variant="danger" title="Treat keys like passwords">
        Never commit a key to source control or paste it into logs. Prefer
        short-lived, narrowly-scoped keys, and revoke any key you suspect is
        exposed.
      </Callout>

      <H2 id="use">How to use an API key</H2>
      <p>
        Send the key in the <code>X-API-Key</code> header on every request to the
        API base, <code>/api/v1</code>.
      </p>

      <H3 id="use-curl">cURL</H3>
      <CodeBlock
        lang="bash"
        code={`curl https://app.datasentinel.io/api/v1/findings/summary \\
  -H "X-API-Key: ds_live_••••••••"`}
      />

      <H3 id="use-node">Node.js</H3>
      <CodeBlock
        lang="javascript"
        code={`const res = await fetch(
  "https://app.datasentinel.io/api/v1/assets",
  { headers: { "X-API-Key": process.env.DATASENTINEL_API_KEY } }
);
const { data } = await res.json();`}
      />

      <H3 id="use-python">Python</H3>
      <CodeBlock
        lang="python"
        code={`import os, requests

resp = requests.get(
    "https://app.datasentinel.io/api/v1/assets",
    headers={"X-API-Key": os.environ["DATASENTINEL_API_KEY"]},
)
assets = resp.json()["data"]`}
      />

      <H3 id="use-gateway">Authenticating the gateway</H3>
      <p>
        For traffic enforcement, a <code>gateway</code>-scoped key is sent as{" "}
        <code>X-API-Key</code> alongside <code>X-Tenant-ID</code> — see the{" "}
        <DocLink href="/docs/gateway">Enforcement gateway</DocLink> guide.
      </p>

      <Callout variant="tip" title="Least privilege">
        Give each integration its own key with only the scopes it needs. That way a
        single leaked key has limited blast radius and is easy to revoke without
        disrupting other systems.
      </Callout>
    </>
  );
}
