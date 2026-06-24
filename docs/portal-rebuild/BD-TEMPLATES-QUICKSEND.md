# BD CRM — Document Templates + Quick-Send (QUEUE ONLY)

**Shipped:** 2026-06-24, branch website-build-20260609.
**Spec:** Brad's BD build-out, item 4 (templates + quick-send).

## IMPORTANT: sending is intentionally OFF
Brad: "Let's not email anyone yet until we're done all the mods." So this slice
houses templates, builds the pre-typed intro email with attachments, and QUEUES a
pending send (status 'queued'). It NEVER sends email and NEVER calls a mail API
(no graph/smtp/mail fetch anywhere in the handler; the handler makes no outbound
request at all, it only touches KV). A FUTURE external daemon (authenticating as
admin) will read the queue and do the actual send.

## Data model

### Read-only seed (authored, no workbook source)
- Builder: `platform/sync/build-bd-templates.py` -> `platform/data/bd-templates.js`:
  ```
  window.PF_BD_TEMPLATES = {
    templates: [ {id, name, subject, body} ],   // {{placeholder}} tokens
    docs:      [ {id, name, reference, status} ],// status 'pending' until supplied
    placeholders: ['contactName','companyName','senderName','senderTitle','projectName'],
    generated, source
  }
  ```
- Seeds 2 Brad-style intro templates (general GC + data center GC). Doc registry
  seeds 3 entries (2-Pager Intro, PF Resume, PF Project List) all `status:pending`
  with empty references. THE ACTUAL FILES ARE PENDING from Brad/Derek; we store
  the reference only and never fabricate content.

### Write-back overlay (KV) on env.PF_SCHEDULE
- `bd_templates_v1` -> `{ templates:[...], docs:[...], meta }` (BD edits + doc
  references; merges over the seed in the UI).
- `bd_sends_v1` -> `{ sends:[{ id, to, contactId, templateId, attachments:[],
  renderedSubject, renderedBody, status, queuedBy, queuedAt, sentAt, messageId }],
  meta }`. status: 'queued' (BD) -> 'sent' (the future admin daemon).

## Placeholders
`{{contactName}} {{companyName}} {{senderName}} {{senderTitle}} {{projectName}}`
are resolved at preview/queue time. Quick-send fills contactName/companyName from
the selected bd-records contact + company, senderName/senderTitle from the BD
user's input. Unfilled tokens are left as-is (visible), never guessed.

## UI
- Module `mod-bd-templates` under Business Development, 4 tabs:
  - Quick-send: pick contact + template + attachment docs -> live PREVIEW of the
    resolved email -> "Queue send" (writes status 'queued'; shows "Queues only.
    No email is sent.").
  - Email templates: view/edit/add templates (saved to KV).
  - Attachment docs: set a reference (URL/SharePoint link) per doc; banner notes
    the files are pending from Brad/Derek.
  - Queued sends: list of queued + sent records with status.
- All data via window.esc.

## Endpoints (Cloudflare Pages Function /api/bd-send)
Two auth tiers; each action calls requireArea. Middleware gates the path at
business_dev (field_ops BLOCKED).

| Method + action | Tier | Purpose |
|---|---|---|
| `GET` (no query) | business_dev | templates + docs + sends |
| `POST {action:'save-template'}` | business_dev | add/update an email template |
| `POST {action:'save-doc'}` | business_dev | set a doc-registry reference |
| `POST {action:'queue'}` | business_dev | QUEUE a send (status 'queued'); NO email |
| `GET ?pending=1` | **admin only** (`bd_send_bridge`) | future daemon: queued sends |
| `POST {action:'mark-sent'}` | **admin only** (`bd_send_bridge`) | future daemon: flag sent |

Inputs validated + length-capped, angle brackets stripped, audit fields
server-set. KV read-modify-write race documented in the handler (durable fix = D1).

## SEND-BRIDGE CONTRACT (for the future send daemon)
The daemon authenticates as **admin**. Both calls are admin-only.

### 1. Poll for queued sends
```
GET /api/bd-send?pending=1
Auth: admin session — business_dev/partner/field_ops get 403
200 -> {
  "ok": true, "pending": true, "count": <int>,
  "sends": [ {
    "id": "snd_xxxxxxxx",
    "to": "pat@acme.com",
    "contactId": "ct_xxxxxxxx",
    "templateId": "tpl_intro_general",
    "attachments": ["doc_resume","doc_2pager"],
    "renderedSubject": "Pier Foundations - ground improvement for Acme GC",
    "renderedBody": "Hi Pat Buyer, ...",
    "status": "queued",
    "queuedBy": "Derek", "queuedAt": "2026-06-24T15:00:00.000Z",
    "sentAt": null, "messageId": null
  } ]
}
```
`attachments` are doc ids from the registry; the daemon resolves each id to a
file via the doc `reference` (which must be supplied first). Only `status==='queued'`
records are returned.

### 2. Mark a send sent (after a successful send)
```
POST /api/bd-send
Content-Type: application/json
Auth: admin session
Body: { "action": "mark-sent", "id": "snd_xxxxxxxx", "messageId": "<optional>" }
200 -> {
  "ok": true, "saved": true, "action": "mark-sent",
  "id": "snd_xxxxxxxx", "status": "sent",
  "sentAt": "2026-06-24T15:05:00.000Z",
  "meta": { "updated": "2026-06-24T15:05:00.000Z" }
}
```
Errors: 400 invalid JSON / unknown action, 403 not admin, 404 id not found, 503
KV missing. Once marked, the send drops out of `?pending=1` (idempotent re-poll).

## Gating
- `/data/bd-templates.js` + `/api/bd-send` -> business_dev (field_ops BLOCKED).
- The two send-bridge actions -> `bd_send_bridge` (admin only; BD + partner +
  field_ops denied). New area added to `functions/lib/auth.js`.

## Pending from Brad / Derek
- The actual document files (2-Pager Intro, PF Resume, PF Project List). Until a
  reference is set per doc, attachments resolve to nothing on the daemon side.
- Confirmation of the final sender identity + recipient routing (the daemon owns
  the actual addresses; Ray/Jonathan/Derek per the opportunities flow).

## Verification (2026-06-24)
- Builder STDOUT: 2 templates, 3 docs (all pending), 5 placeholders.
- `node migrations/test-rbac.mjs`: 511 pass / 0 fail (templates feed -> business_dev,
  field_ops denied; /api/bd-send business_dev; admin-only bridge denied to BD/
  partner/field_ops, allowed to admin; source-level requireArea; NO mail API /
  NO fetch in the handler; queue sets status 'queued').
- Headless handler test: 19 pass / 0 fail (BD save-template/save-doc/queue; admin
  pending + mark-sent; BD DENIED both admin actions; partner denied; field_ops +
  no-session denied; validation + XSS strip).
- Quick-send preview: "Hello Pat Buyer at Acme GC, from Derek Franke." (all
  placeholders resolved, none left).
- Deploy OK; gate 401 with no creds on /data/bd-templates.js + /api/bd-send.

## Confirmed: no email sent, no mail API called
The handler makes ZERO outbound requests (no fetch, no URL) and references no mail
API (sendMail/messages/smtp/nodemailer/mailgun/sendgrid). The queue action only
writes status 'queued'. Verified by grep in the test suite + by hand.
