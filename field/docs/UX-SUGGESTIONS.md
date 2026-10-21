# Field Portal UX Suggestions

Audience: crew operators on phones at job sites. Poor signal, dirty gloves, outdoor glare.

---

## 1. Offline / poor-signal draft caching (localStorage fallback)

The current draft persistence is server-side via D1. When a crew member is in a basement or at the edge of a site with no signal, the Save Draft call will fail silently and the form data is lost on page reload.

**Suggestion:** mirror every draft save to `localStorage` keyed by `dr_draft_<projectId>_<date>` (or a fixed `dr_draft_active`). On page load, if no server draft is found, offer to restore the local copy. Show "Saved locally" when offline and sync automatically once signal returns.

---

## 2. Today's date auto-filled, project pre-selected from last session

Crew members start a new report every single day for the same project. Requiring them to manually re-select the date and project is friction they feel 250+ times a year.

**Suggestion:** auto-fill the report date to today on form load. Store the last-used project in `localStorage` and pre-select it. Both fields remain editable. This alone cuts the first 5 seconds of every form.

---

## 3. Oversized tap targets for all interactive controls (48px minimum)

The current select dropdowns and file inputs render at browser default height, which on many Android phones is under 36px. Gloved fingers and outdoor glare make this error-prone.

**Suggestion:** enforce `min-height: 48px` on all `<select>`, `<input>`, and `<button>` elements in the field portal CSS. Match Apple HIG and Material Design tap-target minimums. This is a 3-line CSS change with zero design downside.

---

## 4. Weather auto-fill from device location

The "Weather" and "Temp" fields require manual entry. Every operator knows it is raining, but typing "Rain, 44F" on a phone keyboard mid-task is annoying.

**Suggestion:** add a small "Get weather" button next to the precipitation/temp fields. Use the browser Geolocation API to get coordinates, then call a public weather API (e.g., Open-Meteo, which is free and requires no key) to return current conditions. Pre-fill the fields with the result. Operator can override. Reduces a pain point and improves data accuracy.

---

## 5. Recent-activity summary strip on the home screen

The home screen shows three tiles but gives no indication of whether today's report has been filed or when the last one was submitted.

**Suggestion:** below the tiles, add a compact "recent activity" row showing the last 2-3 entries from `/api/past-reports`: date, project, form type, and status (e.g., "10/21 - DFS Grain Bins - Daily - Sent"). This gives crew a quick sanity check that their submissions landed and tells a foreman at a glance what was filed today.

---

## 6. Crew list auto-populated from project assignment

Right now, crew names are freeform dropdown selects from the full personnel list. On a site with 12 people and a phone in one hand, scrolling a long list is error-prone.

**Suggestion:** tie each project to an assigned crew list in the metadata sheet (or a separate field). When a project is selected, pre-populate the crew rows with the expected crew for that job. Operators remove/add as needed. Fewer taps, fewer misspellings.

---

## 7. "Copy yesterday's report" shortcut

Production data (crew, equipment on site, cost codes) is nearly identical day-over-day on a long run. Operators re-enter the same 10+ rows every day.

**Suggestion:** add a "Copy previous day" button that loads the most recent submitted report for the same project into the form, clearing date-specific fields (columns, LF, delays, safety, work notes) and files but keeping crew, equipment, and cost codes. One tap saves 3-5 minutes per report.

---

## 8. PDF preview before submit

Operators currently submit blind and receive the PDF only via email, sometimes after spotting a typo. On a phone there is no easy way to proof before sending.

**Suggestion:** add a "Preview PDF" button that posts the form data to a `/api/daily-report/preview` endpoint (same PDF generation, no D1 write, no email) and returns a data-URL or object URL in a new tab. Even a minimal preview that shows the header, crew table, and production numbers would catch the most common errors.

---

## 9. Big-button confirmation before send (prevent accidental submit)

The "Submit & send report" button is adjacent to "Save draft" with only 8px of gap. On a bumpy truck ride, operators have reported accidentally submitting incomplete reports.

**Suggestion:** replace the immediate submit action with a confirmation sheet (a native `<dialog>` element or a simple overlay) showing: "Send report for [Project] on [Date] to [recipient count] recipient(s)?" with a large green Confirm button. One extra tap prevents a support call.

---

## 10. Pinch-zoom re-enable for photo review

The viewport meta tag uses `maximum-scale=1.0`, which disables pinch-zoom on iOS. This is intentional to prevent accidental zoom in form fields, but it means operators cannot zoom in to verify a photo they just attached.

**Suggestion:** allow zoom only on the photos section by removing `maximum-scale=1.0` from the meta tag (browsers have improved their auto-zoom suppression on form inputs) or by using a separate lightbox `<dialog>` for photo review that temporarily re-enables zoom. Operators in the field need to confirm a grade stake photo is legible before submitting.
