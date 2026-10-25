-- Migration 0009: daily equipment inspection records.
-- Requested by Derek Franke (owner), 2026-10-25.
--
-- SECURITY NOTES:
--   - id is generated server-side (crypto.randomUUID()), never accepted from the client.
--   - created_by is ALWAYS the session uid, never from client input.
--   - All free-text fields (deficiencies_notes, item notes) are length-capped server-side
--     and HTML-escaped client-side via window.esc before any innerHTML render.
--   - This migration is ADDITIVE ONLY. No existing tables are modified.

CREATE TABLE IF NOT EXISTS equip_inspections (
  id                TEXT    PRIMARY KEY,
  machine_type      TEXT    NOT NULL,   -- 'skid_steer' | 'predrill_excavator' | 'vibro_excavator'
  serial_number     TEXT    NOT NULL DEFAULT '',
  inspection_date   TEXT    NOT NULL DEFAULT '',   -- ISO YYYY-MM-DD
  status            TEXT    NOT NULL DEFAULT 'draft', -- 'draft' | 'submitted'
  data              TEXT    NOT NULL,   -- full JSON blob
  created_by        TEXT    NOT NULL DEFAULT '',   -- session uid; server-set on create
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT,
  updated_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ei_machine_type    ON equip_inspections (machine_type);
CREATE INDEX IF NOT EXISTS idx_ei_status          ON equip_inspections (status);
CREATE INDEX IF NOT EXISTS idx_ei_created_by      ON equip_inspections (created_by);
CREATE INDEX IF NOT EXISTS idx_ei_inspection_date ON equip_inspections (inspection_date);
