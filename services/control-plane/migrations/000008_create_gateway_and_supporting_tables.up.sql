-- 000008_create_gateway_and_supporting_tables.up.sql

-- -----------------------------------------------------------------------
-- gateway_rules
-- -----------------------------------------------------------------------

CREATE TABLE gateway_rules (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
    policy_id      UUID        REFERENCES policies(id)           ON DELETE SET NULL,
    name           TEXT        NOT NULL,
    route_pattern  TEXT        NOT NULL,
    http_methods   TEXT[]      NOT NULL DEFAULT '{"*"}',
    direction      TEXT        NOT NULL DEFAULT 'both'
                               CHECK (direction IN ('request','response','both')),
    action         TEXT        NOT NULL
                               CHECK (action IN ('mask','redact','block','tokenize','alert','allow')),
    pii_types      TEXT[]      NOT NULL DEFAULT '{}',
    mask_config    JSONB       NOT NULL DEFAULT '{}',
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gateway_rules_tenant_id ON gateway_rules (tenant_id);
CREATE INDEX idx_gateway_rules_active    ON gateway_rules (tenant_id, is_active);
CREATE INDEX idx_gateway_rules_policy_id ON gateway_rules (policy_id);

CREATE TRIGGER gateway_rules_updated_at
    BEFORE UPDATE ON gateway_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE gateway_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON gateway_rules
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- alerts
-- -----------------------------------------------------------------------

CREATE TABLE alerts (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type          TEXT        NOT NULL
                                    CHECK (alert_type IN (
                                        'policy_violation','breach_detected','scan_anomaly',
                                        'rights_deadline','retention_due','cross_border_detected'
                                    )),
    severity            TEXT        NOT NULL
                                    CHECK (severity IN ('critical','high','medium','low','info')),
    title               TEXT        NOT NULL,
    body                TEXT        NOT NULL DEFAULT '',
    related_finding_id  UUID        REFERENCES findings(id) ON DELETE SET NULL,
    related_asset_id    UUID        REFERENCES assets(id)   ON DELETE SET NULL,
    is_acknowledged     BOOLEAN     NOT NULL DEFAULT false,
    acknowledged_by     UUID        REFERENCES users(id)    ON DELETE SET NULL,
    acknowledged_at     TIMESTAMPTZ,
    notification_sent   BOOLEAN     NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_tenant_id      ON alerts (tenant_id);
CREATE INDEX idx_alerts_type           ON alerts (tenant_id, alert_type);
CREATE INDEX idx_alerts_severity       ON alerts (tenant_id, severity);
CREATE INDEX idx_alerts_acknowledged   ON alerts (tenant_id, is_acknowledged);
CREATE INDEX idx_alerts_created_at     ON alerts (tenant_id, created_at DESC);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON alerts
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- reports
-- -----------------------------------------------------------------------

CREATE TABLE reports (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type      TEXT        NOT NULL
                                 CHECK (report_type IN (
                                     'dpdp_compliance','executive_summary','asset_inventory',
                                     'incident_report','dpia','audit_evidence'
                                 )),
    title            TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'generating'
                                 CHECK (status IN ('generating','ready','failed')),
    file_url         TEXT,
    file_size_bytes  BIGINT,
    generated_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    parameters       JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_tenant_id  ON reports (tenant_id);
CREATE INDEX idx_reports_type       ON reports (tenant_id, report_type);
CREATE INDEX idx_reports_status     ON reports (tenant_id, status);
CREATE INDEX idx_reports_created_at ON reports (tenant_id, created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON reports
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- rights_requests (Data Subject Requests under DPDP Act)
-- -----------------------------------------------------------------------

CREATE TABLE rights_requests (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_type          TEXT        NOT NULL
                                      CHECK (request_type IN (
                                          'access','correction','erasure','portability','nomination'
                                      )),
    data_principal_email  TEXT        NOT NULL,
    data_principal_name   TEXT,
    status                TEXT        NOT NULL DEFAULT 'received'
                                      CHECK (status IN ('received','in_progress','completed','rejected')),
    due_date              TIMESTAMPTZ NOT NULL,    -- 90 days from created_at per DPDP Act
    assigned_to           UUID        REFERENCES users(id) ON DELETE SET NULL,
    notes                 TEXT,
    response_data         JSONB,
    rejection_reason      TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rights_requests_tenant_id  ON rights_requests (tenant_id);
CREATE INDEX idx_rights_requests_status     ON rights_requests (tenant_id, status);
CREATE INDEX idx_rights_requests_due_date   ON rights_requests (tenant_id, due_date);
CREATE INDEX idx_rights_requests_email      ON rights_requests (tenant_id, data_principal_email);

CREATE TRIGGER rights_requests_updated_at
    BEFORE UPDATE ON rights_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE rights_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON rights_requests
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- consent_records
-- -----------------------------------------------------------------------

CREATE TABLE consent_records (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    data_principal_id     TEXT        NOT NULL,
    purpose               TEXT        NOT NULL,
    consent_given         BOOLEAN     NOT NULL,
    consent_timestamp     TIMESTAMPTZ,
    withdrawal_timestamp  TIMESTAMPTZ,
    notice_version        TEXT,
    ip_address            TEXT,
    consent_mechanism     TEXT        NOT NULL DEFAULT 'form'
                                      CHECK (consent_mechanism IN ('form','api','sdk','import')),
    metadata              JSONB       NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_records_tenant_id         ON consent_records (tenant_id);
CREATE INDEX idx_consent_records_principal_id      ON consent_records (tenant_id, data_principal_id);
CREATE INDEX idx_consent_records_purpose           ON consent_records (tenant_id, purpose);
CREATE INDEX idx_consent_records_consent_given     ON consent_records (tenant_id, consent_given);
CREATE INDEX idx_consent_records_consent_timestamp ON consent_records (tenant_id, consent_timestamp DESC);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON consent_records
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- data_flows
-- -----------------------------------------------------------------------

CREATE TABLE data_flows (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            UUID        NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
    source_asset_id      UUID        REFERENCES assets(id)            ON DELETE SET NULL,
    destination_url      TEXT        NOT NULL,
    destination_type     TEXT        NOT NULL
                                     CHECK (destination_type IN (
                                         'internal_api','external_api','llm',
                                         'storage','email','third_party'
                                     )),
    pii_types_involved   TEXT[]      NOT NULL DEFAULT '{}',
    is_approved          BOOLEAN     NOT NULL DEFAULT false,
    approved_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    first_detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_count          BIGINT      NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_flows_tenant_id        ON data_flows (tenant_id);
CREATE INDEX idx_data_flows_source_asset     ON data_flows (source_asset_id);
CREATE INDEX idx_data_flows_destination_type ON data_flows (tenant_id, destination_type);
CREATE INDEX idx_data_flows_is_approved      ON data_flows (tenant_id, is_approved);
CREATE INDEX idx_data_flows_pii_types        ON data_flows USING GIN (pii_types_involved);

ALTER TABLE data_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON data_flows
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
