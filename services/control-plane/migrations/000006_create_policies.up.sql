-- 000006_create_policies.up.sql

CREATE TABLE policies (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    description      TEXT        NOT NULL DEFAULT '',
    policy_type      TEXT        NOT NULL
                                 CHECK (policy_type IN (
                                     'data_masking','transfer_control','retention',
                                     'consent','access_control','llm_guard','breach_response'
                                 )),
    status           TEXT        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active','inactive','draft')),
    enforcement_mode TEXT        NOT NULL DEFAULT 'alert'
                                 CHECK (enforcement_mode IN ('alert','enforce','audit_only')),
    priority         INTEGER     NOT NULL DEFAULT 100 CHECK (priority > 0),
    rules            JSONB       NOT NULL DEFAULT '{}',
    applies_to       JSONB       NOT NULL DEFAULT '{}',    -- {asset_ids:[], asset_types:[], tags:{}}
    created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
    version          INTEGER     NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_tenant_id    ON policies (tenant_id);
CREATE INDEX idx_policies_type         ON policies (tenant_id, policy_type);
CREATE INDEX idx_policies_status       ON policies (tenant_id, status);
CREATE INDEX idx_policies_priority     ON policies (tenant_id, priority);
CREATE INDEX idx_policies_rules        ON policies USING GIN (rules);
CREATE INDEX idx_policies_applies_to   ON policies USING GIN (applies_to);

CREATE TRIGGER policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON policies
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- policy_versions: immutable audit trail of every policy change
-- -----------------------------------------------------------------------

CREATE TABLE policy_versions (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id      UUID        NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    -- Denormalized for direct RLS enforcement (avoids a join back to policies).
    tenant_id      UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    version        INTEGER     NOT NULL,
    rules          JSONB       NOT NULL,
    changed_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    change_summary TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_versions_unique_version UNIQUE (policy_id, version)
);

CREATE INDEX idx_policy_versions_policy_id ON policy_versions (policy_id);
CREATE INDEX idx_policy_versions_tenant_id ON policy_versions (tenant_id);

ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON policy_versions
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
