# BD CRM — Opportunities (capture, feasibility, decision, email bridge)

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Brad's BD build-out, Opportunities.

Capture a new opportunity -> a transparent feasibility recommendation (Prelim /
Pass / Review) with reasoning -> the system flags it for an email to Ray,
Jonathan and Derek (an external daemon sends; the platform only sets the flag) ->
one of the three decides "send to precon for prelim" or "pass". Passed opps move
to an "Opportunities passed on" list. "Send to precon" flags a precon handoff and
keeps all history.

## Data model

### Read-only base (ingested)
- Source: PF BD Master workbook, "Opportunities" tab. Field list = its header
  ROW 4 (verbatim, no invented fields).
- Builder: `platform/sync/build-opportunities.py` ->
  `platform/data/opportunities.js`:
  ```
  window.PF_OPPORTUNITIES = {
    opportunities: [ { id, fields:{...row4...} } ],
    fields: [ ...row4 headers... ],   // 12: Priority, Project Name, Deal Owner,
                                      // Organization, Status, Stage, Loss Reason,
                                      // Source, Value, Probability, Exp. Close, Notes
    generated, source, sourceTab
  }
  ```
- Stable collision-safe ids `op_<sha1(name)>` (first occurrence keeps the plain
  hash; Nth duplicate hashes `name#N`). Builder hard-verifies id uniqueness.
- Current ingest: 71 opportunities, 12 fields, no omissions (2 duplicate Project
  Names handled by collision suffix).

### Write-back overlay (KV) — the live working set
New + edited opportunities, the recommendation, the email flags, and the
decision all live in KV and merge on top of the base in the UI. A re-sync of the
base never erases KV data.

KV binding `env.PF_SCHEDULE`, key `opp_overlay_v1`:
```
{ opportunities: [ {
    id,                      // server-issued ov_op_* (never collides with base op_*)
    fields:{...},
    recommendation,          // 'Prelim' | 'Pass' | 'Review'
    recommendationReasons:[],// the basis bullets (always shown)
    recRule, recVersion,     // which rule fired + 'v1'
    emailStatus,             // 'pending' | 'sent'
    emailedAt, messageId,    // set by the admin email daemon via mark-emailed
    decision,                // null | 'prelim' | 'passed'
    decidedBy, decidedAt, passReason,
    preconHandoff,           // true once decision='prelim' (later precon slice reads it)
    addedBy, addedAt, updatedAt
  } ], meta:{updated} }
```

## Feasibility RULES (v1 — confirm every threshold with Jonathan)

ONE editable place: `platform/functions/lib/feasibility.js` (the `CONFIG` object
+ `score()`). Imported by `/api/opportunity` (recompute on create/edit) and
exposed as `globalThis.PFFeasibility` for any future browser use. First matching
rule wins; ALL reasons are surfaced; a blank needed field yields an "insufficient
data: <field>" bullet rather than a guess.

| Order | Rule id | Condition (v1 default) | Result | Reason shown |
|---|---|---|---|---|
| 1 | out-of-scope-sector | sector/type contains DOT / highway / heavy civil / road / bridge / interstate / INDOT / ODOT / transportation | **Pass** | "Outside PF scope (buildings/data centers, not DOT)." |
| 2 | out-of-region | State not in IN/OH/MI/IL/WI | **Review** | "Out of core region (XX), confirm travel." (+ tight-lead note if also < 14 days) |
| 3 | tight-lead-time | Bid due date < ~14 days out | **Review** | "Tight for a Garbin prelim (needs ~14+ days)." |
| 4 | in-region-building-fit | in-region, not out-of-scope, adequate lead | **Prelim** | positive factors: sector fit, region, lead time, size |

`CONFIG`: `coreStates = [IN, OH, MI, IL, WI]`, `tightLeadDays = 14`. All marked
"v1 default — confirm with Jonathan" in the source.

## Decision flow
- On create: `recommendation`/`recommendationReasons`/`recRule` computed +
  stored; `emailStatus:'pending'`, `emailedAt:null`, `decision:null`.
- "Send to precon for prelim" -> `decision:'prelim'`, `preconHandoff:true`
  (a later precon slice picks this up; all history kept).
- "Pass" -> `decision:'passed'` (+ who/when/optional reason); moves to the
  "Opportunities passed on" list.
- The UI shows an "awaiting a decision" count and per-row "email pending" / "to
  precon" badges.

## Endpoints (Cloudflare Pages Function /api/opportunity)

TWO auth tiers, clearly separated; each action calls `requireArea` with the
right area. The middleware gates the PATH at `business_dev` (field_ops BLOCKED).

| Method + action | Tier (area) | Purpose |
|---|---|---|
| `GET` (no query) | business_dev | full overlay (the UI) |
| `POST {action:'create'}` | business_dev | add opp + compute recommendation |
| `POST {action:'update'}` | business_dev | edit opp + recompute |
| `POST {action:'decide'}` | business_dev | prelim / passed |
| `GET ?pending=1` | **admin only** (`opp_email_bridge`) | email daemon: opps awaiting email |
| `POST {action:'mark-emailed'}` | **admin only** (`opp_email_bridge`) | email daemon: flag sent |

business_dev is DENIED the two admin actions; admin is allowed them. field_ops
and unauth are denied everywhere. Inputs validated + length-capped, angle
brackets stripped, audit fields server-set. KV read-modify-write race documented
in the handler (durable fix = D1).

## EMAIL-BRIDGE CONTRACT (for the external email daemon)

The daemon authenticates as **admin** (admin pf_session, or the shared-gate admin
on the current deployment). Both calls are admin-only.

### 1. Poll for opportunities awaiting an email
```
GET /api/opportunity?pending=1
Auth: admin session (cookie) — business_dev/partner/field_ops get 403
200 ->
{
  "ok": true,
  "pending": true,
  "count": <int>,
  "opportunities": [
    {
      "id": "ov_op_xxxxxxxxxx",
      "fields": { "Project Name": "...", "Organization": "...", "Type": "...",
                  "State": "...", "City": "...", "Value": "...",
                  "Bid Due Date": "...", "Source": "...", "Notes": "..." },
      "recommendation": "Prelim" | "Pass" | "Review",
      "recommendationReasons": ["...", "..."],
      "recRule": "in-region-building-fit",
      "emailStatus": "pending",
      "addedBy": "Derek",
      "addedAt": "2026-06-24T15:00:00.000Z"
    }
  ]
}
```
Only opps with `emailStatus === 'pending'` are returned. Recipients are Ray,
Jonathan and Derek (the daemon owns the address list).

### 2. Mark an opportunity emailed (after a successful send)
```
POST /api/opportunity
Content-Type: application/json
Auth: admin session
Body: { "action": "mark-emailed", "id": "ov_op_xxxxxxxxxx", "messageId": "<optional>" }
200 ->
{
  "ok": true,
  "saved": true,
  "action": "mark-emailed",
  "id": "ov_op_xxxxxxxxxx",
  "emailStatus": "sent",
  "emailedAt": "2026-06-24T15:05:00.000Z",
  "meta": { "updated": "2026-06-24T15:05:00.000Z" }
}
```
Errors: 400 invalid JSON / unknown action, 403 not admin, 404 id not found, 503
KV binding missing. `messageId` is optional and stored for traceability. Once
marked, the opp drops out of the `?pending=1` set, so the daemon is idempotent if
it re-polls.

## Gating summary
- `/data/opportunities.js` + `/api/opportunity` -> `business_dev` (field_ops
  BLOCKED). The two email-bridge actions -> `opp_email_bridge` (admin only).
- New area `opp_email_bridge: ['admin']` added to `functions/lib/auth.js`.

## Verification (2026-06-24)
- Builder STDOUT: 71 opportunities, 12 fields, no omissions, ID UNIQUENESS OK.
- `node migrations/test-rbac.mjs`: 470 pass / 0 fail (opportunities.js +
  /api/opportunity business_dev; field_ops denied; admin-only email bridge
  denied to BD/partner/field_ops, allowed to admin; source-level requireArea;
  scorer rules).
- Headless handler test: 23 pass / 0 fail (BD create computes recommendation +
  pending flag; BD decide prelim/passed; admin reads pending + mark-emailed;
  business_dev DENIED both admin actions; field_ops + no-session denied
  everywhere; validation + XSS strip).
- Feasibility scorer: DOT -> Pass, out-of-region -> Review, tight in-region ->
  Review, clean data center -> Prelim, missing-data -> "insufficient data"
  bullets.
- Deploy OK; gate 401 with no creds on /, /data/opportunities.js,
  /api/opportunity (GET full, GET ?pending=1, POST).

## Not exercised live
- A real authenticated admin POST/GET against the DEPLOYED endpoint was not run
  because this environment cannot mint a live pf_session (the per-user D1 cutover
  is still blocked on Brad's token; the deployment is on the shared Basic-Auth
  gate). The two-tier auth, persistence, recommendation, decision flow and the
  email-bridge actions are all proven headlessly against the REAL Function code;
  the deployed gate is proven to 401 unauth.
