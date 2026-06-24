# BD CRM — Companies & Contacts (with interactions log)

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Brad's build-out section 2 "Companies & Contacts".

The BD CRM backbone: a Companies list, a company detail view with its Contacts,
and a running interactions log on both companies and contacts. BD users can add a
company, add contacts under it, and append interactions. Built in two phases,
both shipped in one slice: Phase A read views, Phase B KV write-back.

## Data model

### Read-only base (ingested)
- Source: PF BD Master workbook, "Organizations" + "Contacts" tabs. The field
  list for each record is ROW 4 of each tab (we use those headers verbatim, no
  invented fields).
- Builder: `platform/sync/build-bd-records.py` -> `platform/data/bd-records.js`:
  ```
  window.PF_BD_RECORDS = {
    companies: [ { id, fields:{...row4...}, contacts:[ {id, fields:{...row4...}} ] } ],
    unlinkedContacts: [ {id, fields, orgName} ],   // Organization matched no company
    companyFields: [ ...Organizations row 4... ],  // 16 fields
    contactFields: [ ...Contacts row 4... ],       // 14 fields
    generated, source, sourceTabs
  }
  ```
- Linking: a contact's "Organization" field is matched (normalized) to a
  company's "Name". Unmatched contacts are reported in `unlinkedContacts`, never
  dropped.
- Stable ids: companies `co_<sha1(name)>`, contacts `ct_<sha1(name||org)>`. The
  ingest base ids never collide with overlay ids (below).
- Current ingest: 263 companies, 399 contacts (375 linked, 24 unlinked). All
  spec'd tabs + fields present (no omissions).

### Write-back overlay (KV)
Manual additions and interactions live ONLY in KV, merged on top of the base in
the UI. A re-sync of `bd-records.js` never erases them.

KV binding: `env.PF_SCHEDULE` (shared namespace, BD-distinct keys).

| Purpose | KV key | Shape |
|---|---|---|
| Manual companies + contacts | `bd_overlay_v1` | `{ companies:[{id:ov_co_*, fields, addedBy, addedAt}], contacts:[{id:ov_ct_*, companyId, fields, addedBy, addedAt}], meta:{updated} }` |
| Interactions per entity | `bd_interactions__<entityType>__<entityId>` | `{ items:[{id, date, who, channel, note, addedBy, addedAt}], meta:{updated} }` |

- `entityType` = `company` | `contact`. `entityId` = the bd-records.js id (base
  `co_*`/`ct_*` OR overlay `ov_co_*`/`ov_ct_*`).
- Overlay record ids are server-issued (`ov_co_*`, `ov_ct_*`) so they never
  collide with ingested ids. Interactions key off whichever id, so added records
  get logs too.

## Endpoints (Cloudflare Pages Functions)

All three are gated `business_dev` (admin/partner/business_dev allowed, field_ops
BLOCKED) by BOTH the middleware (`areaForPath` classifies the path) AND an
in-Function `requireArea(session, 'business_dev')` (defense in depth, fail
closed). Write hardening mirrors `api/pipeline-state.js`: body size cap, strict
JSON parse -> 400, schema rebuilt field by field with type coercion + length
caps, field allow-list on record adds, angle-bracket stripping, no eval, private
no-store responses.

| Method + path | Action |
|---|---|
| `GET /api/bd-interaction?entityType=&entityId=` | read one entity's interaction log |
| `POST /api/bd-interaction` | append `{entityType, entityId, date, who, channel, note}` |
| `GET /api/bd-record` | read the manual-additions overlay |
| `POST /api/bd-record` | add `{kind:'company', fields}` or `{kind:'contact', companyId, fields}` |

Channel is validated against an allow-list (call, email, meeting, text, site
visit, linkedin, event, voicemail, other). Caps: interaction note 2000 chars,
1000 interactions per entity; overlay 5000 records, 40 fields per record, 500
chars per field.

## UI module

- Module `mod-bd-companies` (title "Companies & Contacts"), under the Business
  Development nav section.
- Master-detail: a searchable company list (search matches company OR contact
  name) and a detail view showing the company fields, an "Add company" form, its
  contacts (each with fields + their own interaction log + "Add interaction"
  form), an "Add contact" form, and the company interaction log + form.
- The UI merges base + overlay and renders ALL data through `window.esc`
  (XSS-safe). Added records show an "added" badge.

## Gating summary

- `/data/bd-records.js` -> `business_dev` in `functions/lib/auth.js`
  DATA_FILE_AREAS.
- `/api/bd-record` and `/api/bd-interaction` -> `business_dev` in
  `areaForPath()` (+ in-Function requireArea).
- field_ops sees ZERO BD CRM data: the feed and both endpoints return 403 for a
  field_ops session, proven in `migrations/test-rbac.mjs` and the headless
  write-back test.

## Verification (2026-06-24)
- Builder STDOUT: 263 companies, 399 contacts (375 linked / 24 unlinked), all
  fields present, no omissions.
- `node migrations/test-rbac.mjs`: 424 pass / 0 fail (added bd-records.js +
  both endpoints -> business_dev; field_ops denied; source-level requireArea
  checks; feed-shape sanity).
- Headless write-back test (Map-backed KV + session in context.data): BD
  persists company/contact/interaction and reads them back; field_ops + no
  session POST/GET => 403; denied writes do not mutate KV; validation rejects
  missing note / bad entityType / missing Name; XSS angle brackets stripped.
  15 pass / 0 fail.
- Deploy OK; gate returns 401 with no creds on /, /data/bd-records.js,
  /api/bd-record, /api/bd-interaction (GET + POST).

## Not exercised live
- A real authenticated BD POST against the deployed endpoint was not run because
  this environment cannot mint a live `pf_session` (the per-user D1 cutover is
  still blocked on Brad's token; the deployment is on the shared Basic-Auth
  gate). The handler logic, area enforcement, KV persistence, validation, and
  the field_ops/unauth 403 path are all proven headlessly against the REAL
  Function code; the deployed gate is proven to 401 unauth.
