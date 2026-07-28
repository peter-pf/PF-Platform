# SRS — Project Record Per-Section Manual Overrides

## Purpose
Let an office user manually enter/edit ANY field in ANY section of a project
record (opened from Active Projects) as a MANUAL OVERRIDE that persists for the
whole office, survives reload, and survives a future data sync (the override
always wins over the synced source). Brad's request (2026-07-28).

## Scope
- The OFFICE project-record view only (`initProjectRecord` / `renderInto`, roots
  `#prRoot` for POET and `#prGenericRoot` for every other project). The Field
  Operations project view (a separate renderer) is NOT touched.
- All 11 sections editable via one generic mechanism: General Info, PF Team,
  Contract Info, Engineering & Design, Project Safety, Site Readiness, Equipment,
  Material, QA/QC, Financials, Project Closeout. (The computed "3b Subcontract
  Analysis" summary card is intentionally not editable.)

## Functional Requirements
1. A per-section **Edit** button sits to the RIGHT of each section header, for
   office roles only (admin/partner/business_dev). field_ops sees no Edit button.
2. Edit turns that ONE section's fields into text inputs with **Save**/**Cancel**,
   plus an optional "add new manual field" row (for blank/new-project records).
3. Save persists the section's field overrides to KV via `/api/project-override`
   and re-renders the record with overrides merged (override wins; each edited
   field shows a subtle ✎ marker; the section header shows "edited by X · date").
4. Overrides are loaded on record open (before first render) and merged on top of
   the synced record, so they win even after a future data sync.
5. New projects created from the estimating/award flow (pm_projects_v1 overlay,
   no synced static record yet) render through the SAME editable card view via a
   synthesized blank record (number + name from the PM overlay).

## Non-Functional / Security
- Role gate SERVER-SIDE: `/api/project-override` is in the `financials` area
  (admin/partner/business_dev); field_ops and unauth are 403 even by direct URL.
  The client Edit-button hide is convenience; the server is the real boundary.
- FAIL CLOSED: if a save fails (KV unavailable, 403, network), the UI shows an
  honest inline error and STAYS in edit mode with the user's input preserved. It
  NEVER shows "saved" when it was not saved, and NEVER fabricates a saved state.
- Write hardening mirrors daily-report.js: body cap, strict-JSON→400, section
  validated against the fixed 11 keys, labels/values length-capped, angle
  brackets stripped, updatedBy/updatedAt set from the session (never client).

## Data Model
KV key `project_override_v1:<num>` →
`{ num, sections:{ <sectionKey>:{ <fieldLabel>:<value> } }, _meta:{updatedBy,updatedAt} }`.
Values are strings (text/number/date stored as text; ZERO financial computation —
a money string a user types is stored verbatim, nothing is summed or priced).
