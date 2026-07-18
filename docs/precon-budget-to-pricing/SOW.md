# SOW — Budget→Actively move + detail wrap + Actively Bidding rename

**Branch:** `website-build-20260609`
**Files touched:** `platform/index.html`, `platform/functions/api/pipeline-state.js`,
`docs/precon-budget-to-pricing/`
**Deploy:** `./deploy.sh` (production, `--branch main`)

---

## Changes

### Request 1 — Budget Pricing → Actively Bidding move (new `pricing` status)
- `functions/api/pipeline-state.js`: `VALID_STATUS` += `pricing: 1` (privileged auth unchanged;
  not a dead status → deadSet=false).
- `index.html`:
  - `calEffectiveBucket` + `effBucketFull`: `st==='pricing'` → `'actively_bidding'`.
  - renderMount: new explicit `actively_bidding` list branch = keep non-relocated auto rows
    + `pullRelocated('pricing')`; generic stage else-branch drops `pricing`; `budget_pricing`
    already excludes a `pricing`-overridden bid.
  - Budget Pricing DnD bar: new `data-act="pricing"` zone "Actively Bidding"; per-row button
    `pfResolveBid(k,'pricing')` "Actively Bidding"; `hlOpts.actionWidth='232px'` (3 buttons).
  - `wireDnd` drop whitelist accepts `pricing`.

### Request 2 — detail dropdown wrap
- `.pf-hl-field .pf-hl-value` + `.pf-hl-label`: `white-space:normal; overflow-wrap:break-word;
  word-break:break-word; min-width:0`. Fixes long Address colliding with Site Size (grid child
  `min-width:auto` blowout).

### Request 3 — rename user-facing "Actively Pricing" → "Actively Bidding"
- Nav tabs (AP+HP), module title map, `BUCKET_LABEL.actively_bidding`, manual-bid confirm +
  add button, reactivate empty-states, due-soon meta, funnel label, and Request-1's new
  zone/button. Internal ids/keys/classes/status value unchanged; remaining "Actively Pricing"
  strings are code comments only.

## Verification (evidence)
- `node docs/precon-budget-to-pricing/move-and-detail.test.js` → **24 passed, 0 failed**
  (real jsdom render: relocation move works, detail wraps, rename shows in nav + heading,
  API whitelist + internal identifiers confirmed).
- Regressions: `runtime-sort` **20/20**, `header-wrap` **17/17**, `name-width` **14/14**.
- `node --check`: `pipeline-state.js` clean, index main script block clean.
- Deploy: `Uploading Functions bundle` → `Deployment complete!` → canonical `env=production`
  → `auth gate on root: HTTP 401`.

## Definition of Done
- [x] `pricing` status: API whitelist + calEffectiveBucket/effBucketFull + renderMount relocation.
- [x] Budget Pricing "Actively Bidding" DnD zone + per-row button (touch), 232px action col.
- [x] Move works for section-budget AND budget-override bids; leaves Budget, enters Actively Bidding.
- [x] Detail values wrap (min-width:0 + white-space:normal + break); no field collision.
- [x] User-facing "Actively Pricing" → "Actively Bidding" (nav, titles, heading, strings, new zone).
- [x] Internal ids/bucket key/status value/classes unchanged.
- [x] jsdom 24/24; regressions 20/17/14; syntax clean.
- [x] Deployed to production, 401 confirmed.
- [x] Committed + pushed to `website-build-20260609`.
