# Field Companion — Daily Reports button (Phase 2)

**Status:** Live (2026-08-04)
**Area:** field_ops (crew-facing). No financials.

## What it is

The Field Companion (`platform/field-companion.html`) is the crew-facing field portal
page. Its quick-action buttons were previously bound to `demoNudge()` — a friendly
placeholder ("this module opens in the full field portal"). Phase 2 wires the
**Daily Reports** action (the "Start daily report" button + the Submit Daily Report
card, both `data-go="report"`) to open the real daily-report tool.

## How it works

- `handleGo(el)` reads `data-go`. For `"report"` it calls `goDaily()`, which does
  `window.location.assign("/#daily-reports")`.
- The main portal's `applyHashRoute()` sees `#daily-reports` on load and calls
  `showModule('daily-reports')` — the existing daily-report module (a
  `[data-module="daily-reports"]` nav item + `#mod-daily-reports` container both
  exist). Same-origin, session-authed, no auth bypass.
- Other quick-action buttons keep the honest `demoNudge()` placeholder until wired.

## Daily-report PDF output folder (re-point)

New daily-report PDFs save to the central library, not the test folder. The Worker
`functions/api/daily-report.js` resolves the destination via
`outputFolderId(env)` = `env.PF_DAILY_OUTPUT_FOLDER_ID`, falling back to the test
folder id only when the env var is unset.

- **Production env var (set 2026-08-04):**
  `PF_DAILY_OUTPUT_FOLDER_ID = 016ISVH63XLIL3FA5QGJFIOS3C5BPRE5N3`
  = SharePoint `05 - Field Operations / Daily Reports` (verified via Graph:
  folder under `/05 - Field Operations`).
- Was the test folder `016ISVH6546BCGQXTIBFFKDG4HC7AZI27B`
  (`/TEST - Write-Back Dev / Daily Reports Output (TEST)`).
- CF Pages env vars bind at deploy time, so the re-point required a deploy AFTER the
  PATCH to take effect in the live runtime.

## Files

| File | Role |
|------|------|
| `platform/field-companion.html` | Daily Reports button -> `/#daily-reports` (goDaily/handleGo) |
| `platform/functions/api/daily-report.js` | `outputFolderId(env)` honors `PF_DAILY_OUTPUT_FOLDER_ID` |

## Requires a human check (auth-gated, cannot self-test from the box)

- Click the Field Companion **Daily Reports** button -> the daily-report form opens.
- Submit a daily report -> the PDF lands in `05 - Field Operations / Daily Reports`.
