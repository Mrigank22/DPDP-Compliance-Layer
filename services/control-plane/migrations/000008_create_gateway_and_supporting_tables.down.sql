-- 000008_create_gateway_and_supporting_tables.down.sql
DROP TRIGGER IF EXISTS gateway_rules_updated_at ON gateway_rules;
DROP TRIGGER IF EXISTS rights_requests_updated_at ON rights_requests;
DROP TABLE IF EXISTS data_flows        CASCADE;
DROP TABLE IF EXISTS consent_records   CASCADE;
DROP TABLE IF EXISTS rights_requests   CASCADE;
DROP TABLE IF EXISTS reports           CASCADE;
DROP TABLE IF EXISTS alerts            CASCADE;
DROP TABLE IF EXISTS gateway_rules     CASCADE;
