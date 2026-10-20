# PF Field Portal — Test Evidence
Branch: field-portal-20261020  Commit: (see git log)
Date: 2026-10-20

## BLOCK-1: D1 daily-report store

### node --check (syntax)

All modified JS files pass `node --check` with zero errors:

```
node --check platform/functions/api/daily-report.js     → OK
node --check field/functions/api/daily-report.js        → OK
node --check platform/functions/lib/daily-report-store.js → OK
node --check field/functions/lib/daily-report-store.js  → OK
node --check platform/functions/api/timesheets.js       → OK
node --check field/functions/api/field-projects.js      → OK
node --check field/functions/lib/fo-projects-data.js    → OK
```

### Unit tests (7/7 PASS)

Run: `node test-store-concurrent.mjs` (in scratchpad; canonical test file at
platform/migrations/test-store-concurrent.mjs)

```
=== daily-report-store unit tests ===

  [PASS] upsert + loadReportById round-trip
  [PASS] concurrent upserts with different IDs — neither is lost
    KV final records: [dr_kvB] — one dropped (bug confirmed)
  [PASS] OLD KV read-modify-write loses a concurrent record (demonstrates the bug being fixed)
  [PASS] upsert idempotency — same id replaces existing record
  [PASS] countReports returns correct count
  [PASS] KV fallback when D1 unavailable
  [PASS] field-projects data contains no financial keys

=== Results: 7 passed, 0 failed ===
```

Key test results:
- Test 2 (concurrent upserts): Both recA and recB survive with `Promise.all([upsertReport(env,recA), upsertReport(env,recB)])`. Neither is dropped.
- Test 3 (demonstrates the old KV bug): The old read-modify-write approach drops dr_kvA; only dr_kvB survives — proving the bug being fixed.
- Test 7 (financial key check): Every entry in FO_PROJECTS has exactly 2 keys (number, name) with no financial field names.

## BLOCK-2: field-projects endpoint

### node --check

```
node --check field/functions/api/field-projects.js  → OK
node --check field/functions/lib/fo-projects-data.js → OK
```

### Financial key audit (via unit test 7)

FO_PROJECTS array verified: each entry has exactly `{number, name}`. No keys
matching: gc, gcName, contract, contractValue, bid, price, revenue, margin,
cost, invoice, rate, dollar, or $. Zero financial fields.

### Source confirmation

`field/functions/lib/fo-projects-data.js` is derived from
`platform/data/fo-projects-field.js` (SEC-09 field-safe derivative). Only
`number` and `name` are extracted; city_state, discipline, record, and
poet_scope are dropped.

## wrangler pages dev compilation

Run from `field/` directory:

```
$ OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages dev . \
    --port 8993 --compatibility-date 2025-01-01

✨ Compiled Worker successfully
Your Worker has access to the following bindings:
  env.PF_SCHEDULE (6c8bd3b9bf3a464ca8d1a5d939231858)  KV Namespace  local
  env.DB (pf-platform-db)                              D1 Database   local
  env.CF_PAGES ("1")                                   Environment Variable  local
  env.CF_PAGES_BRANCH ("field-portal-20261020")        ...
```

The Functions bundle compiled correctly. D1 (env.DB) and KV (env.PF_SCHEDULE)
bindings are wired.

### Runtime constraint

The workerd binary (wrangler 4.86) requires spawning OS-level threads for its
multi-threaded runtime. This box has a ~300 pid/thread cap (documented in
solved-box-gotchas.md). The workerd process exceeds this cap and crashes before
accepting requests. This is a local-dev infrastructure constraint only; the
same binary runs normally on Cloudflare's edge infrastructure.

As a result, the `wrangler pages dev` curl checks (401 for unauthenticated
requests) are confirmed via code-path analysis rather than live curl output:

**GET / -> 302 to /login.html** (or 500 misconfigured if no PF_TOKEN_SECRET):
- _middleware.js line 222: `if (request.method === 'GET' && accept.includes('text/html'))` → 302
  to `/login.html?next=...`

**GET /api/daily-report -> 401 unauthenticated**:
- _middleware.js: no session cookie, no Basic auth → falls through to the
  unauthenticated path at line 237: `return new Response('Authentication required', { status: 401 ... })`

**GET /api/field-projects -> 401 unauthenticated**:
- Same middleware path as above. Additionally, areaForPath('/api/field-projects')
  = 'field_ops' (added to field/functions/lib/auth.js), and requireArea is
  called inside the handler — defense in depth.

The auth gate code is identical to the live platform portal (same functions/lib/auth.js)
which has been live and production-verified since 2026-06-18. It produces
verified 401 responses on the live platform (curl evidence in solved-deploy-*-20260904.md).

## Files changed

### New files
- `platform/migrations/0005_daily_reports.sql` — D1 table migration
- `platform/migrations/backfill-daily-reports.mjs` — KV -> D1 idempotent backfill
- `platform/functions/lib/daily-report-store.js` — shared store lib (primary)
- `field/functions/lib/daily-report-store.js` — identical copy for field portal
- `field/functions/api/field-projects.js` — GET /api/field-projects endpoint
- `field/functions/lib/fo-projects-data.js` — bundled field-safe project list

### Modified files
- `platform/functions/api/daily-report.js` — uses store lib (D1 primary + KV fallback)
- `field/functions/api/daily-report.js` — uses store lib (identical change)
- `platform/functions/api/timesheets.js` — reads from store lib (D1 primary)
- `field/functions/lib/auth.js` — areaForPath: /api/field-projects -> field_ops
- `platform/functions/lib/auth.js` — areaForPath: /api/field-projects -> field_ops
- `field/index.html` — loadProjects() calls /api/field-projects instead of window.PF_FO_PROJECTS

## Recommended deploy order

1. **Apply D1 migration** (remote, NO downtime):
   ```
   source /home/aiciv/.env
   npx wrangler d1 execute pf-platform-db --remote \
     --file=platform/migrations/0005_daily_reports.sql
   ```
   This adds the `daily_reports` table alongside the existing `users`/`audit_log`
   tables. Existing data is unaffected. Both portals continue reading from KV
   until the Functions are deployed (the store lib falls back to KV if D1
   is available but the table query throws).

2. **Run backfill** (copies existing KV records into D1):
   ```
   source /home/aiciv/.env
   node platform/migrations/backfill-daily-reports.mjs
   ```
   Idempotent (INSERT OR IGNORE). Verify printed summary shows 0 errors before
   proceeding. This ensures timesheets/history are not blank after the deploy.

3. **Deploy main portal** (pf-platform, branch field-portal-20261020):
   ```
   cd platform && source /home/aiciv/.env
   OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages deploy . \
     --project-name pf-platform --branch field-portal-20261020
   ```
   Main portal now reads + writes daily reports via D1 (with KV fallback).

4. **Deploy field portal** (pf-field, branch field-portal-20261020):
   ```
   cd field && source /home/aiciv/.env
   OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages deploy . \
     --project-name pf-field --branch field-portal-20261020
   ```
   Field portal gains:
   - D1 daily report store (same fix, no lost writes)
   - /api/field-projects endpoint (project dropdown works)

5. **Verify post-deploy**:
   - curl https://pf-platform.pages.dev/api/daily-report (no auth) -> 401
   - curl https://pf-field.pages.dev/api/daily-report (no auth) -> 401
   - curl https://pf-field.pages.dev/api/field-projects (no auth) -> 401
   - Authenticated GET /api/field-projects -> 200 with {ok:true, projects:[...]}
   - Check field portal project dropdown populates with project list
   - File a test daily report from each portal concurrently (confirm both land in D1)
