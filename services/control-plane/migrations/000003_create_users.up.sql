-- 000003_create_users.up.sql

CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    password_hash   TEXT,                           -- bcrypt cost 12; NULL for SSO users
    full_name       TEXT        NOT NULL DEFAULT '',
    role            TEXT        NOT NULL DEFAULT 'viewer'
                                CHECK (role IN ('owner','admin','analyst','viewer')),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,                    -- account lockout
    mfa_enabled     BOOLEAN     NOT NULL DEFAULT false,
    mfa_secret      TEXT,                           -- AES-256-GCM encrypted TOTP secret
    invited_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX idx_users_tenant_id ON users (tenant_id);
CREATE INDEX idx_users_email     ON users (email);
CREATE INDEX idx_users_role      ON users (tenant_id, role);

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
