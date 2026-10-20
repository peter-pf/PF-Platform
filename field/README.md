# PF Field Portal (pf-field)

Mobile-first Cloudflare Pages project for PF field crew. Phase 1 scope: Daily Field Report only.

Requested by Derek (owner), 2026-10-20.

## What this is

A standalone portal at a dedicated Cloudflare Pages project (`pf-field`). It shares the same D1 database (auth/RBAC) and KV namespace (report data) as the main `pf-platform` portal, so daily reports filed here are immediately visible in the main portal's history.

No financial data. No office modules. No GC/$ columns. Field crew only.

## Allowed roles

`admin`, `partner`, `business_dev`, `field_ops` — same RBAC as the main portal's `field_ops` area. Auth is fail-closed: a missing `PF_TOKEN_SECRET` returns 5xx, never opens.

## Files

```
field/
  index.html             Mobile-first SPA: auth check + daily report form
  login.html             Sign-in page (same /api/login flow as main portal)
  denied.html            RBAC denial page
  reset-password.html    Must-reset flow (first login with temp password)
  wrangler.toml          CF Pages config (pf-field project, same KV + D1)
  functions/
    _middleware.js        Session gate, RBAC, preview host bypass for pf-field.pages.dev
    api/
      login.js            POST: PBKDF2 verify, rate-limit, mint session
      logout.js           GET/POST: clear session cookie
      me.js               GET: {name, role} for the current session
      reset-password.js   POST: set new password after must_reset
      daily-report.js     POST: create/update/submit daily report (PDF+email+SP)
      field-lists.js      GET/POST: owned equipment, personnel, foremen lists
      field-upload.js     POST: upload hand logs / GUHM data to SharePoint
    lib/
      auth.js             mintSession, verifySession, hashPassword, areaForPath, requireArea
      graph.js            getGraphToken, graphConfigured, GRAPH base URL
      daily-report-doc.js renderDailyReportPdf, sendReportEmail, uploadReportPdf
      ot-engine.mjs       OT split: reg=min(h,8), OT=max(h-8,0); weekly 40h cap
      pdf.js              pdf-lib wrapper
      pf-logo.js          PF logo bytes for PDF header
      eurostile-font.js   Eurostile font bytes for PDF
```

## Email recipients (IMPORTANT — test vs production)

`daily-report.js` defaults to `TEST_RECIPIENTS` in this project so a new deploy does not immediately send live reports to the three partners. The env var `DAILY_REPORT_RECIPIENTS` (comma-separated) overrides without a redeploy.

When Derek approves go-live, either:
- Set `DAILY_REPORT_RECIPIENTS` in the CF Pages dashboard (Settings > Environment variables), or
- Change `ACTIVE_RECIPIENTS = TEST_RECIPIENTS` to `ACTIVE_RECIPIENTS = PROD_RECIPIENTS` and redeploy.

The main `pf-platform` portal already runs with `PROD_RECIPIENTS`. This is intentionally different.

## Project dropdown

The daily report project dropdown reads `window.PF_FO_PROJECTS` (field-safe, no $/GC) or falls back to `window.PF_AWARDED`. The field portal does not yet serve a projects data file — the dropdown will be empty until one of these is in scope. Options to wire it:

1. Add a `/api/projects` endpoint that returns the same field-safe list the main portal uses.
2. Serve a static `pf-fo-projects.js` from the build pipeline.

This is Phase 2 work. The form still works — users can type a free-form project reference in the meantime, or the dropdown can be wired before Derek goes live.

## Secrets to set on pf-field project

Via CF dashboard (Settings > Functions > Environment variables) or:

```
npx wrangler pages secret put PF_TOKEN_SECRET --project-name pf-field
npx wrangler pages secret put AZURE_CLIENT_ID   --project-name pf-field
npx wrangler pages secret put AZURE_CLIENT_SECRET --project-name pf-field
npx wrangler pages secret put AZURE_TENANT_ID   --project-name pf-field
npx wrangler pages secret put SP_DRIVE_ID       --project-name pf-field
npx wrangler pages secret put PF_AUTH_USER      --project-name pf-field
npx wrangler pages secret put PF_AUTH_PASS      --project-name pf-field
```

KV and D1 bindings must also be set in the CF Pages dashboard (Settings > Functions > Bindings) matching `wrangler.toml`.

## Deploy (preview only — do not set custom domain yet)

```bash
cd /home/aiciv/PF-Platform/field
source /home/aiciv/.env
OMP_NUM_THREADS=1 GOMAXPROCS=1 npx wrangler pages deploy . \
  --project-name pf-field \
  --branch field-portal-20261020
```

This creates a preview URL (e.g. `https://field-portal-20261020.pf-field.pages.dev`). Secrets must be set before the preview URL is shared with field crew.

Production deploy and custom domain are gated on pf-devops-verifier review.

## Auth gate test (after preview deploy)

```bash
# Should redirect to /login.html (302) or return 401 for an API call:
curl -sI https://<preview>.pf-field.pages.dev/
curl -sI https://<preview>.pf-field.pages.dev/api/me
```

## Project list refresh

`field/functions/lib/fo-projects-data.js` is a bundled snapshot generated from
`platform/data/fo-projects-field.js`. Whenever `platform/data/fo-projects-field.js`
changes (new awarded jobs, scope updates), the field portal snapshot must be
regenerated and redeployed:

1. Run `python3 platform/scripts/build-fo-projects-field.py` — rewrites
   `field/functions/lib/fo-projects-data.js` from the platform source.
2. Commit the updated `fo-projects-data.js` on the working branch.
3. Redeploy `pf-field` (same deploy command as in the Deploy section above).

This is a known gap — the snapshot can drift if regeneration is skipped.
Tracked as follow-on work to wire a live `/api/projects` endpoint instead.

## What is NOT in Phase 1

- Timesheets / OT summary view
- Project dropdown data feed
- Custom domain
- Production email recipients
- pf-devops-verifier sign-off (required before production)
