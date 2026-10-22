-- Migration 0001: password_resets table for the "Forgot password?" email flow.
--
-- SECURITY NOTES:
--   - token_hash stores the SHA-256 hash of the one-time token (never the raw token).
--   - expires_at is a Unix timestamp (seconds). 30-minute window, set at insert time.
--   - used_at is NULL until redeemed; once set the token is permanently invalid.
--   - Older unused tokens for the same email are invalidated at issue time
--     (UPDATE ... SET used_at = datetime('now') WHERE user_email = ? AND used_at IS NULL).
--   - request_ip is stored for audit; never returned to the client.
--   - Index on user_email speeds up the rate-limit counter query (per-email window).

CREATE TABLE IF NOT EXISTS password_resets (
  id           TEXT    PRIMARY KEY,          -- UUID v4 (random)
  user_email   TEXT    NOT NULL,
  token_hash   TEXT    NOT NULL,             -- SHA-256 of the raw 32-byte token, base64url encoded
  expires_at   INTEGER NOT NULL,             -- Unix epoch seconds
  used_at      TEXT    DEFAULT NULL,         -- ISO timestamp set when token is consumed
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  request_ip   TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets (user_email);
