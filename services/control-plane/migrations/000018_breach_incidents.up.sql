-- Personal data breach incidents (DPDP Act 2023 §8(6)).
--
-- A first-class breach register: record an incident, assess its scope, track the
-- statutory intimations to the Data Protection Board (within 72h of awareness)
-- and to each affected Data Principal, and keep an immutable action timeline that
-- doubles as the evidence pack.

CREATE TABLE breach_incidents (
    id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reference                 TEXT        NOT NULL,
    title                     TEXT        NOT NULL,
    description               TEXT        NOT NULL DEFAULT '',
    status                    TEXT        NOT NULL DEFAULT 'open'
                                          CHECK (status IN ('open','assessing','contained','notified','closed')),
    severity                  TEXT        NOT NULL DEFAULT 'medium'
                                          CHECK (severity IN ('low','medium','high','critical')),
    -- Nature of the breach (CIA): confidentiality | integrity | availability.
    categories                TEXT[]      NOT NULL DEFAULT '{}',
    -- Categories of personal data affected (e.g. financial, health, contact).
    affected_data_types       TEXT[]      NOT NULL DEFAULT '{}',
    affected_principals       INTEGER     NOT NULL DEFAULT 0 CHECK (affected_principals >= 0),
    affected_asset_ids        UUID[]      NOT NULL DEFAULT '{}',
    discovered_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- when the fiduciary became aware (drives the 72h deadline)
    occurred_at               TIMESTAMPTZ,
    root_cause                TEXT        NOT NULL DEFAULT '',
    consequences              TEXT        NOT NULL DEFAULT '',      -- likely impact on data principals
    mitigation_measures       TEXT        NOT NULL DEFAULT '',      -- containment actions taken
    remedial_measures         TEXT        NOT NULL DEFAULT '',      -- steps to prevent recurrence
    board_notified_at         TIMESTAMPTZ,
    board_reference           TEXT        NOT NULL DEFAULT '',
    principals_notified_at    TIMESTAMPTZ,
    principals_notified_count INTEGER     NOT NULL DEFAULT 0 CHECK (principals_notified_count >= 0),
    reported_by               UUID        REFERENCES users(id) ON DELETE SET NULL,
    assigned_to               UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT breach_incidents_tenant_ref_unique UNIQUE (tenant_id, reference)
);

CREATE INDEX idx_breach_incidents_tenant        ON breach_incidents (tenant_id);
CREATE INDEX idx_breach_incidents_status        ON breach_incidents (tenant_id, status);
CREATE INDEX idx_breach_incidents_discovered_at ON breach_incidents (tenant_id, discovered_at DESC);

CREATE TRIGGER breach_incidents_updated_at
    BEFORE UPDATE ON breach_incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE breach_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON breach_incidents
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');

-- -----------------------------------------------------------------------
-- breach_timeline_entries: immutable per-incident action log / evidence trail
-- -----------------------------------------------------------------------

CREATE TABLE breach_timeline_entries (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id UUID        NOT NULL REFERENCES breach_incidents(id) ON DELETE CASCADE,
    entry_type  TEXT        NOT NULL DEFAULT 'note'
                            CHECK (entry_type IN ('created','note','status_change','scope_update',
                                                  'board_notified','principals_notified','closed')),
    note        TEXT        NOT NULL DEFAULT '',
    actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_breach_timeline_incident ON breach_timeline_entries (incident_id, created_at);
CREATE INDEX idx_breach_timeline_tenant   ON breach_timeline_entries (tenant_id);

ALTER TABLE breach_timeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON breach_timeline_entries
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
           OR current_setting('app.current_tenant_id', true) IS NULL
           OR current_setting('app.current_tenant_id', true) = '');
