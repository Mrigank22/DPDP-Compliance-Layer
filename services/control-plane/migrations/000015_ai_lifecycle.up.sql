-- AI Governance — Pillar 5: lifecycle & oversight.
--
-- Immutable attestation log (ai_attestations) recording every lifecycle
-- transition and human sign-off. The approval/review columns it works alongside
-- (approved_by, approved_at, last_reviewed_at, review_due_at) live on ai_systems
-- — see 000013_ai_governance.

CREATE TABLE ai_attestations (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ai_system_id  UUID        NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
    action        TEXT        NOT NULL
                              CHECK (action IN ('submit_review','approve','mark_reviewed','retire','reopen')),
    from_stage    TEXT        NOT NULL DEFAULT '',
    to_stage      TEXT        NOT NULL DEFAULT '',
    statement     TEXT        NOT NULL DEFAULT '',
    actor_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_attestations_tenant ON ai_attestations (tenant_id);
CREATE INDEX idx_ai_attestations_system ON ai_attestations (ai_system_id, created_at DESC);

ALTER TABLE ai_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_attestations
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
