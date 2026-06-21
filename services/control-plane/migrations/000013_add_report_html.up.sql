-- Store the rendered, print-ready HTML report alongside the JSON body so the
-- control plane can serve a branded, human-readable document on download.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content_html TEXT;
