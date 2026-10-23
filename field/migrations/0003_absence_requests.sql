-- Migration 0003: absence request tables for the Time Off feature.
-- Requested by Derek Franke (owner), 2026-10-23.
--
-- SECURITY NOTES:
--   - uid is ALWAYS taken from the session (server-side), never from client input.
--   - employee_allocations: one row per (uid, year). Absence of a row means
--     "allocation not set". Portal shows "Allocation not set, ask an owner."
--   - absence_requests: status flow is pending -> approved | denied | cancelled.
--     Only the requesting employee can cancel their own pending request (server enforces
--     uid match). Only admin/partner roles can approve or deny (server enforces role).
--   - All free-text (note, denial_reason) is length-capped server-side and
--     HTML-escaped client-side via window.esc before any innerHTML render.
--   - This migration is ADDITIVE ONLY. No existing tables are modified.

CREATE TABLE IF NOT EXISTS employee_allocations (
  uid            TEXT    NOT NULL,
  year           INTEGER NOT NULL,
  allocated_days REAL    NOT NULL DEFAULT 0,
  created_by     TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by     TEXT,
  updated_at     TEXT,
  PRIMARY KEY (uid, year)
);

CREATE TABLE IF NOT EXISTS absence_requests (
  id               TEXT    PRIMARY KEY,
  uid              TEXT    NOT NULL,           -- employee uid; always from session, never client
  name             TEXT    NOT NULL DEFAULT '',
  start_date       TEXT    NOT NULL,           -- ISO date YYYY-MM-DD
  end_date         TEXT    NOT NULL,           -- ISO date YYYY-MM-DD
  half_day         INTEGER NOT NULL DEFAULT 0, -- 1 = half-day request (single day, 0.5 days)
  type             TEXT    NOT NULL DEFAULT 'Vacation', -- Vacation|Sick|Personal|Other
  note             TEXT    NOT NULL DEFAULT '',
  day_count        REAL    NOT NULL DEFAULT 1,
  status           TEXT    NOT NULL DEFAULT 'pending', -- pending|approved|denied|cancelled
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT,
  approved_by      TEXT,
  approved_by_name TEXT,
  approved_at      TEXT,
  denied_by        TEXT,
  denied_by_name   TEXT,
  denied_at        TEXT,
  denial_reason    TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_absence_uid    ON absence_requests (uid);
CREATE INDEX IF NOT EXISTS idx_absence_status ON absence_requests (status);
CREATE INDEX IF NOT EXISTS idx_absence_dates  ON absence_requests (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_alloc_uid_year ON employee_allocations (uid, year);
