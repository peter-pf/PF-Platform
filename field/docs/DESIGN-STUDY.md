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

---

## Round 4 Study — Tally, Typeform, Raken
**Commissioned by:** Derek (10/21 15:52Z) — "Build our daily report like Tally, give it Typeform-level typography and polish, but organize the actual information like Raken."

---

### Tally — Document-style form feel

Tally positions itself as "a form builder that works like a text document." The core visual idea is that filling in a form should feel as natural as editing a Notion page or a Word document. Key observations:

**Whitespace as structure.** Tally uses vertical rhythm heavily. Each question block gets roughly 24–32px above and below it. There are no harsh divider lines between questions — breathing room alone creates the visual break. The form feels airy, not cramped.

**No card borders.** Most form builders wrap each section in a visible box. Tally does not. The background is a single uniform white. Sections are visually distinct only through spacing and optional light-gray fill on the question block itself. The result is a form that looks like a document page, not a database entry screen.

**Clean label typography.** Labels sit directly above their inputs (no hanging labels, no floating placeholders replacing labels). Label text is 12–13px, medium weight, dark gray — readable but subordinate. The input value text is larger (15–16px) and full-weight, so what the user types is visually dominant over the prompt.

**Focus is a quiet signal.** In Tally, the focused field shows a 2–3px left accent bar or a subtle blue border. No aggressive shadow rings. The effect says "you are here" without shouting it.

**Takeaway for PF:** Remove section card borders. Use generous padding (20–24px vertical) to separate form sections. Let whitespace do the work. Labels stay small and uppercase-tracked above each field.

---

### Typeform — Typographic polish and smooth interaction

Typeform's signature is conversational form design — one question at a time with a smooth transition. We cannot adopt the one-at-a-time model for a daily report (field crew needs to scan the whole form), but the typographic and interaction principles apply directly.

**Type scale is decisive.** Section headers are 16–18px, weight 700 or 800. Field labels are 11–13px, weight 600, uppercase, letter-spaced. The contrast between section heading and field label creates an immediate hierarchy so the user's eye knows exactly where they are in the form.

**Progress is visible and honest.** Typeform shows a thin (3–4px) progress bar at the top of the viewport. It fills based on how many questions have been answered. The bar gives users a sense of how much work remains — critical for a long daily report that a crew member needs to complete at end of day when they are tired.

**Buttons feel real.** Typeform's primary buttons have a filled background, rounded corners, and a subtle scale/shadow on hover. There is never ambiguity about what to click. Secondary actions are ghost/outline. The visual hierarchy of the button row matches the hierarchy of importance.

**Transitions are short and purposeful.** Input border-color transitions at ~150ms. Button background transitions at ~150ms. Focus ring appears in ~100ms. Nothing is animated for decoration — every transition confirms that the UI responded to the user.

**Takeaway for PF:** Add a slim 3px progress bar above the form. Use Inter 700 at 16px for section headings with a numbered badge. Use 11px uppercase tracked labels. Add 150ms transitions on all inputs and buttons.

---

### Raken — Section organization built for the field

Raken is the most-used daily reporting app in US construction. Its section order is the industry standard and maps directly to how contractors think through their day. Every experienced foreman recognizes this structure without being taught it.

**Standard Raken section order:**
1. Overview / Header (project, date, weather, temperature, superintendent/foreman)
2. Production numbers (units installed, linear feet, quantities)
3. Work performed (narrative of what actually happened)
4. Crew and timecards (who was on site, hours, cost codes)
5. Equipment (owned machines, rentals, operating hours)
6. Delays and issues (weather, material, subcontractor, owner)
7. Safety observations and incidents
8. Photos, files, attachments
9. Signature / superintendent sign-off

**Why this order works:** It follows the mental sequence a foreman uses to close out their day. They start with "where was I and what was the weather" (context), move to "what did we produce" (the boss's first question), then "who was here and what did they do" (timesheets), then "what went wrong" (delays), and finally "sign and submit." Reading bottom-to-top is the exception, not the norm; this order matches natural recall.

**Section breaks are visual anchors.** Raken uses a card-per-section on mobile — each section is a self-contained block with a bold header, add-row controls at the bottom, and a clear divider before the next section. Desktop shows the same layout with more columns.

**Crew rows are the heart of the report.** Raken's crew timecard UI is prominent — larger than the notes sections — because payroll depends on it. Errors in crew hours cost money. The rows are spacious, with large touch targets for the time inputs.

**Takeaway for PF:** Adopt the Raken section order exactly. Move "Columns / LF installed today" and "Work completed" up to follow Overview directly (Production & Work section). Crew comes third. Equipment fourth. Delays and safety fifth and sixth. Files last. This matches what a PF foreman actually thinks about in sequence.

---

### Synthesis — What we built in Round 4

The three platforms each solve a different problem. Raken solves organization (the right sections in the right order). Tally solves visual feel (document-style, no card clutter). Typeform solves polish and feedback (type scale, progress, transitions).

**Applied to PF daily-report.html:**

- **Section structure:** 7 named sections following the Raken sequence, each with a numbered badge, bold header, collapsible body (desktop only, open by default), and a clear border-bottom separator.
- **Progress indicator:** 3px bar above the form, filled based on how many sections have content. Gives the field crew a visible "almost done" signal.
- **Jump list:** Desktop-only horizontal link row above the sections. Each link anchors to its section. The active section is highlighted as the user scrolls.
- **Typeform typography:** Section headings at 16px/700. Field labels at 11px/700 uppercase with 0.5px letter-spacing. Input font-size unchanged (15px). All transitions set to 150ms.
- **Tally whitespace:** Removed the wrapping `.dr-card` border from the form. Each section uses `padding: 20px 0 24px` with a 1px `border-bottom`. The form breathes.
- **Focus states:** `box-shadow: 0 0 0 3px rgba(0,109,176,.15)` on focus (Typeform-style, slightly wider than the old 2px ring).
- **Section-done badge:** When a section has content, its numbered badge fills to solid accent blue — a quiet Typeform-style completion signal.
- **Collapsible sections on desktop:** Each section header has a chevron toggle button (visible only ≥900px). All sections open by default. This lets a desktop user collapse filled sections and focus on what remains.
- **Applied lightly to site-readiness.html and home tiles:** Same CSS tokens, same label style, same input focus — no logic changes.
