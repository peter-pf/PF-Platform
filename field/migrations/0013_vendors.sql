-- Migration 0013: vendor / parts-supplier directory tables.
-- Requested by Derek Franke (owner), 2026-11-14.
--
-- SECURITY NOTES:
--   - id is generated server-side (crypto.randomUUID()), never accepted from the client.
--   - created_by / updated_by are set from session.name (server-side), never client input.
--   - All free-text fields are length-capped and HTML-escaped client-side via
--     window.esc before any innerHTML render.
--   - DELETE of a section cascades to its items via the application layer (the
--     API issues two parameterized deletes in a batch).
--   - This migration is ADDITIVE ONLY.  No existing tables are modified.

CREATE TABLE IF NOT EXISTS vendors_sections (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vendors_items (
  id          TEXT    PRIMARY KEY,
  section_id  TEXT    NOT NULL,                 -- FK to vendors_sections.id
  company     TEXT    NOT NULL,                 -- required; display name
  category    TEXT    NOT NULL DEFAULT '',      -- what they supply
  contact     TEXT    NOT NULL DEFAULT '',      -- contact person name
  phone       TEXT    NOT NULL DEFAULT '',      -- tap-to-call
  address     TEXT    NOT NULL DEFAULT '',      -- tap-to-maps
  website     TEXT    NOT NULL DEFAULT '',      -- tap-to-open
  account_num TEXT    NOT NULL DEFAULT '',      -- PF account / customer number
  notes       TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT    NOT NULL DEFAULT '',      -- session name; server-set on create
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT,
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_vendors_items_section ON vendors_items (section_id);
CREATE INDEX IF NOT EXISTS idx_vendors_sections_sort ON vendors_sections (sort_order);
