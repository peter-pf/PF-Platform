# Field-Ops Smart Search — Hermes Integration (STAGE 1)

**Status:** Stage 1 complete — LOCAL engine proven + portal broker built INERT.
**Not yet done (Stage 2, needs human co-verify):** public exposure of Hermes.
**Branch:** `pm-nav-cleanup-20260728`
**Date:** 2026-07-28

This document describes how the Pier Foundations portal field-crew smart-search
box talks to Peter's **local** Hermes instance, and the exact plan to expose it
safely in Stage 2. Nothing in Stage 1 is exposed publicly. Everything is on
`127.0.0.1`.

---

## 0. Architecture at a glance

```
crew browser
   │  POST /api/field-companion   { query }        (same-origin, pf_session cookie + RBAC)
   ▼
functions/api/field-companion.js  (Cloudflare Pages Function, server-side)
   │  fetch PF_FIELD_HERMES_URL
   │    Authorization: Bearer <PF_FIELD_HERMES_SECRET>
   │    X-PF-Timestamp: <ms>
   │    X-PF-Signature: hex(HMAC_SHA256(secret, ts + "." + body))
   ▼
[STAGE 2] cloudflared named tunnel  ──►  127.0.0.1  Hermes  (MiniMax-M2.7)
   │  answer phrased from FIELD-SAFE records only (money stripped at ingest)
   ▼
{ answer, sources, contains_financials:false }  ──►  browser
```

- The AI **phrases**; deterministic field-safe data supplies the facts.
- The shared secret lives ONLY in the CF env — never in the browser.
- **Stage 1 state:** `PF_FIELD_HERMES_URL` / `PF_FIELD_HERMES_SECRET` are UNSET,
  so the broker **fails closed** on every call (503, empty answer, no crash, no
  fabrication). It is committed but inert until Stage 2.

---

## 1. The engine (proven)

Hermes is installed at `/home/aiciv/.hermes-venv/bin/hermes`. The configured,
running profile is **`aiciv-doctor`** (model **MiniMax-M2.7**, MiniMax API key
present). The `default` profile has NO provider configured — so all field-ops
queries MUST target the `aiciv-doctor` profile with `-p aiciv-doctor`.

> Do NOT disturb the `aiciv-doctor` **gateway** process (health monitor). The
> one-shot `-z` query below runs its own short-lived process and does not touch it.

**One-shot proof (timeboxed):**

```bash
timeout 120 /home/aiciv/.hermes-venv/bin/hermes -p aiciv-doctor --safe-mode \
  -z "You are the Pier Foundations field-crew search assistant. Using ONLY this
      approved-materials record, answer the crew's question. Record: project
      26-002 POET Bioprocessing, approved material 'IN #8 Limestone' (#8 washed,
      no fines), 30 inch diameter aggregate pier, stone supplier Rush County
      Stone Company. Question: what stone material and diameter is approved for
      project 26-002, and who supplies it?"
```

**Actual output (2026-07-28):**

> Based on the approved materials record, project 26-002 POET Bioprocessing is
> approved to use **IN #8 Limestone** (washed, no fines), supplied by **Rush
> County Stone Company**. The record does not specify a separate stone diameter —
> it notes the pier itself is 30 inches in diameter, but the stone gradation is
> listed as #8.

Coherent, grounded, and it correctly distinguished the #8 stone **gradation**
from the 30" **pier** diameter without inventing anything. **Engine verified.**

---

## 2. The local call (how a program submits a query)

There are two supported local paths. Stage 2 will use **Path A (HTTP over a
localhost-bound `hermes serve` behind a tunnel)** because the CF Pages broker
must talk HTTP to a URL. Path B (CLI) is documented for local scripting / fallback.

### Path A — `hermes serve` (HTTP/JSON-RPC on loopback)  ← Stage-2 target

```bash
# Start on loopback, NON-conflicting port (gateway/doctor is separate; serve
# defaults to 9119 — we use 9120 to avoid any collision). --isolated scopes it
# to the aiciv-doctor profile so it uses MiniMax-M2.7.
/home/aiciv/.hermes-venv/bin/hermes -p aiciv-doctor serve \
  --host 127.0.0.1 --port 9120 --isolated --skip-build
```

- Bind is **127.0.0.1 only**. Never a public/non-loopback bind in this civ.
- `--insecure` is a DEPRECATED no-op as of the June-2026 hardening (a public
  bind ALWAYS requires an auth provider). We do NOT use it. We keep loopback +
  tunnel.
- `hermes serve --status` lists running servers; `--stop` stops them. (Stage 2
  ops only — do not run `--stop` while other work depends on a server.)

`hermes serve` exposes the JSON-RPC/WebSocket backend the desktop app + remote
clients use. The precise request/response envelope for a field query is wrapped
by the broker as the field-safe contract:

- **REQUEST** (broker → Hermes):
  ```json
  { "question": "<crew question>", "role": "field_ops",
    "project_hint": "26-002", "context_scope": "field_safe" }
  ```
  Headers: `Authorization: Bearer <secret>`, `X-PF-Timestamp`, `X-PF-Signature`.
- **RESPONSE** (Hermes → broker):
  ```json
  { "answer": "<phrased answer>", "confidence": 0.9,
    "sources": [ ... ], "contains_financials": false }
  ```
  The broker relays `answer` + `sources` to the browser and NEVER relays a
  response flagged `contains_financials:true`.

> NOTE: bare `hermes serve` is the Nous/desktop backend and does not itself
> implement the `{question,...}` field contract. Stage 2 puts a thin adapter in
> front of the loopback server (or uses the `send`/agent path below) that accepts
> the field-safe request, runs the query against `aiciv-doctor`, and returns the
> field-safe response shape. That adapter is the ONLY thing the tunnel exposes.

### Path B — CLI one-shot (`hermes -z`)  ← proven, local scripting/fallback

```bash
timeout 120 /home/aiciv/.hermes-venv/bin/hermes -p aiciv-doctor --safe-mode \
  -z "<field-safe prompt with the retrieved record + the crew question>"
```

- Stdout is the plain answer text (see §1). Exit 0 = answered.
- Deterministic retrieval code (not shown here) selects the field-safe record(s)
  and builds the prompt; Hermes only phrases. No match → the prompt instructs
  "say you do not have it," so the model returns an honest "I don't have that."
- This path is used for local testing and as a no-HTTP fallback. It is NOT
  reachable from the browser.

**Auth:** none needed for the local CLI path (it runs as the `aiciv` user in the
container). The HTTP path (A) is authenticated by the Bearer + HMAC handshake the
broker sends; the Stage-2 adapter verifies it and rejects unsigned/stale requests.

---

## 3. The portal broker (built, INERT)

**File:** `functions/api/field-companion.js` (committed on `pm-nav-cleanup-20260728`).

- **RBAC:** `requireArea(session, 'field_ops')` → admin/partner/business_dev/
  field_ops. It is the crew's operational tool, **not financial**. The
  `_middleware.js` gate already 401s a session-less request; the in-function
  check is defense-in-depth.
- **Input:** `POST { query, project_hint? }`. Body capped at 4 KB, query capped
  at 1000 chars, angle brackets stripped, strict JSON → 400.
- **Outbound:** signs `ts + "." + body` with `PF_FIELD_HERMES_SECRET` (HMAC-
  SHA256, Web Crypto only — same primitive as the session signer), sends Bearer +
  `X-PF-Timestamp` + `X-PF-Signature` to `PF_FIELD_HERMES_URL`. 90s timeout via
  `AbortController`.
- **FAIL CLOSED (verified):**
  | Condition | Result |
  |-----------|--------|
  | `PF_FIELD_HERMES_URL`/`SECRET` unset (Stage-1) | `503`, `answer:""`, `ok:false` — no crash, no fabrication |
  | No/insufficient session | `403` (RBAC) |
  | Empty query | `400`, empty answer (no outbound call) |
  | Hermes unreachable | `502`, empty answer |
  | Hermes timeout | `504`, empty answer |
  | Non-2xx / unreadable body from Hermes | `502`, empty answer |
  | Backend flags `contains_financials:true` | `403`, not relayed |
  | GET request | `405`, empty answer |
  On failure `answer` is ALWAYS `""` and `ok:false` — the browser must never
  render a fabricated answer. An honest "unavailable" beats a convincing fiction.
- **`node --check`:** PASS. Behavior harness: 4/4 PASS (env-unset fail-closed,
  RBAC block, empty-query 400, GET 405).
- **NOT wired live:** `PF_FIELD_HERMES_URL` is unset, so this endpoint is inert.
  It does nothing live until Stage 2 sets the env + stands up the tunnel. The
  front-end is NOT yet swapped to call it (that is a Stage-2 step with co-verify).

---

## 4. STAGE 2 — Security design to expose Hermes (PLAN ONLY, do NOT execute)

Goal: let the Cloudflare Pages broker reach the loopback Hermes adapter over an
authenticated, least-exposure channel — with NO open inbound port on the
container and NO public bind of Hermes.

### 4.1 cloudflared named tunnel (on the PF Cloudflare account)

`cloudflared` is **NOT installed** in this container. Install + config steps:

1. **Install** the binary (static, user-space — no system service needed):
   ```bash
   curl -L -o /home/aiciv/bin/cloudflared \
     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
   chmod +x /home/aiciv/bin/cloudflared
   /home/aiciv/bin/cloudflared --version   # verify
   ```
2. **Authenticate to the PF Cloudflare account** (the same account that owns
   `pf-platform.pages.dev`; `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` are
   in `/home/aiciv/.env`). `cloudflared tunnel login` opens a browser flow — on a
   headless box use a **scoped API token / service token** instead so no browser
   is needed. Co-verify the token scope with a human before creating anything.
3. **Create a NAMED tunnel** (persistent, not a quick `trycloudflare` tunnel):
   ```bash
   cloudflared tunnel create pf-field-hermes
   # writes a credentials JSON (tunnel UUID + secret) to ~/.cloudflared/
   ```
4. **Route a hostname** to it, e.g. `field-hermes.pierfoundations.<zone>` (a
   dedicated subdomain, NOT the portal domain):
   ```bash
   cloudflared tunnel route dns pf-field-hermes field-hermes.<pf-zone>
   ```
5. **Ingress config** `~/.cloudflared/config.yml` — the tunnel forwards ONLY to
   the loopback Hermes adapter, nothing else:
   ```yaml
   tunnel: pf-field-hermes
   credentials-file: /home/aiciv/.cloudflared/<UUID>.json
   ingress:
     - hostname: field-hermes.<pf-zone>
       service: http://127.0.0.1:9120     # the loopback Hermes adapter
     - service: http_status:404           # everything else → 404 (least exposure)
   ```
6. **Run the tunnel** as a supervised daemon (this container has no systemd; use
   the existing daemon pattern — add to `tools/daemon-manifest.json` so the
   watchdog keeps it alive, health-checked by effect):
   ```bash
   nohup setsid /home/aiciv/bin/cloudflared tunnel run pf-field-hermes \
     >/home/aiciv/tools/cloudflared-field-hermes.log 2>&1 &
   ```

### 4.2 Localhost bind + tunnel (never a public bind)

- Hermes `serve`/adapter binds **127.0.0.1:9120 ONLY**. The tunnel is the ONLY
  path in; there is no open inbound port on the container/host.
- Do NOT use `--insecure` (deprecated no-op) and never bind a non-loopback host.
- Put **Cloudflare Access** (or a WAF rule) in front of `field-hermes.<pf-zone>`
  so only the PF Pages origin / a service token can reach it — the HMAC handshake
  below is the app-layer authenticator on top of that.

### 4.3 Shared-secret / HMAC handshake (already implemented in the broker)

- The broker signs `HMAC_SHA256(PF_FIELD_HERMES_SECRET, ts + "." + rawBody)` and
  sends `Authorization: Bearer <secret>`, `X-PF-Timestamp`, `X-PF-Signature`.
- The **Stage-2 loopback adapter** MUST:
  1. Reject if `|now − X-PF-Timestamp| > 300s` (replay window).
  2. Recompute the HMAC over `ts + "." + rawBody` and constant-time compare to
     `X-PF-Signature`; reject on mismatch.
  3. Verify the Bearer equals the shared secret (constant-time).
  4. Only then run the query against `aiciv-doctor` and return the field-safe
     response shape.
- Secrets live in the **CF Pages env** (`PF_FIELD_HERMES_SECRET`) and the
  adapter's local env — shared **out-of-band**, never in the browser, never in
  git. `PF_FIELD_HERMES_URL` = `https://field-hermes.<pf-zone>`.
- **Rotation:** rotate the shared secret after go-live and on any suspicion.

### 4.4 Least exposure checklist (Stage 2)

- [ ] Tunnel forwards to loopback adapter ONLY; catch-all → 404.
- [ ] Adapter serves ONLY the field-safe query contract — no other Hermes verbs.
- [ ] Field-safe store only (money stripped at ingest); output gate fails closed
      on `contains_financials`.
- [ ] Cloudflare Access / service-token in front of the hostname.
- [ ] HMAC + 300s skew + Bearer verified server-side; unsigned/stale rejected.
- [ ] Secrets out-of-band; rotate after go-live.
- [ ] Tunnel + adapter registered in `tools/daemon-manifest.json` (watchdog keeps
      alive; NEVER kills).

### 4.5 End-to-end co-verify (Stage 2, WITH a human)

1. Set `PF_FIELD_HERMES_URL` + `PF_FIELD_HERMES_SECRET` in CF Pages env.
2. Deploy the branch; confirm the auth gate still returns 401 unauthenticated.
3. Log in as a **field_ops** test user, ask a known question (e.g. "what stone is
   approved for 26-002") → expect the §1 answer, `contains_financials:false`.
4. Confirm a **financial** question (e.g. "what did we pay for stone on 26-002")
   returns a field-safe "I don't have that" — NOT a dollar value. (This is the
   critical leak test; a human must witness it.)
5. Confirm fail-closed: stop the tunnel, ask again → honest "unavailable", empty
   answer, no fabrication.
6. Rotate the demo/build secret. Then, and only then, call Stage 2 done.

---

## 5. Safety confirmations (Stage 1)

- Nothing exposed publicly. No tunnel, no non-loopback bind, no `--insecure`.
- No running process killed, restarted, or disturbed — the `aiciv-doctor`
  gateway, `claude`, `peter`, `daemon_watchdog`, `watchdog_heartbeat`,
  `portal_server` were left untouched. The only Hermes process spawned was the
  short-lived, timeboxed `-z` one-shot for the §1 proof (it exits on its own).
- Only new file committed: `functions/api/field-companion.js` (+ this doc). No
  deploy of a wired-live endpoint; env unset → inert + fail-closed.

---

## 6. STAGE 2 EXECUTION — STOPPED AT AUTH-FIRST GATE (2026-07-28)

Stage 2 was GREEN-LIT (Melanie). I began auth-first and **STOPPED before creating
any tunnel or starting `hermes serve`** because the approved least-exposure design
cannot be built securely with the credentials available. No process was disturbed;
cloudflared was NOT installed; no tunnel, no env, no portal change.

### What the `CLOUDFLARE_API_TOKEN` in `/home/aiciv/.env` CAN do (probed live)
- Account visible: **`Peter@pierfoundations.com's Account`** (`9eb5ec52...`).
- **Cloudflare Tunnel:** list/create — OK (`cfd_tunnel` returns success, 0 existing).
- **Pages:** read/write — OK (sees `pf-platform` + 8 others; can read prod env vars,
  so setting `PF_FIELD_HERMES_URL` / `PF_FIELD_HERMES_SECRET` later is NOT a blocker).

### What it CANNOT do — the two blockers
1. **No zone / no custom domain.** `zones` list returns **0**. `pf-platform` has only
   `pf-platform.pages.dev` — there is no custom zone on this account. Without a zone,
   `cloudflared tunnel route dns` cannot bind a named hostname
   (e.g. `field-hermes.pierfoundations.<zone>`). The only public URLs reachable
   without a zone are a `trycloudflare.com` quick tunnel (DISALLOWED by this design —
   ephemeral, unauthenticated) or a raw `<uuid>.cfargotunnel.com` that still needs a
   route we cannot create.
2. **No Cloudflare Access scope.** `access/apps` returns `Authentication error` — the
   token has no `Access:Edit`/`Read`. The design's network-layer gate (Cloudflare
   Access in front of the hostname) **cannot be provisioned** with this token.

Because the mandate is *"never expose Hermes without the auth layer active; if any
step cannot be done securely or needs a human/browser step, STOP and report,"* I
stopped. Forcing a public tunnel without the Access gate — or a `trycloudflare`
quick tunnel — would violate the least-exposure design.

### EXACT human step / credential needed to proceed
Provide ONE of the following (in order of preference):

**Option A — scope the existing token (or issue a new one) with the missing grants:**
   - **Cloudflare Tunnel: Edit** (already have)
   - **Access: Apps and Policies: Edit** (MISSING — for the Access gate)
   - **DNS: Edit** on a **zone**, AND a **zone must exist** on the account for the
     tunnel hostname (MISSING — there is currently NO zone).
   → i.e. a real domain/zone (even a subdomain delegation) must be added to the
     `Peter@pierfoundations.com` Cloudflare account, plus DNS + Access scopes.

**Option B — a human runs the one-time interactive bind in the Cloudflare dashboard:**
   1. Add a zone (domain) to the account, or confirm one to use.
   2. Create the named tunnel `pf-field-hermes` and its `cfargotunnel` route to the
      chosen hostname (dashboard "Connect an application" flow).
   3. Create a **Cloudflare Access** application on that hostname (service-token or
      SSO policy) so unauthenticated hits are blocked at the edge.
   4. Hand back: the tunnel **credentials file** (or token), the **hostname URL**,
      and the **Access service-token** — then I finish 2–5 automatically and run the
      full a–e verification (incl. the financial-leak hard gate).

**Note on the app-layer auth already built:** `functions/api/field-companion.js`
already signs Bearer + HMAC-SHA256(secret, `ts.body`) with 300s skew. That is the
APPLICATION gate and is ready. It is complementary to — not a replacement for — the
Cloudflare Access NETWORK gate the design requires, and it also needs a Hermes-side
verifying adapter (bare `hermes serve` does not implement the `{question,...}`
field contract or verify our HMAC). Both the network gate (blocked above) and that
adapter remain for Stage 2 once a zone + scopes are provided.

**STATUS: Stage 2 BLOCKED on Cloudflare account setup (zone + Access/DNS scope).**
Nothing exposed. Awaiting the human credential/step above before proceeding.
