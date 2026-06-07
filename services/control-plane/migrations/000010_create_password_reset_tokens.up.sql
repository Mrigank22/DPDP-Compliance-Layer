-- 000010_create_password_reset_tokens.up.sql

CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,        -- SHA-256 of raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN     NOT NULL DEFAULT false,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT password_reset_tokens_hash_unique UNIQUE (token_hash)
);

CREATE INDEX idx_pw_reset_tokens_user_id    ON password_reset_tokens (user_id);
CREATE INDEX idx_pw_reset_tokens_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_pw_reset_tokens_expires_at ON password_reset_tokens (expires_at);
