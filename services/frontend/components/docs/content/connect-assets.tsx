import {
  H2,
  H3,
  Lead,
  Steps,
  Step,
  Callout,
  CodeBlock,
  Field,
  FieldList,
  Table,
  Pill,
  DocLink,
} from "@/components/docs/primitives";

export default function ConnectAssets() {
  return (
    <>
      <Lead>
        An <strong>asset</strong> is any cloud or database resource you want
        DataSentinel to scan for personal data. Connecting one tells the platform
        where to look and how to authenticate — using read-only credentials that
        are encrypted at rest.
      </Lead>

      <H2 id="what-happens">What happens when you connect an asset</H2>
      <p>When you save an asset, DataSentinel:</p>
      <ul>
        <li>
          Encrypts the connection configuration with{" "}
          <strong>AES-256-GCM using a key unique to your tenant</strong>; the
          plaintext is only ever decrypted in-memory by a worker during a scan.
        </li>
        <li>
          Registers the asset as <code>connected</code> so it becomes eligible for
          manual and scheduled scans.
        </li>
        <li>
          Begins tracking a <strong>risk score</strong> and a record of every scan,
          finding and data flow associated with it.
        </li>
      </ul>

      <Callout variant="warn" title="Always use least privilege">
        Create a dedicated <strong>read-only</strong> principal for each asset,
        scoped to only the data you want scanned. DataSentinel never needs write
        access.
      </Callout>

      <H2 id="supported-types">Supported asset types</H2>
      <Table
        head={["Type", "What it scans", "Status"]}
        rows={[
          [
            <span key="s3"><strong>Amazon S3</strong> <code>s3_bucket</code></span>,
            "Objects (JSON, CSV, NDJSON, text/log) sampled for PII, plus bucket security posture.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
          [
            <span key="gcs"><strong>Google Cloud Storage</strong> <code>gcs_bucket</code></span>,
            "Objects sampled for PII, plus public-access, uniform-access and versioning posture.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
          [
            <span key="ablob"><strong>Azure Blob Storage</strong> <code>azure_blob</code></span>,
            "Blobs sampled for PII, plus anonymous public-access posture.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
          [
            <span key="pg"><strong>PostgreSQL</strong> <code>postgresql</code></span>,
            "Tables and columns sampled for PII, using column-name heuristics first. Works on AWS RDS/Aurora, GCP Cloud SQL and Azure Database for PostgreSQL.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
          [
            <span key="mysql"><strong>MySQL / MariaDB</strong> <code>mysql</code></span>,
            "Tables and columns sampled for PII. Works on AWS RDS/Aurora, GCP Cloud SQL and Azure Database for MySQL.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
          [
            <span key="rds"><strong>Amazon RDS</strong> <code>rds_instance</code></span>,
            "PostgreSQL-compatible RDS instances; data and transport-security posture.",
            <Pill key="p" tone="accent">Available</Pill>,
          ],
        ]}
      />

      <Callout variant="tip" title="One database connector, every cloud">
        The <code>postgresql</code> and <code>mysql</code> connectors speak the
        native database wire protocol, so the same connector works whether your
        database runs on <strong>AWS</strong> (RDS / Aurora), <strong>Google
        Cloud</strong> (Cloud SQL), <strong>Azure</strong> (Azure Database) or
        self-hosted. Just pick the matching <strong>Provider</strong> and point
        the host at your managed endpoint.
      </Callout>


      <H2 id="connect-step-by-step">Connect an asset step by step</H2>
      <Steps>
        <Step title="Open the connect dialog">
          <p>
            Go to <strong>Assets</strong> and click{" "}
            <strong>Connect asset</strong> (or use the command palette,{" "}
            <code>⌘K</code> → “Connect asset”).
          </p>
        </Step>
        <Step title="Choose a type and provider">
          <p>
            Select the asset type (for example Amazon S3 or PostgreSQL). The form
            adapts to show only the fields that type needs.
          </p>
        </Step>
        <Step title="Enter connection details">
          <p>
            Fill in the connection fields (documented below) using your read-only
            principal. Give the asset a clear name and optional tags so it is easy
            to find later.
          </p>
        </Step>
        <Step title="Test the connection">
          <p>
            Click <strong>Test connection</strong>. DataSentinel performs a
            lightweight reachability and auth check and reports latency. Resolve any
            errors before saving — a failed test usually means a network path or a
            missing permission.
          </p>
        </Step>
        <Step title="Save">
          <p>
            Save the asset. It appears in your inventory as <code>connected</code>{" "}
            and is immediately available to scan.
          </p>
        </Step>
      </Steps>

      <H2 id="connection-config">Connection configuration</H2>

      <H3 id="config-s3">Amazon S3</H3>
      <FieldList>
        <Field name="bucket_name" type="string" required>
          The bucket to scan.
        </Field>
        <Field name="region" type="string" required>
          AWS region, e.g. <code>ap-south-1</code>.
        </Field>
        <Field name="prefix" type="string">
          Restrict scanning to objects under this key prefix.
        </Field>
        <Field name="role_arn" type="string">
          An IAM role to assume for cross-account access. Alternatively provide an
          access key pair.
        </Field>
      </FieldList>
      <CodeBlock
        lang="json"
        title="connection_config — s3_bucket"
        code={`{
  "bucket_name": "acme-customer-data",
  "region": "ap-south-1",
  "prefix": "exports/",
  "role_arn": "arn:aws:iam::123456789012:role/ds-scan"
}`}
      />
      <p>
        Grant the principal <code>s3:ListBucket</code> and{" "}
        <code>s3:GetObject</code>, plus the read-only posture permissions
        (<code>s3:GetBucketPublicAccessBlock</code>,{" "}
        <code>s3:GetBucketEncryption</code>,{" "}
        <code>s3:GetBucketVersioning</code>).
      </p>

      <H3 id="config-postgres">PostgreSQL / RDS</H3>
      <FieldList>
        <Field name="host" type="string" required>
          Hostname and port, e.g. <code>db.internal:5432</code>.
        </Field>
        <Field name="database" type="string" required>
          The database to scan.
        </Field>
        <Field name="username" type="string" required>
          A read-only role.
        </Field>
        <Field name="password" type="string" required>
          Stored encrypted with your tenant key.
        </Field>
        <Field name="schema" type="string">
          Schema to scan; defaults to <code>public</code>.
        </Field>
        <Field name="ssl_mode" type="string">
          One of <code>disable</code>, <code>prefer</code>, <code>require</code>,{" "}
          <code>verify-full</code>. Use <code>require</code> or stronger.
        </Field>
      </FieldList>
      <CodeBlock
        lang="json"
        title="connection_config — postgresql"
        code={`{
  "host": "db.internal:5432",
  "database": "app",
  "username": "ds_readonly",
  "password": "••••••••",
  "schema": "public",
  "ssl_mode": "require"
}`}
      />
      <CodeBlock
        lang="sql"
        title="Create a read-only role"
        code={`CREATE ROLE ds_readonly LOGIN PASSWORD '••••••••';
GRANT CONNECT ON DATABASE app TO ds_readonly;
GRANT USAGE ON SCHEMA public TO ds_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ds_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ds_readonly;`}
      />
      <p>
        The same configuration works for managed PostgreSQL on any cloud — set{" "}
        <code>provider</code> to <code>aws</code> (RDS / Aurora),{" "}
        <code>gcp</code> (Cloud SQL) or <code>azure</code> (Azure Database for
        PostgreSQL) and point <code>host</code> at the managed endpoint.
      </p>

      <H3 id="config-mysql">MySQL / MariaDB</H3>
      <p>
        One connector covers MySQL and MariaDB everywhere they run — AWS RDS /
        Aurora MySQL, GCP Cloud SQL for MySQL and Azure Database for MySQL — since
        all speak the MySQL wire protocol.
      </p>
      <FieldList>
        <Field name="host" type="string" required>
          Hostname of the database server.
        </Field>
        <Field name="port" type="number">
          Defaults to <code>3306</code>.
        </Field>
        <Field name="database" type="string" required>
          The database (schema) to scan.
        </Field>
        <Field name="username" type="string" required>
          A read-only user.
        </Field>
        <Field name="password" type="string" required>
          Stored encrypted with your tenant key.
        </Field>
        <Field name="ssl" type="boolean">
          Set <code>true</code> to require TLS. Optionally pin a CA with{" "}
          <code>ssl_ca</code> (path to the CA bundle).
        </Field>
      </FieldList>
      <CodeBlock
        lang="json"
        title="connection_config — mysql"
        code={`{
  "host": "app-db.xxxx.ap-south-1.rds.amazonaws.com",
  "port": 3306,
  "database": "app",
  "username": "ds_readonly",
  "password": "••••••••",
  "ssl": true
}`}
      />
      <CodeBlock
        lang="sql"
        title="Create a read-only user"
        code={`CREATE USER 'ds_readonly'@'%' IDENTIFIED BY '••••••••' REQUIRE SSL;
GRANT SELECT ON app.* TO 'ds_readonly'@'%';
FLUSH PRIVILEGES;`}
      />

      <H3 id="config-gcs">Google Cloud Storage</H3>
      <FieldList>
        <Field name="bucket_name" type="string" required>
          The GCS bucket to scan.
        </Field>
        <Field name="project" type="string">
          GCP project id that owns the bucket.
        </Field>
        <Field name="prefix" type="string">
          Restrict scanning to objects under this name prefix.
        </Field>
        <Field name="credentials_json" type="string">
          Inline service-account JSON. If omitted, the worker uses{" "}
          <code>GOOGLE_APPLICATION_CREDENTIALS</code> or workload-identity
          (Application Default Credentials).
        </Field>
      </FieldList>
      <CodeBlock
        lang="json"
        title="connection_config — gcs_bucket"
        code={`{
  "bucket_name": "acme-customer-data",
  "project": "acme-prod",
  "prefix": "exports/"
}`}
      />
      <p>
        Grant the service account the{" "}
        <code>roles/storage.objectViewer</code> role on the bucket (and{" "}
        <code>roles/storage.legacyBucketReader</code> for posture metadata).
      </p>

      <H3 id="config-azure">Azure Blob Storage</H3>
      <FieldList>
        <Field name="account" type="string" required>
          Storage account name (omit if you provide a{" "}
          <code>connection_string</code>).
        </Field>
        <Field name="container" type="string" required>
          The blob container to scan.
        </Field>
        <Field name="connection_string" type="string">
          Full account connection string. Easiest option for getting started.
        </Field>
        <Field name="account_key" type="string">
          Shared-key credential (alternative to a connection string).
        </Field>
        <Field name="sas_token" type="string">
          SAS token credential (alternative to a key). If none of these are
          provided, the worker falls back to a managed identity.
        </Field>
        <Field name="prefix" type="string">
          Restrict scanning to blobs under this name prefix.
        </Field>
      </FieldList>
      <CodeBlock
        lang="json"
        title="connection_config — azure_blob"
        code={`{
  "account": "acmestorage",
  "container": "customer-exports",
  "connection_string": "DefaultEndpointsProtocol=https;AccountName=acmestorage;AccountKey=••••;EndpointSuffix=core.windows.net",
  "prefix": "2024/"
}`}
      />
      <p>
        Grant the principal the{" "}
        <strong>Storage Blob Data Reader</strong> role on the container, and keep
        the container’s public access level set to <strong>Private</strong>.
      </p>

      <H2 id="via-api">Connect via the API</H2>
      <p>
        You can register assets programmatically. See{" "}
        <DocLink href="/docs/api-keys">API keys</DocLink> to create a key first.
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -X POST https://app.datasentinel.io/api/v1/assets \\
  -H "X-API-Key: ds_live_••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Customer exports",
    "asset_type": "s3_bucket",
    "provider": "aws",
    "region": "ap-south-1",
    "connection_config": { "bucket_name": "acme-customer-data", "region": "ap-south-1" }
  }'`}
      />

      <Callout variant="tip" title="Next step">
        With an asset connected, run your first scan — see{" "}
        <DocLink href="/docs/scans">Scans &amp; workers</DocLink>.
      </Callout>
    </>
  );
}
