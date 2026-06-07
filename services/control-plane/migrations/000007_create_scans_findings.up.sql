-- 000007_create_scans_findings.up.sql

-- -----------------------------------------------------------------------
-- scans
-- -----------------------------------------------------------------------

CREATE TABLE scans (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id         UUID        NOT NULL REFERENCES assets(id)  ON DELETE CASCADE,
    scan_type        TEXT        NOT NULL
                                 CHECK (scan_type IN ('full','incremental','targeted')),
    status           TEXT        NOT NULL DEFAULT 'queued'
                                 CHECK (status IN ('queued','running','completed','failed','cancelled')),
    triggered_by     TEXT        NOT NULL DEFAULT 'schedule'
                                 CHECK (triggered_by IN ('schedule','manual','api')),
    celery_task_id   TEXT,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    records_scanned  BIGINT      NOT NULL DEFAULT 0,
    pii_records_found BIGINT     NOT NULL DEFAULT 0,
    error_message    TEXT,
    summary          JSONB       NOT NULL DEFAULT '{}',   -- {aadhaar:N, pan:N, phone:N, ...}
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scans_tenant_id  ON scans (tenant_id);
CREATE INDEX idx_scans_asset_id   ON scans (asset_id);
CREATE INDEX idx_scans_status     ON scans (tenant_id, status);
CREATE INDEX idx_scans_created_at ON scans (tenant_id, created_at DESC);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON scans
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- findings
-- -----------------------------------------------------------------------

CREATE TABLE findings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    scan_id         UUID        REFERENCES scans(id)              ON DELETE SET NULL,
    asset_id        UUID        NOT NULL REFERENCES assets(id)   ON DELETE CASCADE,
    finding_type    TEXT        NOT NULL
                                CHECK (finding_type IN (
                                    'pii_exposure','misconfiguration','policy_violation',
                                    'cross_border_transfer','llm_leak','retention_violation'
                                )),
    severity        TEXT        NOT NULL
                                CHECK (severity IN ('critical','high','medium','low','info')),
    title           TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    pii_types       TEXT[]      NOT NULL DEFAULT '{}',
    location        JSONB       NOT NULL DEFAULT '{}',   -- {table, column, bucket, key_path}
    sample_count    BIGINT      NOT NULL DEFAULT 0,
    is_resolved     BOOLEAN     NOT NULL DEFAULT false,
    resolved_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    evidence        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_findings_tenant_id    ON findings (tenant_id);
CREATE INDEX idx_findings_asset_id     ON findings (asset_id);
CREATE INDEX idx_findings_scan_id      ON findings (scan_id);
CREATE INDEX idx_findings_severity     ON findings (tenant_id, severity);
CREATE INDEX idx_findings_type         ON findings (tenant_id, finding_type);
CREATE INDEX idx_findings_is_resolved  ON findings (tenant_id, is_resolved);
CREATE INDEX idx_findings_pii_types    ON findings USING GIN (pii_types);
CREATE INDEX idx_findings_created_at   ON findings (tenant_id, created_at DESC);

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON findings
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
