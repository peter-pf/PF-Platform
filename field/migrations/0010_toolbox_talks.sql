-- Migration 0010: toolbox talk records (OSHA-style safety meeting sign-in sheets).
-- Requested by Derek Franke (owner), 2026-10-28.
--
-- SECURITY NOTES:
--   - id is generated server-side (crypto.randomUUID()), never accepted from the client.
--   - created_by is ALWAYS the session uid, never from client input.
--   - All free-text fields (key_points, hazards, questions, actions, attendee names)
--     are length-capped server-side and HTML-escaped client-side via window.esc.
--   - This migration is ADDITIVE ONLY. No existing tables are modified.

CREATE TABLE IF NOT EXISTS toolbox_talks (
  id              TEXT    PRIMARY KEY,
  project_id      TEXT    NOT NULL DEFAULT '',
  project_name    TEXT    NOT NULL DEFAULT '',
  talk_date       TEXT    NOT NULL DEFAULT '',   -- ISO YYYY-MM-DD
  talk_time       TEXT    NOT NULL DEFAULT '',   -- HH:MM (24h, local)
  location        TEXT    NOT NULL DEFAULT '',
  presenter       TEXT    NOT NULL DEFAULT '',
  topic           TEXT    NOT NULL DEFAULT '',   -- topic key or 'Other'
  topic_other     TEXT    NOT NULL DEFAULT '',   -- free text when topic='Other'
  key_points      TEXT    NOT NULL DEFAULT '',
  hazards         TEXT    NOT NULL DEFAULT '',
  questions       TEXT    NOT NULL DEFAULT '',
  actions         TEXT    NOT NULL DEFAULT '',
  attendees       TEXT    NOT NULL DEFAULT '[]', -- JSON: [{name, acknowledged}]
  status          TEXT    NOT NULL DEFAULT 'draft', -- 'draft' | 'submitted'
  pdf_name        TEXT,
  pdf_web_url     TEXT,
  emailed_to      TEXT,   -- JSON array of recipient addresses
  sent_at         TEXT,
  created_by      TEXT    NOT NULL DEFAULT '',   -- session uid; server-set on create
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT,
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_tt_project_id  ON toolbox_talks (project_id);
CREATE INDEX IF NOT EXISTS idx_tt_status      ON toolbox_talks (status);
CREATE INDEX IF NOT EXISTS idx_tt_created_by  ON toolbox_talks (created_by);
CREATE INDEX IF NOT EXISTS idx_tt_talk_date   ON toolbox_talks (talk_date);
