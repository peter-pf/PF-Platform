# Field Portal Design Study
**Sources:** Apple Human Interface Guidelines (iOS 17), Google Material Design 3, Procore/Fieldwire/Raken public documentation and interface references.
**Date:** 2026-10-21

---

## Summary for Derek

The three design systems (Apple HIG, Material Design 3, top construction apps) all converge on the same fundamentals: white by default, brand color used selectively for action, clear back-navigation as a text link not a button, and 44px minimum touch targets. Every principle below has a direct change made in this commit.

---

## Principle 1 — White is the default, not a preference

**What the leaders do:** Apple's light mode is white or near-white (#F2F2F7) across all native apps. Material 3's light scheme uses Surface = #FFFBFE. Procore's app launches to a clean white dashboard. The dark background on a construction-site tool actively fights readability in daylight.

**What we changed:** Converted all three form pages (daily-report, site-readiness, past-reports) from dark-first to light-first. The CSS `:root` now defines light tokens; dark mode applies only when the user opts in via localStorage. Login and home were already light and are now fully harmonized.

---

## Principle 2 — Dark mode belongs to the user, not the designer

**What the leaders do:** Apple and Google both honor the user's system preference AND allow in-app overrides. Material 3 calls this "dynamic color scheme." Neither platform forces a dark interface by default unless there's a compelling reason (e.g., a map or video app).

**What we changed:** Added a sun/moon toggle button (44px tap target, aria-labeled) to the top-right of every page header. State persists via localStorage wrapped in try/catch so a corrupted storage entry does not crash the app. A tiny inline script in `<head>` sets `data-theme="dark"` on `<html>` before the body renders, eliminating any flash of the wrong theme.

---

## Principle 3 — Navigation is text, not a button

**What the leaders do:** iOS navigation bars show the parent screen's title as a plain text link on the left, preceded by a single left-angle chevron (‹). No border, no background, no pill shape. Material 3's "Navigation up" button is an icon (←) with no chrome. Procore uses breadcrumb text: `Projects › Hanley › Daily Log`. Fieldwire uses a bare chevron + label. None of them box the back link inside a bordered button.

**What we changed:** Removed the `.home-btn` pill (bordered, background-colored, felt like an action) from all sub-pages. Replaced with `‹ Home` as a plain anchor styled to match the PF accent color — text link, no border, no background. Added a separator `|` and the page title so orientation is clear. The PF mark on the home page now wraps in an anchor to `/` for consistent brand-as-home-link pattern.

---

## Principle 4 — Touch targets are 44px minimum, no exceptions

**What the leaders do:** Apple's documented minimum is 44x44 points. Google's is 48x48dp. Both are enforced in accessibility guidelines and App Store review for Apple. A 12px pill button with 5px padding is roughly 22px tall — half the minimum.

**What we changed:** The theme toggle button is explicitly 44x44px. The back-nav link has `min-height: 44px` and comfortable horizontal padding. Primary action buttons (`.btn`) already met this bar and were left alone.

---

## Principle 5 — Elevation and depth replace harsh borders

**What the leaders do:** Material 3's Surface Container levels use subtle shadows rather than 1px divider lines. Apple uses a hairline separator + translucency on the nav bar. Both create visual hierarchy without visual clutter.

**What we changed:** Added `box-shadow: 0 1px 4px rgba(0,0,0,.06)` to all topbars in light mode. Kept the `border-bottom` as a fallback. In dark mode the border alone is sufficient since the surface colors themselves create the boundary.

---

## Principle 6 — Status semantics only; no decorative color

**What the leaders do:** Apple's Human Interface Guidelines state: "Use color to communicate information, not just to add decoration." Material 3 reserves brand accent for one primary action per screen. Procore uses green/amber/red exclusively for status chips (READY, IN PROGRESS, OVERDUE) — never for heading text or card backgrounds.

**What we changed:** Confirmed the PF accent (#006DB0) is used only for primary actions and status items. Adjusted badge text colors so they remain legible on the now-white background: dark-theme badge text (light #5bc8ff) becomes the proper accent color in light theme. Section heading colors use `--accent` not `--accent-light` in light mode where the light color would be near-invisible.

---

## Principle 7 — Language reflects capability, not restriction

**What the leaders do:** Apple's HIG dedicates a section to "User Trust" — phrasing that implies the app is doing something FOR the user, not LIMITING them. Procore's onboarding copy never mentions what the app does not show. Fieldwire's UI labels describe features, not absences.

**What we changed:** Removed "Operational tools — no financial data here." from the home page greeting. Removed "Field view — operational data only. No financial information is shown here." from the home page footer. Removed "No financial data is collected or displayed here." from the daily report intro card. The portal describes what it does; it does not apologize for what it does not do.

---

## Principle 8 — Consistent chrome across all pages

**What the leaders do:** Every iOS app has the same nav bar height, same padding, same typography. Users do not notice it; that is the goal. Inconsistency breaks the mental model — you sense something is off even when you cannot name it.

**What we changed:** Unified the topbar pattern across all five pages. Same height, same padding (10px 16px), same sticky positioning, same z-index 100. Home page previously had a fully dark hardcoded topbar while the rest of the page was light — now the topbar inherits from the same CSS token set as every other page.

---

## Principle 9 — Safe area insets for modern mobile hardware

**What the leaders do:** iOS devices since iPhone X have a home indicator at the bottom that overlaps scrollable content. Android has similar gesture bars. Procore and Fieldwire both set `padding-bottom: env(safe-area-inset-bottom)` on their body or main scroll container.

**What we changed:** Added `padding-bottom: max(24px, env(safe-area-inset-bottom))` to `#main` on all form pages so the submit button is never obscured by the iOS home indicator. Also retained the existing `padding-top: max(11px, env(safe-area-inset-top))` on topbars.

---

## Principle 10 — Semantic input backgrounds for hierarchy

**What the leaders do:** In light mode, Apple uses system-grouped background (very light gray, ~#F2F2F7) for page background and white for cards and input fields. This three-level hierarchy (page → card → input) instantly communicates structure without drawing lines everywhere.

**What we changed:** Light mode now uses `--surface: #F8FAFC` (page), `--surface-2: #FFFFFF` (cards, topbar, inputs), `--surface-3: #F3F5F8` (secondary controls). The hierarchy is subtle but present.

---

## Principle 11 — Form inputs must register as interactive

**What the leaders do:** In light mode, Material 3 uses `surfaceVariant` (#E7E0EC) as input background, which contrasts with the white card behind it. Apple uses a filled text field style where the background tints slightly from white. Both approaches ensure inputs do not look like static labels.

**What we changed:** In light mode, form inputs get `background: var(--surface-3)` (#F3F5F8) — a step back from the card white — so they read as fillable fields, not flat text. Focus state uses the existing accent blue ring.

---

## Principle 12 — No flash of wrong theme on load

**What the leaders do:** This is a PWA/web-specific concern. Native apps never flash because the OS knows the color scheme at launch. For web apps, a tiny synchronous script before the first paint that checks localStorage and sets the theme attribute is the universal solution. Next.js, Remix, and the Material Web Components all use this pattern.

**What we changed:** Added a minimal inline `<script>` in `<head>` (after the `<style>` block) to each page. It reads `localStorage.getItem('pf-theme')` and sets `document.documentElement.setAttribute('data-theme','dark')` if the user has previously chosen dark. Wrapped in try/catch. Runs before the body renders — no flash, no JavaScript framework needed.

---

## Additional Recommendations (Not Implemented in This Commit)

The following are improvements worth a future sprint — held back because they touch form logic or require design decisions beyond pure presentation:

**Bottom tab bar on mobile:** Apple and Material 3 both recommend bottom navigation for primary destinations on mobile (not a top nav). For a field app used with gloved hands, bottom-reachable tab icons for Home / Daily Report / Site Readiness / Past Reports would significantly reduce reach distance. Requires a layout restructure.

**Larger project picker:** The `<select>` element for project selection is the first and most critical interaction. Procore and Fieldwire both replace native selects with full-page search-and-filter overlays on mobile. On a small screen, a long project dropdown is error-prone. A searchable modal picker would be a high-impact improvement.

**Haptic feedback on submit:** Procore and Raken both fire a short haptic on successful form submission. Web apps can call `navigator.vibrate(50)` after a successful POST. One line of code; significant field usability.

**Offline-capable draft saving:** Raken's core competitive advantage is offline-first. Field sites have poor cellular coverage. Service worker + IndexedDB draft caching would allow the crew to fill out reports and submit when they regain signal. Architecture change, not just presentation.

**Sticky submit button:** On daily-report and site-readiness forms, the submit button is at the bottom of a long scrollable form. Procore pins the primary action button at the bottom of the viewport. On mobile this means the user never has to scroll to submit.
