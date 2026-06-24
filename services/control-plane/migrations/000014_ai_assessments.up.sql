-- AI Governance — Pillar 3: framework risk assessments.
--
-- ai_assessments : one framework assessment (NIST AI RMF / EU AI Act / ISO 42001
--                  / DPDP) per AI system. The reference control library lives in
--                  code; this table stores per-control answers + a readiness score.

CREATE TABLE ai_assessments (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ai_system_id  UUID        NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
    framework     TEXT        NOT NULL
                              CHECK (framework IN ('nist_ai_rmf','eu_ai_act','iso_42001','dpdp')),
    status        TEXT        NOT NULL DEFAULT 'in_progress'
                              CHECK (status IN ('draft','in_progress','completed')),
    responses     JSONB       NOT NULL DEFAULT '[]',
    score         INT         NOT NULL DEFAULT 0,
    assessed_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_assessments_unique UNIQUE (tenant_id, ai_system_id, framework)
);

CREATE INDEX idx_ai_assessments_tenant ON ai_assessments (tenant_id);
CREATE INDEX idx_ai_assessments_system ON ai_assessments (ai_system_id);

CREATE TRIGGER ai_assessments_updated_at
    BEFORE UPDATE ON ai_assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_assessments
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
