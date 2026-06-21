-- Store the generated report body directly in the database so it can be
-- downloaded through the control plane when external object storage (S3) is
-- not configured. When S3 is used, file_url holds a presigned URL and this
-- column may be left populated as a durable fallback.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content TEXT;
