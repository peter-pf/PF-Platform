# Software Requirements Specification: In-Platform Onboarding & Documents

**Project:** Pier Foundations -- PF Operations Platform (onboarding & embedded documents)
**Version:** 1.0
**Date:** June 4, 2026
**Prepared by:** Peter (AI COO)

---

## Implementation Status: Built, deployed, and verified June 4, 2026.

## 1. Overview

A documentation and onboarding layer inside the PF Operations Platform so the team can reach every reference document, onboard by role, and see Peter's knowledge coverage -- all without leaving the platform. Built per Brad's direction that all documents open in-platform (no external tabs) and that onboarding materials exist at different levels for staff (incl. Derek).

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| DOC-1 | All Documents-section links open INSIDE the platform (embedded), never as external tabs/new windows | DONE |
| DOC-2 | Same-origin protected docs (User Manual, Training, QuickBooks, COO Checklist, Cheat Sheet, Onboarding) render via the live session -- no second login/password prompt | DONE |
| DOC-3 | External report sites (SOP Additions, Alpha Review, Sprint Reports) embed in-platform | DONE |
| DOC-4 | Embedded docs lazy-load on first view (initial platform load stays light) | DONE |
| ONB-1 | A "Meet Peter" one-pager exists -- a single shareable page describing who/what Peter is, what he does, how to work with him | DONE |
| ONB-2 | Role-level onboarding hub with tabs for Executive, Estimating & Ops, Business Development, Admin/Office -- each with home-base modules, common asks, and limits | DONE |
| ONB-3 | COO Knowledge Checklist -- interactive, 87 items across 15 domains, each tagged Known/Partial/Need, clickable with saved progress + filters | DONE |

## 3. Non-Functional Requirements

- **No external navigation:** users never leave the platform page to read a document.
- **No spurious auth prompts:** embedded protected docs must not trigger the browser's Basic-Auth dialog (see design note below).
- **Consistent light theme:** monochrome + amber accent, clean, aligned (Brad's design preferences).
- **Performance:** documents load on demand, not all at page load.

## 4. Design Notes

- **Static docs** are fetched with `credentials: 'same-origin'` and rendered via `iframe.srcdoc` -- the frame makes no independent authenticated request, so no Basic-Auth dialog can appear inside the platform.
- **Interactive tools** (COO Checklist) load via real `iframe.src` so their `localStorage` (saved check state) works on the platform origin; the live session cookie authenticates the request.
- **External open sites** use plain `iframe.src`.
- All wired through the platform's `showModule()` system with `moduleTitles` entries and sidebar nav items.

## 5. Verification Evidence (June 4, 2026)

Headless (Playwright) against the live deployment, logged-in session:

| Test | Result |
|------|--------|
| Click User Manual -> stays in platform (URL unchanged), 0 new tabs, manual renders embedded | PASS |
| Manual/Training/QuickBooks render via srcdoc, 0 native password dialogs | PASS |
| External (Alpha Review) embeds and renders in-platform | PASS |
| COO Checklist renders: 15 categories, 87 items, progress (27 known / 24 need), no prompt | PASS |
| Cheat Sheet + Onboarding render in-platform; onboarding 4 role tabs functional | PASS |

## 6. Files

- `platform/index.html` -- sidebar nav, module-views, lazy-load logic, moduleTitles
- `platform/manual.html`, `platform/training.html`, `platform/quickbooks-guide.html`
- `platform/peter-cheatsheet.html`, `platform/onboarding.html`, `platform/coo-checklist.html`
