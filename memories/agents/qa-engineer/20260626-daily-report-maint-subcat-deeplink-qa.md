# QA: Daily Report weather/maintenance restructure + field-lists subcategories + hash deep-link

Branch: website-build-20260609. Files: platform/index.html, functions/api/daily-report.js, functions/api/field-lists.js

## Verdict: PASS WITH ONE LOW-SEV DEFECT

## Key findings
- DEFECT (low): applyHashRoute() guard checks only getElementById('mod-'+id), not a nav
  [data-module]. 3 containers have NO nav item: bd-dashboard, precon-dashboard,
  project-record. Deep-link #bd-dashboard etc passes guard -> showModule() line 3190
  document.querySelector('[data-module=...]').classList -> null.classList TypeError.
  try/catch swallows it BUT line 3189 already added .active to module-view => half-
  switched SPA state, module loader (in wrapper after origShowModule throw) never runs.
  Fix: in applyHashRoute also require document.querySelector('[data-module="'+id+'"]').

## Confirmed CORRECT (no defect)
- opts() (index.html:16204) injects current value if not in list (line 16208) =>
  subcategory self-heal works for stale saved values. Same for foreman/crew.
- Payload round-trip: collectBody keys {precipitation,temp,maintenance[{category,type,
  subcategory,item,hourAtFailure}]} EXACTLY match daily-report.js cleanMaintenance +
  precipitation/temp assembly.
- Backward compat: old weather string read-through (base.weather), old maint rows
  {category,item,hourAtFailure} -> type/subcategory default '' both server + list view +
  maintenance dashboard. No "undefined". preTxt has no dangling colon when item empty.
- field-lists POST: subcats path validates category in MAINTENANCE_CATEGORIES (400 bad),
  isPrivileged gate (403 field_ops/business_dev), seedMaintenanceSubcategories per cat [].
- Subcategory editor input handler mutates bag only (no re-render) => no focus loss,
  matches wireEditable pattern. Add/Remove/Save re-render via render().
- Maintenance Add-row inserts after last row of THAT category (splice at lastIdx+1),
  full re-render keeps grouping correct across multi-category adds.
- MAX_MAINT_ROWS raised 20->60. cleanMaintenance slices total 60 (tail-truncates if
  exceeded across categories) - acceptable.

## Note (pre-existing, NOT this change)
- state.maintenance only ever (re)built from buildMaintenanceRows() empty defaults;
  no edit-existing-report rehydration path. Form is create-oriented. Old code same.
