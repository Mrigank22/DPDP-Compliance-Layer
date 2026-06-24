-- 000011_clickhouse_schema.up.sql
-- Apply this directly against ClickHouse (not via golang-migrate).
-- Referenced here for documentation and the clickhouse.go setup routine.

-- -----------------------------------------------------------------------
-- gateway_events: every proxied request/response inspected by the gateway
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS datasentinel.gateway_events (
    id                    UUID,
    tenant_id             UUID,
    gateway_rule_id       UUID,
    timestamp             DateTime64(3, 'UTC'),
    request_id            UUID,
    source_ip             String,
    destination_url       String,
    http_method           String,
    action_taken          String,           -- masked | blocked | allowed | redacted | tokenized
    pii_types_detected    Array(String),
    field_names           Array(String),
    payload_size_bytes    UInt32,
    processing_latency_ms UInt16,
    was_llm_call          Bool DEFAULT false,
    llm_provider          String DEFAULT '',
    llm_model             String DEFAULT '',   -- e.g. gpt-4o, claude-3-5-sonnet (AI inventory)
    ai_app                String DEFAULT '',   -- X-AI-App attribution header (which AI system)
    ai_user               String DEFAULT '',   -- X-AI-User attribution header (which caller)
    prompt_tokens         UInt32 DEFAULT 0,    -- LLM token usage (AI usage & cost)
    completion_tokens     UInt32 DEFAULT 0,
    total_tokens          UInt32 DEFAULT 0,
    policy_id             UUID
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;

-- For existing deployments, add the AI-inventory + usage columns in place:
--   ALTER TABLE datasentinel.gateway_events
--     ADD COLUMN IF NOT EXISTS llm_model         String DEFAULT '',
--     ADD COLUMN IF NOT EXISTS ai_app            String DEFAULT '',
--     ADD COLUMN IF NOT EXISTS ai_user           String DEFAULT '',
--     ADD COLUMN IF NOT EXISTS prompt_tokens     UInt32 DEFAULT 0,
--     ADD COLUMN IF NOT EXISTS completion_tokens UInt32 DEFAULT 0,
--     ADD COLUMN IF NOT EXISTS total_tokens      UInt32 DEFAULT 0;

-- -----------------------------------------------------------------------
-- audit_logs: immutable user-action audit trail (7-year retention per DPDP)
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS datasentinel.audit_logs (
    id            UUID,
    tenant_id     UUID,
    user_id       UUID,
    action        String,           -- e.g. user.login, policy.created, finding.resolved
    resource_type String,
    resource_id   UUID,
    ip_address    String,
    user_agent    String,
    changes       String,           -- JSON encoded diff
    timestamp     DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, timestamp)
TTL timestamp + INTERVAL 7 YEAR
SETTINGS index_granularity = 8192;

