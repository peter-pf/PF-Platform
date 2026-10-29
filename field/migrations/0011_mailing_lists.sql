-- Migration 0011: per-form mailing lists for field portal email recipients.
-- Requested by Derek Franke (owner), 2026-10-29.
--
-- SECURITY NOTES:
--   - list_key is constrained to the 5 known form keys.
--   - email is stored lowercased; the API enforces lowercase + format validation.
--   - added_by is set server-side from the authenticated session uid, never from the client.
--   - Only owners (breinking@, jreinking@, dfranke@ pierfoundations.com) may add/remove;
--     enforced in /api/mailing-lists, NOT here in SQL (email allowlist in the handler).
--   - UNIQUE(list_key, email) prevents duplicate entries.
--   - This migration is ADDITIVE ONLY. No existing tables are modified.
--
-- SEED STRATEGY:
--   The INSERTs below reproduce exactly the current ACTIVE_RECIPIENTS from each
--   submit endpoint as of 2026-10-29, so behaviour is UNCHANGED at deploy time.
--   Verified against source:
--     daily_report     -- TEST_RECIPIENTS = ['pfpeter@agentmail.to']
--     site_readiness   -- TEST_RECIPIENTS = ['pfpeter@agentmail.to']
--     toolbox_talk     -- TEST_RECIPIENTS = ['dfranke@pierfoundations.com']
--     time_off         -- ACTIVE_RECIPIENTS = PROD_RECIPIENTS (already live):
--                         breinking@, jreinking@, dfranke@
--     equipment_inspection -- no email before this migration; Derek = first recipient
--
-- Apply:
--   npx wrangler d1 execute pf-platform-db --remote \
--     --file=field/migrations/0011_mailing_lists.sql
-- (or --local for a local SQLite copy during development)

CREATE TABLE IF NOT EXISTS mailing_lists (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  list_key     TEXT    NOT NULL
                 CHECK (list_key IN (
                   'daily_report',
                   'site_readiness',
                   'toolbox_talk',
                   'time_off',
                   'equipment_inspection'
                 )),
  email        TEXT    NOT NULL,           -- lowercased, validated by API before insert
  display_name TEXT,                       -- optional human-readable label
  added_by     TEXT    NOT NULL DEFAULT 'seed', -- uid of admin who added; 'seed' for migration rows
  added_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (list_key, email)
);

CREATE INDEX IF NOT EXISTS idx_ml_list_key ON mailing_lists (list_key);
CREATE INDEX IF NOT EXISTS idx_ml_email    ON mailing_lists (email);

-- ============================================================
-- SEED: current ACTIVE_RECIPIENTS per endpoint (2026-10-29)
-- Nothing changes at deploy time — these mirror what the code
-- sent before this migration was added.
-- ============================================================

-- daily_report: TEST_RECIPIENTS (pfpeter only, pending Derek go-live)
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('daily_report', 'pfpeter@agentmail.to', 'Peter (AI agent)', 'seed', '2026-10-29T00:00:00.000Z');

-- site_readiness: TEST_RECIPIENTS (pfpeter only, pending Derek go-live)
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('site_readiness', 'pfpeter@agentmail.to', 'Peter (AI agent)', 'seed', '2026-10-29T00:00:00.000Z');

-- toolbox_talk: TEST_RECIPIENTS (dfranke only, pending Derek go-live)
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('toolbox_talk', 'dfranke@pierfoundations.com', 'Derek Franke', 'seed', '2026-10-29T00:00:00.000Z');

-- time_off: already using PROD_RECIPIENTS (all three owners)
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('time_off', 'breinking@pierfoundations.com', 'Brad Reinking', 'seed', '2026-10-29T00:00:00.000Z');
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('time_off', 'jreinking@pierfoundations.com', 'Jonathan Reinking', 'seed', '2026-10-29T00:00:00.000Z');
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('time_off', 'dfranke@pierfoundations.com', 'Derek Franke', 'seed', '2026-10-29T00:00:00.000Z');

-- equipment_inspection: no email existed before; Derek receives inspections per owner request
INSERT OR IGNORE INTO mailing_lists (list_key, email, display_name, added_by, added_at)
  VALUES ('equipment_inspection', 'dfranke@pierfoundations.com', 'Derek Franke', 'seed', '2026-10-29T00:00:00.000Z');
