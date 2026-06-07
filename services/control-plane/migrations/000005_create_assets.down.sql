-- 000005_create_assets.down.sql
DROP TRIGGER IF EXISTS assets_updated_at ON assets;
DROP TABLE IF EXISTS assets CASCADE;
