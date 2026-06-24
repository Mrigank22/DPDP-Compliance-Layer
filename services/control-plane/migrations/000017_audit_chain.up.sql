-- Tamper-evident audit ledger (hash chain).
--
-- A per-tenant, append-only chain: each entry's hash covers the previous entry's
-- hash plus the entry's own fields, so any insertion, deletion or modification
-- of a past entry breaks the chain and is detectable by re-computation.
--
-- No RLS: appends happen inside a serialized transaction keyed by tenant via a
-- Postgres advisory lock and all queries scope by tenant_id explicitly.

CREATE TABLE audit_chain (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    seq           BIGINT      NOT NULL,
    action        TEXT        NOT NULL,
    actor_id      TEXT        NOT NULL DEFAULT '',
    resource_type TEXT        NOT NULL DEFAULT '',
    resource_id   TEXT        NOT NULL DEFAULT '',
    changes       TEXT        NOT NULL DEFAULT '',
    prev_hash     TEXT        NOT NULL DEFAULT '',
    hash          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_chain_tenant_seq_unique UNIQUE (tenant_id, seq)
);

CREATE INDEX idx_audit_chain_tenant_seq ON audit_chain (tenant_id, seq DESC);
