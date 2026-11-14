-- Migration 0014: equipment service log table.
-- Requested by Derek Franke (owner), 2026-11-14.
--
-- SECURITY NOTES:
--   - id is generated server-side (crypto.randomUUID()), never accepted from the client.
--   - created_by / updated_by are set from session.name (server-side), never client input.
--   - All free-text fields are length-capped and stored via parameterised statements.
--   - cost / hour_meter / next_due_hours are REAL — validated server-side.
--   - service_date and next_due_date are stored as YYYY-MM-DD text; displayed MM/DD/YYYY.
--   - service_interval is INTEGER (500, 1000, 2000, or NULL for non-interval work).
--   - This migration is ADDITIVE ONLY.  No existing tables are modified.
--
-- A sync script will read this table directly; keep column names EXACT.

CREATE TABLE IF NOT EXISTS service_log_entries (
  id               TEXT    PRIMARY KEY,
  machine          TEXT    NOT NULL,
  service_date     TEXT    NOT NULL,                    -- YYYY-MM-DD
  hour_meter       REAL,
  service_type     TEXT    NOT NULL,
  service_interval INTEGER,                             -- 500 | 1000 | 2000 | NULL
  description      TEXT,
  parts_used       TEXT,
  vendor           TEXT,
  cost             REAL,
  performed_by     TEXT,
  next_due_hours   REAL,
  next_due_date    TEXT,                                -- YYYY-MM-DD
  notes            TEXT,
  created_by       TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by       TEXT,
  updated_at       TEXT
);

-- Guard for tables created before service_interval was added (safe to run repeatedly;
-- D1 ignores the ALTER if the column already exists via the application-layer try/catch).
-- Note: SQLite does not support ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- The application code (service-log.js ensureTable) handles this via try/catch.

CREATE INDEX IF NOT EXISTS idx_sl_machine ON service_log_entries (machine);
CREATE INDEX IF NOT EXISTS idx_sl_date    ON service_log_entries (service_date DESC);
