-- PF Platform — D1 schema, migration 0001 (initial)
-- Apply with:
--   npx wrangler@3 d1 execute pf-platform-db --remote --file=platform/migrations/0001_init.sql
-- (or --local for a local sqlite copy during development)
--
-- SECURITY NOTES:
--  - Passwords are stored ONLY as PBKDF2-HMAC-SHA256 hashes (password_hash) with
--    a per-user random salt and the iteration count. Never plaintext.
--  - email is UNIQUE (login key); stored lowercased by the app.
--  - role is constrained to the known roles (admin | partner | field_ops).
--  - must_reset forces a password change on first login (temp passwords).
--  - audit_log records auth + (future) edit events tied to user_id.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                 -- app-generated uuid
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,             -- login key (lowercased)
  password_hash TEXT NOT NULL,                    -- PBKDF2 derived key (base64url)
  salt          TEXT NOT NULL,                    -- per-user salt (base64url)
  iterations    INTEGER NOT NULL DEFAULT 210000,  -- PBKDF2 iteration count
  role          TEXT NOT NULL
                  CHECK (role IN ('admin', 'partner', 'field_ops')),
  active        INTEGER NOT NULL DEFAULT 1,        -- 1=enabled, 0=disabled
  must_reset    INTEGER NOT NULL DEFAULT 0,        -- 1=force password change next login
  created_at    TEXT NOT NULL,                     -- ISO timestamp
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Audit log: auth events now; edit events (Phase 2 write-back) later.
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                                    -- nullable (failed/anon events)
  action  TEXT NOT NULL,                           -- 'login' | 'logout' | 'edit' | ...
  detail  TEXT,                                    -- free-form context
  ts      TEXT NOT NULL,                           -- ISO timestamp
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts   ON audit_log (ts);

-- NOTE on sessions: this build uses STATELESS signed cookies (HMAC with
-- PF_TOKEN_SECRET), so no server-side sessions table is required. A sessions
-- table would only be needed to support server-side revocation; revisit if/when
-- "force logout everywhere" becomes a requirement. Documented decision.
