#!/usr/bin/env node
// Backfill: copy existing KV daily_reports_v1 records into D1 daily_reports.
// Run ONCE after applying migration 0005, before deploying the new Functions.
// Idempotent: uses INSERT OR IGNORE so re-runs are safe (existing rows untouched).
//
// Usage (requires CLOUDFLARE_API_TOKEN and CF_ACCOUNT_ID in environment or .env):
//   source /home/aiciv/.env
//   node platform/migrations/backfill-daily-reports.mjs
//
// What it does:
//   1. Reads the KV key daily_reports_v1 from the PF_SCHEDULE namespace via
//      the Cloudflare REST API.
//   2. Parses the JSON list of report records.
//   3. Inserts each record into D1 daily_reports using INSERT OR IGNORE (by id),
//      so records already migrated (e.g. from a prior run) are skipped.
//   4. Prints a per-record result summary.
//
// Exit codes: 0 = success, 1 = fatal error.

import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Load .env if present.
try {
  const { config } = await import('dotenv');
  config({ path: '/home/aiciv/.env' });
} catch { /* dotenv not available; rely on environment variables */ }

const ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const API_TOKEN    = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE = process.env.PF_SCHEDULE_KV_ID || '6c8bd3b9bf3a464ca8d1a5d939231858';
const DB_ID        = process.env.PF_D1_DB_ID        || 'cf66893b-9b5c-4731-9046-880e25728a4e';
const KV_KEY       = 'daily_reports_v1';

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('FATAL: CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.');
  console.error('Run: source /home/aiciv/.env');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

async function cfFetch(path, opts = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await resp.json();
  if (!body.success) {
    throw new Error(`CF API error on ${path}: ${JSON.stringify(body.errors)}`);
  }
  return body;
}

// Read the raw KV value.
async function readKV() {
  // KV Values API returns the raw value (not JSON-wrapped).
  const resp = await fetch(
    `${BASE}/storage/kv/namespaces/${KV_NAMESPACE}/values/${encodeURIComponent(KV_KEY)}`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  );
  if (resp.status === 404) {
    console.log('KV key daily_reports_v1 not found — nothing to backfill.');
    return null;
  }
  if (!resp.ok) {
    throw new Error(`KV read failed: HTTP ${resp.status}`);
  }
  return resp.text();
}

// Execute a D1 SQL statement via the REST API.
async function d1Execute(sql, params = []) {
  const body = await cfFetch(`/d1/database/${DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params }),
  });
  return body.result;
}

// Main backfill logic.
async function main() {
  console.log('=== PF Daily Reports KV -> D1 Backfill ===');
  console.log(`KV namespace: ${KV_NAMESPACE}`);
  console.log(`D1 database:  ${DB_ID}`);
  console.log('');

  // 1. Read KV.
  const raw = await readKV();
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('FATAL: KV value is not valid JSON:', e.message);
    process.exit(1);
  }

  const reports = Array.isArray(parsed && parsed.reports) ? parsed.reports : [];
  console.log(`Found ${reports.length} report(s) in KV.`);
  if (!reports.length) {
    console.log('Nothing to backfill.');
    return;
  }

  // 2. Insert each record idempotently.
  let inserted = 0, skipped = 0, errors = 0;
  for (const rec of reports) {
    if (!rec || !rec.id) { skipped++; continue; }
    const id           = rec.id;
    const projectNum   = String(rec.projectId || '');
    const reportDate   = String(rec.date || '');
    const status       = String(rec.status || 'draft');
    const data         = JSON.stringify(rec);
    const createdAt    = String(rec.createdAt || new Date().toISOString());
    const updatedAt    = String(rec.updatedAt || createdAt);
    const updatedBy    = String(rec.updatedBy || rec.createdBy || '');

    try {
      // INSERT OR IGNORE: if the row already exists (previous backfill run), skip it.
      await d1Execute(
        `INSERT OR IGNORE INTO daily_reports
           (id, project_number, report_date, status, data, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectNum, reportDate, status, data, createdAt, updatedAt, updatedBy]
      );
      console.log(`  [OK]  ${id} / ${reportDate} / ${projectNum}`);
      inserted++;
    } catch (e) {
      console.error(`  [ERR] ${id}: ${e.message}`);
      errors++;
    }
  }

  console.log('');
  console.log(`=== Backfill complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already present / blank id): ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  if (errors > 0) {
    console.error('Some records failed. Review errors above and re-run.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
