-- AI Governance — Pillar 1: AI inventory & model catalog.
--
-- ai_systems  : a registered AI use-case / application under governance.
-- ai_models   : the provider+model entries an AI system uses (registered in the
--               catalog, or observed from gateway traffic).
--
-- Shadow-AI discovery is computed live from gateway_events (ClickHouse) and
-- reconciled against this registry, so un-registered models surface as "shadow".

CREATE TABLE ai_systems (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    owner           TEXT        NOT NULL DEFAULT '',
    lifecycle_stage TEXT        NOT NULL DEFAULT 'discovered'
                                CHECK (lifecycle_stage IN ('discovered','proposed','under_review','approved','retired')),
    -- EU AI Act risk tier; populated by later assessment pillars, default unassessed.
    risk_tier       TEXT        NOT NULL DEFAULT 'unassessed'
                                CHECK (risk_tier IN ('unassessed','minimal','limited','high','prohibited')),
    providers       TEXT[]      NOT NULL DEFAULT '{}',
    endpoints       TEXT[]      NOT NULL DEFAULT '{}',
    status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','archived')),
    tags            JSONB       NOT NULL DEFAULT '{}',
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    -- Lifecycle & oversight (Pillar 5): approval + periodic-review tracking.
    approved_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    approved_at      TIMESTAMPTZ,
    last_reviewed_at TIMESTAMPTZ,
    review_due_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_systems_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX idx_ai_systems_tenant ON ai_systems (tenant_id);

CREATE TRIGGER ai_systems_updated_at
    BEFORE UPDATE ON ai_systems
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_systems
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


CREATE TABLE ai_models (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ai_system_id   UUID        REFERENCES ai_systems(id) ON DELETE SET NULL,
    provider       TEXT        NOT NULL,
    model          TEXT        NOT NULL,
    display_name   TEXT        NOT NULL DEFAULT '',
    source         TEXT        NOT NULL DEFAULT 'registered'
                               CHECK (source IN ('observed','registered')),
    first_seen_at  TIMESTAMPTZ,
    last_seen_at   TIMESTAMPTZ,
    call_count     BIGINT      NOT NULL DEFAULT 0,
    pii_call_count BIGINT      NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_models_tenant_provider_model_unique UNIQUE (tenant_id, provider, model)
);

CREATE INDEX idx_ai_models_tenant ON ai_models (tenant_id);
CREATE INDEX idx_ai_models_system ON ai_models (ai_system_id);

CREATE TRIGGER ai_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_models
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
