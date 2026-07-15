# Installable Web App (PWA) — PF Platform

**Shipped:** 2026-07-15. **Owner:** Peter (COO). **Requested by:** Derek (portal on phone as an app).

## What this is
The portal is now an **installable web app**. On a phone, a user opens the portal and chooses **Add to Home Screen**. They get a PF app icon that launches the portal **full screen** (no browser bars), looking and behaving like a native app. This is the interim "use it now" option while the PureBrain team builds a full native app.

## How it works (no service worker, by design)
- `platform/manifest.webmanifest` — app name, colors (theme `#1F6FB2`), icons, `display: standalone`, `start_url: /`.
- `platform/icons/` — `apple-touch-icon.png` (180, iOS home screen), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (Android adaptive), `favicon-32.png`. Azure rounded square, white "PF".
- Head tags added to `index.html` and `login.html`: manifest link, `theme-color`, `apple-touch-icon`, and the `apple-mobile-web-app-*` / `mobile-web-app-capable` meta tags that give the full-screen home-screen behavior.
- **No service worker.** iOS Add-to-Home-Screen does not require one, and skipping it avoids any risk of caching auth-gated data. Android manual add-to-home-screen still works; only the automatic install banner (which needs a SW) is not shown.

## RBAC / security
- No middleware or gate change. `/icons/` is already an allowed static-asset prefix and `.webmanifest` is an allowed static extension in `functions/lib/auth.js`, so both classify as `general` (reachable by all logged-in roles). The manifest and icons contain no sensitive data (app name, colors, PF logo).
- The app still opens to the login gate; installing it changes nothing about authentication or role access.

## Install steps (for users)
**iPhone (Safari):** open the portal, tap Share, tap **Add to Home Screen**, tap Add.
**Android (Chrome):** open the portal, tap the menu, tap **Add to Home screen** / **Install app**.

## Verification
`curl` the live `/manifest.webmanifest` (200, valid JSON), `/icons/apple-touch-icon.png` (200, image/png), and confirm `index.html` / `login.html` still render. Done post-deploy.
