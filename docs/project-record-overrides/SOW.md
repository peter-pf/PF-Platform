# SOW — Project Record Per-Section Manual Overrides

## Delivered
### Backend
- `platform/functions/api/project-override.js` (NEW) — KV-backed override store,
  mirroring the daily-report.js pattern.
  - `GET ?num=<project_number>` → `{ ok, num, sections, _meta }` (empty `{}` if
    none). Benign empty read when KV unbound (no overrides exist).
  - `POST { num, section, fields }` → per-field merge into `sections[section]`,
    stamps `_meta.updatedBy/updatedAt` from the session, returns the full saved
    object. FAIL CLOSED: KV unbound → 503 (never a fake success).
  - Role-gated `requireArea(session,'financials')` on GET+POST (office only).
- `platform/functions/lib/auth.js` — `areaForPath` maps `/api/project-override`
  → `financials` (admin/partner/business_dev; field_ops/unauth 403).

### Frontend (platform/index.html, office project-record IIFE only)
- `field()` consults the active section's override map; an override WINS and tags
  the field edited (✎). Each field carries `data-pr-label` for the editor's DOM scan.
- `card()` gained a `sectionKey`; when present + office role, injects an **Edit**
  button (right of header) and an "edited by / when" note when overrides exist.
- `ovExtras(sectionKey)` renders stored overrides for LIST-type sections
  (PF Team, Equipment) as their own editable fields.
- `openProjectRecord()` loads the project's overrides synchronously (fail-soft)
  BEFORE rendering, so the merge is in place on first paint.
- `resolveRecord()` synthesizes a blank editable record for new/awarded projects
  that have a PM overlay entry but no synced static record.
- Section editor: `pfEditSection` / `pfSaveSection` / `pfCancelSection`. Save
  POSTs to `/api/project-override`; on success adopts the server's authoritative
  override object and re-renders; on ANY failure shows an inline error and stays
  in edit mode (fail-closed). CSS for the Edit button + editor + edited marker.

## Out of Scope (unchanged)
- Field Operations project view (separate renderer at ~line 16xxx).
- Active Projects index, the synced source data files (data/project-records.js,
  data/project-record-poet.js) — overrides are a SEPARATE store; source is never
  edited in place.

## Verification
- `node --check` on the new API + auth.js: pass.
- RBAC suite `platform/migrations/test-rbac.mjs`: 776 pass, 2 fail (the 2 known
  pre-existing daily-report fails; zero new failures).
- Backend unit tests (mock KV/session): 13/13 — GET/POST/merge/empty-override/
  bad-section-400/bad-num-400/angle-strip/fail-closed-503/isolation.
- jsdom render-proof (`platform/portal_uploads/proj-override-verify/`): 17/17 —
  office sees Edit buttons (all 11), field_ops sees none, override merge wins,
  fail-closed save shows error + preserves edit mode, success re-renders merged,
  new project renders 11 editable sections.
