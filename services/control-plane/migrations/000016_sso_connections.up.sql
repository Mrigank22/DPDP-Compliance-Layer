-- Enterprise SSO — per-tenant OIDC connection.
--
-- One OIDC connection per tenant. At login the user enters their email and we
-- resolve the tenant by matching the email domain against email_domains, then
-- redirect to that tenant's identity provider. That lookup happens BEFORE any
-- auth/tenant context exists, so this table intentionally does NOT use RLS;
-- tenant scoping is enforced explicitly in the admin config paths (WHERE
-- tenant_id = ?). The client secret is encrypted at the application layer.

CREATE TABLE sso_connections (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider       TEXT        NOT NULL DEFAULT 'oidc' CHECK (provider IN ('oidc')),
    enabled        BOOLEAN     NOT NULL DEFAULT false,
    issuer_url     TEXT        NOT NULL DEFAULT '',
    client_id      TEXT        NOT NULL DEFAULT '',
    client_secret  TEXT        NOT NULL DEFAULT '',  -- AES-256-GCM encrypted (app layer)
    email_domains  TEXT[]      NOT NULL DEFAULT '{}',
    default_role   TEXT        NOT NULL DEFAULT 'viewer'
                               CHECK (default_role IN ('admin','analyst','viewer')),
    auto_provision BOOLEAN     NOT NULL DEFAULT true,
    -- SCIM 2.0 provisioning: the IdP authenticates with a bearer token; only its
    -- hash is stored. scim_enabled gates whether SCIM calls are accepted.
    scim_enabled    BOOLEAN    NOT NULL DEFAULT false,
    scim_token_hash TEXT       NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sso_connections_tenant_unique UNIQUE (tenant_id)
);

CREATE INDEX idx_sso_connections_tenant ON sso_connections (tenant_id);
-- Domain → tenant resolution at login time.
CREATE INDEX idx_sso_connections_domains ON sso_connections USING GIN (email_domains);
-- SCIM bearer-token lookup (only populated when SCIM is enabled).
CREATE INDEX idx_sso_connections_scim_token ON sso_connections (scim_token_hash)
    WHERE scim_token_hash <> '';

CREATE TRIGGER sso_connections_updated_at
    BEFORE UPDATE ON sso_connections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
