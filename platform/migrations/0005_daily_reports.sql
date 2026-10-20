-- PF Platform — D1 migration 0005: daily_reports table
-- Fixes BLOCK-1: concurrent write data-loss on the shared KV list.
-- The old KV approach stores ALL daily reports as ONE JSON blob under
-- `daily_reports_v1`. Two simultaneous POST /api/daily-report calls both
-- do read-modify-write on that blob and the last writer wins, silently
-- dropping the other writer's report.
-- This migration adds a per-row D1 table so each report is an independent
-- INSERT OR REPLACE (no read-modify-write on the full list).
--
-- Apply (remote, BEFORE deploying new daily-report.js):
--   npx wrangler d1 execute pf-platform-db --remote \
--     --file=platform/migrations/0005_daily_reports.sql
--
-- Apply (local dev / testing):
--   npx wrangler d1 execute pf-platform-db --local \
--     --file=platform/migrations/0005_daily_reports.sql
--
-- After applying, run the backfill script to copy existing KV records into D1:
--   node platform/migrations/backfill-daily-reports.mjs
-- THEN deploy the updated platform + field functions.
--
-- SECURITY NOTE: `data` holds the full JSON blob of an operational daily
-- report (crew hours, narrative, production counts, safety). ZERO financials.
-- The column is opaque text to D1; all access is via authenticated Functions.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_reports (
  id             TEXT PRIMARY KEY,      -- dr_xxx app-generated id
  project_number TEXT NOT NULL DEFAULT '',  -- denormalized from rec.projectId (fast filter)
  report_date    TEXT NOT NULL DEFAULT '',  -- ISO date from rec.date (fast filter)
  status         TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'sent'
  data           TEXT NOT NULL,          -- full JSON blob of the report record
  created_at     TEXT NOT NULL,          -- ISO timestamp (from rec.createdAt)
  updated_at     TEXT NOT NULL,          -- ISO timestamp (updated on every upsert)
  updated_by     TEXT NOT NULL DEFAULT ''   -- session name/uid of last writer
);

CREATE INDEX IF NOT EXISTS idx_dr_project ON daily_reports (project_number);
CREATE INDEX IF NOT EXISTS idx_dr_date    ON daily_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_dr_status  ON daily_reports (status);
