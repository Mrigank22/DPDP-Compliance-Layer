-- 000006_create_policies.down.sql
DROP TRIGGER IF EXISTS policies_updated_at ON policies;
DROP TABLE IF EXISTS policy_versions CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
