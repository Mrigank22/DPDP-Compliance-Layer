-- Per-tenant PII detection tuning: custom detectors (regex), ignore/allow-lists
-- to suppress known false positives, and an overridable confidence threshold.
CREATE TABLE detection_settings (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    confidence_threshold REAL        NOT NULL DEFAULT 0.7
                                     CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
    custom_pii_types     JSONB       NOT NULL DEFAULT '[]',
    ignore_patterns      JSONB       NOT NULL DEFAULT '[]',
    updated_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT detection_settings_tenant_unique UNIQUE (tenant_id)
);

CREATE INDEX idx_detection_settings_tenant ON detection_settings (tenant_id);

CREATE TRIGGER detection_settings_updated_at
    BEFORE UPDATE ON detection_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE detection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON detection_settings
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
