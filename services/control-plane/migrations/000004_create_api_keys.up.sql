-- 000004_create_api_keys.up.sql

CREATE TABLE api_keys (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    key_hash     TEXT        NOT NULL,               -- SHA-256 of raw key; never stored plaintext
    key_prefix   TEXT        NOT NULL,               -- first 8 chars shown in UI
    scopes       TEXT[]      NOT NULL DEFAULT '{}',  -- read | write | gateway | admin
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT api_keys_hash_unique UNIQUE (key_hash)
);

CREATE INDEX idx_api_keys_tenant_id ON api_keys (tenant_id);
CREATE INDEX idx_api_keys_user_id   ON api_keys (user_id);
CREATE INDEX idx_api_keys_key_hash  ON api_keys (key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys (tenant_id, is_active);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
