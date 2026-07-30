# Portal Budget-vs-Actual Sync — Generalize from POET-only to ALL Projects

**Status:** SCOPING ONLY (no code/data changed). Author: web-dev. Date: 2026-07-30.
**Directive (Brad):** Sync invoice actuals I've been coding into each project's Turnover
Budget workbook ("Budget vs Actual" tab) to the portal, for ALL projects — and do it
**QuickBooks-INDEPENDENT** (read the workbooks directly).

---

## 1. Current Mechanism (mapped precisely)

There are TWO separate, unrelated budget systems in the portal today. This is the core
finding: **the one place that shows real Actuals is POET-hardcoded, and the one place
that is generic has no Actuals at all.**

### 1A. POET-only Budget-vs-Actual view (has REAL actuals, single project)

- **Builder:** `platform/sync/build-budget-actual.py`
  - Reads ONE hardcoded workbook via Microsoft Graph (token `pf_email._token()`,
    `SP_DRIVE_ID` from `/home/aiciv/.env`):
    - `SP_PROJECT_FOLDER = "04 - Project Management/02 - Projects/26-002 - POET Projects - POET"`
    - `BUDGET_FILE = "{SP_PROJECT_FOLDER}/26-0330 POET Turnover Budget.xlsm"`
    - `BUDGET_SHEET = "Budget vs Actual"`
  - Parses that sheet with the **formula-graph classifier** (two openpyxl loads:
    `data_only=True` for values + `data_only=False` for formulas):
    - col A `Cost Code`, B `Description`, C `Budget`, D `Actual Costs`, E `Variance`,
      F `Vendor or Supplier`, G `Notes`.
    - Classifies each row as **major category** (a roll-up whose refs are themselves
      roll-ups), **sub-rollup** (`=SUM(C56:C61)`, shown as sub-header, NOT summed), or
      **leaf** (a real cost line, counted). This prevents the double/triple-count that a
      flat parse produced (388K vs true 343K).
    - **Variance is RECOMPUTED** = Budget − Actual (never trusts the stored E cell).
    - **Blanks stay blank** (`None` → em-dash; never fabricated).
    - Reads the grand total from the summary band ("Total Construction Contract").
  - Also resolves clickable invoice/vendor links (Graph `webUrl`) for actual-cost lines.
  - **Writes** `platform/data/budget-actual-poet.js` =
    `window.PF_BUDGET_ACTUAL_POET = { job, name, location, groups:[{title, rows:[...],
    subtotal}], grand_total, ... }`.
- **Portal consumption:**
  - `index.html` loads `/data/budget-actual-poet.js` (script tag; referenced ~line 2311,
    2347) and exposes a nav item `data-module="budget-actual-poet"` (~line 2750, red
    label "Budget vs Actual - 26-002 POET"), rendering into `#mod-budget-actual-poet`
    (~line 3505) via an `initBudgetActual()` IIFE. **This whole view is POET-only** — it
    is a single global object, not keyed by project.

### 1B. Generic per-project Financials (NO actuals — Actual hardcoded to 0)

- **Template:** `platform/data/cost-code-template.js` =
  `window.PF_COST_CODE_TEMPLATE` — the ~69 standard cost codes with **money ZEROED**,
  grouped, derived from the POET code list. Every project renders from this same template.
- **Per-project BUDGET store:** `platform/functions/api/project-budget.js`
  - KV key `project_budget_v1:<num>` (binding `env.PF_SCHEDULE`).
  - Stores ONLY **budget** overrides, keyed by a **stable row key** `g<gi>_r<ri>`
    (group index + row index — NOT cost_code, because codes repeat across categories).
  - RBAC: behind auth `_middleware.js`; `requireArea(session,'financials')` on GET+POST
    (admin/partner/business_dev only; field_ops blocked). Fail-closed: no KV → 503.
  - **There is no Actual field anywhere in this store.** The docblock says "ACTUAL stays
    0/blank in Phase 1 (Phase 2: invoice intake allocates line items to cost codes)."
- **Render (index.html):**
  - `budgetVsActualTable(num)` → `baRenderTable(T, savedRows, num, editable)`:
    - merges saved budgets over the zeroed template by row_key, then hardcodes
      **`var actual = Number(r.actual) || 0; // Phase 1: always 0`** (~line 12114).
      Because the template's `r.actual` is always 0, **Actual is always 0 for every
      non-POET project.**
  - `baGrandTotals(num)` → `{ budget, actual, ok }` — sums leaf budgets, and
    `gA += (Number(r.actual) || 0)` which is **always 0** (~line 12201).
- **Job Financials roll-up (Section 10)** reads `baGrandTotals(_curNum)`:
  - "Project Budget" = `finTot.budget`, "Actual Cost to Date" = `finTot.actual`
    (**always $0 / dash today**), "Project Profit" = Budget − Actual (so profit ==
    full budget today), "Profit %" guarded divide-by-zero.
  - This is exactly why your 26-013/26-017/26-015 actuals don't appear: the roll-up's
    Actual is wired to `PF_COST_CODE_TEMPLATE.actual`, which is structurally 0.

**Net:** POET has a bespoke feed with real actuals but a bespoke view. Every other project
shares a generic view whose Actual column is a structural zero. The task is to give the
generic path a real per-project Actual, sourced from each project's Turnover Budget
workbook, QuickBooks-free — reusing the POET script's proven parser.

---

## 2. The jobnum → workbook mapping

The SharePoint folder name is **NOT purely derivable from jobnum**. Confirmed live
examples show a GC suffix and even a misspelling:

- `26-002 - POET Projects - POET`
- `26-015 - Schaff CPA - Patterson Horth`  (folder spells "Schaff"; PDF spells "Schaaf")
- `26-013 - Park & Poplar - OldTown`

So folder = `{code} - {Name} - {GC-short}` with human variance. Two viable resolvers:

- **(Preferred) Graph children-listing by code prefix (auto, self-healing).**
  List children of the parent folder and match the child whose name **starts with the
  jobnum**:
  - Active: `04 - Project Management/02 - Projects/` → child `startswith("{job} ")`.
  - Completed fallback: `001 - Completed Projects/{year}/` → child `startswith("{job} ")`
    (year derivable from the `YY-` prefix, e.g. `26-` → 2026; try current + prior years).
  - Inside the matched folder, find the Turnover Budget file by pattern
    `*Turnover Budget*.xlsm` (don't hardcode "26-0330 POET…"; the code prefix on the
    filename varies per project). Pick the single `.xlsm` matching `Turnover Budget`;
    if 0 or >1, record an honest "ambiguous/missing" status for that job (never guess).
  - Requires NO manual upkeep as projects are added or move active→completed.
- **(Fallback) Explicit manifest** `platform/sync/turnover-budget-manifest.json`:
  `{ "26-013": {"folder": "...", "file": "...Turnover Budget.xlsm", "sheet":
  "Budget vs Actual"}, ... }`. Deterministic, but must be hand-updated per project and
  when a project is archived to `001 - Completed Projects/{year}/`.

**Recommendation:** implement the **Graph prefix-listing resolver** as the primary path,
and let the optional manifest act as an override for any job whose folder/file the
listing can't disambiguate. Seed the manifest from `data/project-master.json` (it already
maps `project_number` → name/GC), so we know the full active-job set to iterate.

---

## 3. The generalization (build)

### 3.1 Generalize the parser into a shared module

- Extract the parsing core of `build-budget-actual.py` into a reusable function
  `parse_budget_actual(token, budget_file_path, sheet="Budget vs Actual")` (it is already
  project-agnostic — the formula-graph classifier carries over unchanged). The only
  POET-specific bits today are the hardcoded `BUDGET_FILE`, the summary-band label, and
  the invoice-link resolver — parameterize the path; keep invoice links optional/POET-only
  for now (not required for the Actual sync).
- New driver **`platform/sync/build-budget-actuals.py`** (plural) that, for each job:
  1. Resolve folder+file via the §2 resolver.
  2. Parse the "Budget vs Actual" sheet → the same `{job,name,groups[],grand_total}` shape.
  3. Emit **per-cost-code Actuals** (and the workbook's Budget, for cross-check) as a
     compact map.

### 3.2 Choose the output shape — recommend a single unified feed

Two options:

- **(a) Per-project feed** `data/budget-actual-{job}.js` (mirrors the POET file). Simple,
  but N script tags and N nav wirings; heavier page.
- **(b) Unified feed (RECOMMENDED)** `data/budget-actuals.js` =
  `window.PF_BUDGET_ACTUALS = { "26-013": {...}, "26-017": {...}, ... , _meta:{generated,
  source:"turnover-budget-workbooks"} }`. One script tag, one load, keyed by jobnum. The
  Section-10 renderer already knows `_curNum`, so it just indexes in.

For each job, store BOTH the **grouped rows** (for a real Budget-vs-Actual table per
project, replacing the POET-only view with a generic one) AND a **flat actuals-by-row map**
that overlays cleanly onto the existing template render (see §4).

### 3.3 QuickBooks-independent

No QB anywhere. The single source of truth is each project's **Turnover Budget .xlsm**
Actual column that Brad maintains by hand. This matches the "read workbooks directly"
directive and the fail-closed / never-fabricate posture already in the codebase.

---

## 4. Wiring the portal so "Actual Cost to Date" populates for all jobs

The cleanest, lowest-risk wiring reuses the existing template-overlay pattern (the same
way saved budgets already overlay by `row_key`):

- Load `data/budget-actuals.js` (unified feed) alongside the template.
- In `baRenderTable` (~12114) replace the hardcoded
  `var actual = Number(r.actual) || 0;` with an **actual-overlay lookup**:
  `var actual = actualFor(num, gi, ri, code) || 0;` where `actualFor` reads
  `PF_BUDGET_ACTUALS[num]`. Overlay by the SAME stable identity used for budgets
  (`g<gi>_r<ri>`), with cost_code as a secondary match/label.
- In `baGrandTotals` (~12201) change `gA += (Number(r.actual)||0)` to add the overlaid
  actual, so the **Section-10 roll-up's "Actual Cost to Date" and "Project Profit"**
  populate automatically (that band already reads `baGrandTotals(_curNum)` — zero changes
  needed there once the total is real).
- Fail-closed: if `PF_BUDGET_ACTUALS[num]` is missing/errored, Actual falls back to 0 with
  an honest "actuals not synced for this project" note — never fabricate.

**Row-alignment caveat (important):** the generic template's group/row order
(`PF_COST_CODE_TEMPLATE`) and a given project's Turnover Budget row order may not line up
1:1 (projects add/remove lines). Overlaying by `g<gi>_r<ri>` is only safe if we align on a
**stable key**. Recommend matching **by cost_code within category**, and where a workbook
line has no code, match by normalized description; emit an **unmatched-actuals** list in
the feed so nothing is silently dropped. Alternatively (cleaner long-term) render the
per-project table **from the workbook's own groups** (like the POET view) instead of the
zeroed template — this sidesteps alignment entirely and gives a truer per-project sheet.
**Recommendation:** ship the overlay-by-cost_code first (small diff, keeps the familiar
template view), and note the "render-from-workbook-groups" as a follow-up that would also
let us retire the POET-only special case.

---

## 5. Handling the workbook's row types (reuse the POET rules verbatim)

The formula-graph classifier already solves this; apply it per project:

- **Cost-code leaf rows** → the only rows summed; carry Budget + Actual.
- **Subtotals / grey `=SUM(...)` roll-ups** → flagged `is_subtotal:true`, shown as
  sub-headers, **never summed** (prevents double-count). Do not read them as line items.
- **Yellow placeholder rows** → openpyxl doesn't reliably expose fill color in a
  formula-graph pass; treat a row with a description but no code and no money as a
  placeholder — **show it but flag** `placeholder:true` (grey, no total impact) rather
  than dropping it, so Brad sees the line exists. (If we want true yellow-fill detection,
  read `cell.fill.fgColor.rgb` in the values pass and mark `flagged:true`.)
- **Formula cells** (Budget/Actual that are `=...`) → **read the EVALUATED value** from the
  `data_only=True` load (already how POET works). Note: openpyxl returns `None` for a
  formula cell if the workbook was never opened/saved by Excel (no cached value). If a
  feed comes back with null totals where the sheet clearly has numbers, that's the cause —
  the mitigation is that Brad's hand-entered Actuals are literals, and Excel caches the
  roll-up formulas on save; flag any job whose grand total is null as "needs a re-save in
  Excel," never fabricate.
- **Variance** → always recomputed = Budget − Actual; never trust column E.
- **Blanks** → stay blank / em-dash.

---

## 6. Refresh model — two options + recommendation

**(a) LIVE pull on page load (Graph per project view).**
- Pro: freshest (reflects a workbook edit instantly).
- Con: adds a Graph round-trip + openpyxl parse to each project-record open (seconds of
  latency); Graph auth token must live server-side (a Cloudflare Function calling Graph —
  new secret plumbing); Graph throttling/cost per view; a slow/failed Graph call blocks or
  degrades the financials render. Heavier and more failure-prone on a hot path.

**(b) CACHED feed regenerated on a schedule + manual refresh button (RECOMMENDED).**
- Regenerate `data/budget-actuals.js` on the **same cadence as the other syncs**
  (`data/sync-meta.json` shows a daily ~06:00 batch already runs bid_log/project_master/
  bd_master/etc.). Add `build-budget-actuals.py` to that batch. This container has **no
  cron** (solved-box-gotchas) — the existing 06:00 job is daemon/loop-driven, so hook the
  new builder into whatever invokes the current batch (same place `build-project-record.py`
  / `sp-sync.py` are triggered).
- Add a **manual "Refresh actuals" button** (office-only) that triggers a one-off
  regenerate + redeploy of the feed, for when Brad wants his just-entered invoices live
  immediately without waiting for the nightly.
- Pro: page stays fast (static JS, same as every other data feed); no Graph on the hot
  path; matches the established architecture and RBAC; deterministic and cacheable.
- Con: up to ~24h staleness between syncs (mitigated by the manual refresh button).

**Recommendation: (b) cached + manual refresh.** It matches the existing feed pattern
exactly (every `data/*.js` is a generated static file), keeps financial rendering fast and
fail-closed, avoids standing up server-side Graph auth in a Cloudflare Function, and the
manual button covers the "I just entered invoices, show me now" case. Reserve (a) live-pull
as a future enhancement only if daily+manual proves too stale.

---

## 7. Rough effort estimate + sequence

**Effort: ~1 to 1.5 focused build sessions** (parser is already written and proven; the
work is generalization + wiring + verification, not new algorithms).

**Sequence:**
1. **Refactor parser** — extract `parse_budget_actual(token, path, sheet)` from
   `build-budget-actual.py` into a shared helper importable by both the POET builder and
   the new plural builder. (Small; keeps POET working byte-for-byte.)
2. **Build the resolver** — Graph children-listing by jobnum prefix (active + completed
   fallback), Turnover-Budget-file matcher, honest missing/ambiguous status. Seed the job
   list from `data/project-master.json`.
3. **Build `build-budget-actuals.py`** — iterate jobs, parse, emit unified
   `data/budget-actuals.js` (`window.PF_BUDGET_ACTUALS`) with per-job groups + a
   by-cost_code actuals overlay + unmatched-actuals + per-job source/status. Run it for
   26-013, 26-017, 26-015 first and reconcile totals against the workbooks.
4. **Wire the portal** — load the feed; add `actualFor(num,gi,ri,code)`; overlay Actual in
   `baRenderTable` and `baGrandTotals`; the Section-10 roll-up populates automatically.
   Fail-closed fallback + "actuals not synced" note.
5. **Manual refresh button** (office-only) + hook the builder into the 06:00 batch.
6. **Verify** — node `--check` the feed; div/script-balance in index.html; reconcile each
   job's overlaid grand-Actual to the workbook's summary band within rounding; confirm
   field_ops isolation is preserved; confirm fail-closed dashes when a job has no feed.
7. **(Follow-up, optional)** render the per-project table from the workbook's own groups
   and retire the POET-only special-case view.

---

## 8. Constraints honored

- **QuickBooks-independent** — sole source is the Turnover Budget .xlsm Actual column.
- **Never fabricate / fail closed** — missing feed → Actual 0 + honest note; null totals →
  flagged, never invented (matches existing financial-data posture).
- **RBAC unchanged** — financials area only; field_ops never sees Actuals.
- **No cron** — reuse the existing daily 06:00 daemon batch + a manual refresh button.
- **Reuse, don't rebuild** — the formula-graph parser is lifted directly from the POET
  builder; the overlay-by-row pattern mirrors the existing saved-budget overlay.

---

## IMPLEMENTATION NOTE (built 2026-07-30 — STAGED, not production)

Built on Git branch `budget-actuals-sync-20260730`. Deployed to a PREVIEW branch
deployment only. Production `main` is NOT touched until Brad approves.

### What shipped
- `platform/sync/budget_actual_parser.py` — shared, project-agnostic formula-graph
  parser (extracted from `build-budget-actual.py`; POET builder now delegates to it,
  output byte-compatible aside from the workbook's own current values + a harmless
  `has_cached_values` key).
- `platform/sync/build-budget-actuals.py` — AUTO-DISCOVERS every project by listing
  the SharePoint Projects folders (active `04 - Project Management/02 - Projects/`
  then completed `.../001 - Completed Projects/<year>/`), prefix-matching folders by
  job number and files by `*Turnover Budget*.xlsm` (prefers the BASE file when
  change-order variants exist). Emits unified `data/budget-actuals.js`
  (`window.PF_BUDGET_ACTUALS` keyed by jobnum) with `actuals_by_group`,
  `grand_total`, `status`, and `_meta.unmatched_actuals`. QuickBooks-independent.
- `platform/index.html` — overlays each project's ACTUAL onto the standard cost-code
  template by (normalized group title + cost code) in `baRenderTable` and
  `baGrandTotals`, so Section-10 "Actual Cost to Date" / "Project Profit" populate
  for ALL jobs. FAIL CLOSED: a project with no synced/ok feed renders a dash (never a
  fabricated 0). Adds an office-only "Refresh actuals" button + an "Actuals synced …"
  freshness note.
- `platform/functions/api/refresh-actuals.js` — office-only endpoint; writes a KV
  refresh request (`PF_SCHEDULE::budget_actuals_refresh_request`), fail-closed 503 if
  KV unbound. Reuses the existing CF Graph/KV plumbing pattern.
- `tools/budget_actuals_daemon.sh` — HOURLY rebuild+deploy of the feed, PLUS an
  instant path: polls the KV refresh key (same CF-API KV bridge as
  `field_query_poller`) and also a local trigger file, firing a rebuild within ~a
  minute of a button press. Logs an idle heartbeat every 60s. Registered in
  `tools/daemon-manifest.json` (health_check `log_fresh`, max_age 180s) so the
  daemon-watchdog supervises/revives it.

### Refresh model (both, per Brad)
- Hourly automatic (daemon loop; no cron in container).
- Instant on-demand ("Refresh actuals" button -> /api/refresh-actuals -> KV -> daemon
  rebuild+redeploy -> button reloads the cache-busted feed and re-renders).

### Go-live flip (after Brad approves)
- Deploy the branch to production `main`, and set the daemon's deploy target to main
  (env `BUDGET_ACTUALS_BRANCH=main`), then launch the daemon:
  `nohup setsid /home/aiciv/tools/budget_actuals_daemon.sh >/dev/null 2>&1 &`.
