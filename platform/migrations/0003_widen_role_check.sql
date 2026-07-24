-- PF Platform — D1 migration 0003: widen the users.role CHECK constraint
--
-- WHY: the original 0001_init.sql created users with
--        CHECK (role IN ('admin', 'partner', 'field_ops'))
--      which PREDATES the two roles that now exist in the app RBAC
--      (functions/lib/auth.js ROLES = admin | partner | business_dev | field_ops | hr).
--      Inserting or updating any user to role='hr' or role='business_dev' would be
--      REJECTED by the old CHECK. This migration widens the constraint so an `hr`
--      user (for the HR module) and a `business_dev` user can be seeded/updated.
--
-- WHAT IT DOES (SQLite table-rebuild pattern — CHECK cannot be altered in place):
--   1. create users_new with the widened CHECK (all 5 current roles),
--   2. copy every existing row verbatim (ids/hashes/salts unchanged — no re-seed,
--      no password change, no session invalidation),
--   3. drop the old table, rename the new one,
--   4. recreate the email index.
--
-- SAFETY:
--   - No password hashes, salts, or roles are altered for existing rows — this is a
--     pure constraint widening. Every current login keeps working.
--   - Idempotent-ish: guarded by the table swap; re-running after it has been applied
--     is a no-op on the constraint (running twice just rebuilds an already-correct table).
--   - Apply BEFORE inserting/updating any user to role='hr' or 'business_dev'.
--
-- Apply:
--   npx wrangler@3 d1 execute pf-platform-db --remote --file=platform/migrations/0003_widen_role_check.sql

-- NOTE (D1): do NOT use explicit BEGIN TRANSACTION / COMMIT here. D1's remote
-- executor rejects raw SQL transaction control ("please use state.storage.transaction()")
-- and it already wraps a --file execution atomically (all-or-nothing; on failure the
-- DB returns to its original state). PRAGMA statements are likewise omitted (D1 manages
-- foreign_keys). The statements below run in order as one atomic batch.

CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 210000,
  role          TEXT NOT NULL
                  CHECK (role IN ('admin', 'partner', 'business_dev', 'field_ops', 'hr')),
  active        INTEGER NOT NULL DEFAULT 1,
  must_reset    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT
);

INSERT INTO users_new (id, name, email, password_hash, salt, iterations, role, active, must_reset, created_at, updated_at)
  SELECT id, name, email, password_hash, salt, iterations, role, active, must_reset, created_at, updated_at
  FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
