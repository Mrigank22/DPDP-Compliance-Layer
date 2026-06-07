-- 000005_create_assets.up.sql

CREATE TABLE assets (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    asset_type        TEXT        NOT NULL
                                  CHECK (asset_type IN (
                                      's3_bucket','rds_instance','gcs_bucket',
                                      'azure_blob','postgresql','api_endpoint','llm_endpoint'
                                  )),
    provider          TEXT        NOT NULL
                                  CHECK (provider IN ('aws','gcp','azure','onprem')),
    region            TEXT,
    connection_config JSONB,                          -- AES-256-GCM encrypted at app layer
    credentials_ref   TEXT,                           -- reference to AWS Secrets Manager / env
    status            TEXT        NOT NULL DEFAULT 'connected'
                                  CHECK (status IN ('connected','disconnected','scanning','error')),
    last_scanned_at   TIMESTAMPTZ,
    pii_record_count  BIGINT      NOT NULL DEFAULT 0,
    risk_score        INTEGER     NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    tags              JSONB       NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_tenant_id   ON assets (tenant_id);
CREATE INDEX idx_assets_type        ON assets (tenant_id, asset_type);
CREATE INDEX idx_assets_provider    ON assets (tenant_id, provider);
CREATE INDEX idx_assets_status      ON assets (tenant_id, status);
CREATE INDEX idx_assets_risk_score  ON assets (tenant_id, risk_score DESC);
CREATE INDEX idx_assets_tags        ON assets USING GIN (tags);

CREATE TRIGGER assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON assets
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
