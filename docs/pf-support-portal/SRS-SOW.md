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
  assets/
    style.css         # Shared stylesheet (brand azure #006DB0, light theme, mobile-first)
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
