-- 000002_create_tenants.up.sql

CREATE TABLE tenants (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    slug         TEXT        NOT NULL,
    plan         TEXT        NOT NULL DEFAULT 'starter'
                             CHECK (plan IN ('starter','growth','enterprise')),
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    settings     JSONB       NOT NULL DEFAULT '{}',
    data_region  TEXT        NOT NULL DEFAULT 'ap-south-1',
    private_deploy BOOLEAN   NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_tenants_slug      ON tenants (slug);
CREATE INDEX idx_tenants_is_active ON tenants (is_active);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row-Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
    USING (id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
