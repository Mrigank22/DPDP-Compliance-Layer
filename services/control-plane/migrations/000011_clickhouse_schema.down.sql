-- 000011_clickhouse_schema.down.sql
-- Rollback ClickHouse schema

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS gateway_events;

