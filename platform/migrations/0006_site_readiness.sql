-- PF Platform -- D1 migration 0006: site_readiness table
-- Supports the Site Readiness Form (field portal, Derek 2026-10-20).
-- One row per inspection record. Mirrors the daily_reports pattern exactly:
-- per-row INSERT OR REPLACE removes the KV read-modify-write lost-write risk.
--
-- Apply (remote, BEFORE deploying new site-readiness.js):
--   npx wrangler d1 execute pf-platform-db --remote \
--     --file=platform/migrations/0006_site_readiness.sql
--
-- Apply (local dev / testing):
--   npx wrangler d1 execute pf-platform-db --local \
--     --file=platform/migrations/0006_site_readiness.sql
--
-- Do NOT run this migration until pf-devops-verifier clears it.
--
-- SECURITY NOTE: `data` holds the full JSON blob of a site readiness
-- inspection record (checklist answers, notes, attachments refs). Zero
-- financials. All access is via authenticated Workers Functions.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_readiness (
  id               TEXT PRIMARY KEY,      -- sr_xxx app-generated id
  project_number   TEXT NOT NULL DEFAULT '',  -- denormalized from rec.projectId
  inspection_date  TEXT NOT NULL DEFAULT '',  -- ISO date from rec.date
  result           TEXT NOT NULL DEFAULT '',  -- 'READY' | 'NOT READY' | 'draft'
  status           TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'sent'
  data             TEXT NOT NULL,          -- full JSON blob of the record
  created_at       TEXT NOT NULL,          -- ISO timestamp
  updated_at       TEXT NOT NULL,          -- ISO timestamp, refreshed on every upsert
  updated_by       TEXT NOT NULL DEFAULT ''   -- session name/uid of last writer
);

CREATE INDEX IF NOT EXISTS idx_sr_project ON site_readiness (project_number);
CREATE INDEX IF NOT EXISTS idx_sr_date    ON site_readiness (inspection_date);
CREATE INDEX IF NOT EXISTS idx_sr_status  ON site_readiness (status);
CREATE INDEX IF NOT EXISTS idx_sr_result  ON site_readiness (result);
