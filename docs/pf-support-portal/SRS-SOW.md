# PF Support Portal — SRS / SOW

**Status:** LIVE (deployed 2026-07-21)
**Live URL:** https://pf-support.pages.dev/
**Source:** `pf-support/` in repo `peter-pf/PF-Platform`, branch `website-build-20260609`
**Owner:** web-dev
**Audience:** Brad (CEO), Jonathan (Estimating), Derek (BD) — non-technical readability is the priority

---

## 1. What this is

A small, standalone, expandable "PF Support" help portal. Plain-language guides for the
Pier Foundations team. It launches with one help topic ("If Peter Seems Stuck") and is
built so new topics can be added trivially over time.

## 2. Architecture decision — fully static, independent of Peter's server (CRITICAL)

This portal is a **pure static site** (HTML + CSS + SVG). It has:

- **ZERO runtime dependency on Peter's machine or any backend.**
- **No API calls, no server-side rendering, no login gate, no JavaScript at all** (verified: 0 `<script>` tags on every page).
- It is hosted on **Cloudflare Pages**, served entirely from Cloudflare's edge.

**Why:** The whole point of this portal is that it stays up *exactly when Peter is down*.
The primary article tells the team what to do if Peter is stuck — so it must remain
reachable even if Peter's machine is completely offline. A static edge-hosted site
guarantees that. Do not add any dependency on Peter's server, ever.

## 3. Structure

```
pf-support/
  index.html          # Landing page: title, intro, grid of topic cards
  peter-stuck.html    # Article 1: "If Peter Seems Stuck" (from PETER-CHEAT-SHEET-BJD.md)
  compact-peter.html  # Article 2: "How to Compact Peter" (Compact vs Restart; /compact from terminal)
  assets/
    style.css         # Shared stylesheet (brand azure #006DB0, light theme, mobile-first). Includes inline <code> style for /compact.
    pf-wordmark.svg   # PF wordmark logo (copied from website/assets/brand)
```

- **Topic pattern:** the landing page is a grid of `.topic-card` links. Each topic = one card
  linking to one article HTML page. This keeps adding topics trivial (see section 6).
- **Article pattern:** each article page reuses `assets/style.css`, has a header with the logo
  (links home), a breadcrumb back to all topics, an `.article` card body, and a footer.
- **Brand:** azure `#006DB0` primary on a clean light theme. No traffic-light colors, no clutter.
  Big headings, generous spacing, scannable. Fully mobile-responsive (`@media max-width:640px`).

## 4. Content source of truth

Article 1 renders the full content of `/home/aiciv/to-brad/PETER-CHEAT-SHEET-BJD.md` —
symptoms, the one fix (Restart button), what does NOT help, the Witness Support contact
(`witness-support@agentmail.to` as a clickable `mailto:` link), and the prevention section.
If that cheat sheet changes, update `pf-support/peter-stuck.html` to match.

## 5. Deploy

Cloudflare Pages project: **pf-support** (production branch `main`).

```bash
# Export the CF token (plain `source` does NOT export — must use set -a)
set -a; source /home/aiciv/.env; set +a
export CLOUDFLARE_ACCOUNT_ID

# Stage a clean copy and deploy FROM INSIDE the asset dir
rm -rf /tmp/pf-support-deploy && mkdir -p /tmp/pf-support-deploy
cp -r /home/aiciv/PF-Platform/pf-support/* /tmp/pf-support-deploy/
cd /tmp/pf-support-deploy
npx wrangler pages deploy . --project-name=pf-support --branch=main --commit-dirty=true
```

Note: Cloudflare Pages serves `foo.html` at the clean URL `/foo` (a 308 redirect from
`/foo.html`). This is normal and harmless — card links using `foo.html` still land correctly.

**Verify (mandatory) after every deploy:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pf-support.pages.dev/            # expect 200
curl -sL -o /dev/null -w "%{http_code}\n" https://pf-support.pages.dev/peter-stuck.html  # expect 200
curl -s https://pf-support.pages.dev/peter-stuck | grep -c "witness-support@agentmail.to" # expect >=1
```

## 6. HOW TO ADD A NEW HELP TOPIC (the pattern)

Adding a topic is two small steps — no build tools, no framework:

1. **Create the article page.** Copy `pf-support/peter-stuck.html` to a new file
   (e.g. `pf-support/how-to-x.html`). Change the `<title>`, the `<h1>`, and the body
   content. Keep the header, breadcrumb, and footer as-is. Use `<h2>` for section headings,
   `.callout` for a highlighted "do this" box, and `.contact` for a contact block.

2. **Add a card on the landing page.** In `pf-support/index.html`, copy the
   `<a class="topic-card">…</a>` block (there's an "ADD NEW TOPICS HERE" comment marking
   the spot), point its `href` at your new page, and update the icon, title, and one-line
   description.

Then redeploy (section 5) and re-verify. That's it.

## 7. Verification evidence (2026-07-21 deploy)

- `https://pf-support.pages.dev/` → HTTP 200
- `https://pf-support.pages.dev/peter-stuck` → HTTP 200, 4334 bytes
- `witness-support@agentmail.to` present ×2, `Restart button` present ×4, `mailto:` link present
- `assets/style.css` → 200, `assets/pf-wordmark.svg` → 200
- 0 `<script>` tags on all pages → confirmed fully static / independent of Peter's server
- Mobile viewport meta + `@media (max-width:640px)` responsive rules live

## 8. Topic 2 — "How to Compact Peter" (added 2026-07-21)

- File: `pf-support/compact-peter.html`, linked from a second topic card on `index.html`.
- Content: what compacting is, a highlighted **Compact or Restart?** callout (slow-but-answering → Compact/Restart button; fully stuck → Restart, links to the peter-stuck article), portal instructions (Restart button is the portal-accessible relief), terminal instructions (`/compact` in the tmux session, rendered in monospace `<code>`), and a note that Peter compacts himself proactively.
- Added a global inline `code { … }` rule to `assets/style.css` for the monospace `/compact` styling.
- Verification (2026-07-21): `/compact-peter` → 200; body contains `/compact` (×2), `Compact or Restart` (×1), and literal `<code>/compact</code>`. `index.html` now links `compact-peter.html` and still links `peter-stuck.html`.

## 9. Main-portal integration — Help / Support nav link (added 2026-07-21)

- **Where:** `platform/index.html`, sidebar nav **Estimating & Tools** section, immediately after the "Content Board" external link (~line 2547). Follows the same external-new-tab pattern as Design Studio / Content Board.
- **Markup:** `<a class="nav-item" href="https://pf-support.pages.dev/" target="_blank" rel="noopener noreferrer">` with a `❔` icon, label "Help / Support", and the `↗` external-tab indicator.
- **Independence:** it is a plain external anchor straight to the standalone static pf-support site. It does NOT route through Peter's backend or any `/api/*` — so it keeps working when Peter is down (which is the whole point). Given as a normal-color nav item (not the red data-source overlay) because it is a genuine always-working external link.
- **Surgical:** single anchor added; the single-login shell (Basic Auth gate) and all existing nav items are untouched.
- Verification (2026-07-21): `pf-platform` deploy compiled Worker successfully + Functions bundle uploaded; prod root returns `401` Basic-Auth realm "PF Operations Platform" (gate intact, expected); `/login.html` → 308 (login page still public, shell not broken); the Help anchor with `target="_blank"` + `href="https://pf-support.pages.dev/"` confirmed in the deployed `platform/index.html` (line 2547).
