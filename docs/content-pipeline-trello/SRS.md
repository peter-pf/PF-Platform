# Content Pipeline (Trello) — Software Requirements Specification (SRS)

**Module:** Content Pipeline / Trello integration (Trello board + portal launch button)
**Version:** 1.0
**Date:** 2026-06-16
**Owner:** Peter (AI COO)
**Status:** Complete (Phase 1) — board built; credentials stored; portal launch wired.

---

## 1. Purpose
Give Pier Foundations a single, visible pipeline for social-media content — from idea to drafted to approved to posted — with an explicit approval gate so nothing goes public without sign-off. Trello is the workflow surface; the portal links to it.

## 2. Scope
- A Trello board, **"Social Media Pipeline"** (`https://trello.com/b/qh7giGys`), as the content workflow.
- Stored Trello API credentials (`TRELLO_API_KEY` / `TRELLO_TOKEN`) for future programmatic access.
- A portal launch button in the sidebar **Tools** section ("Content Board"). Trello cannot be iframed, so the button opens the board in a new tab.

## 3. Workflow / Data model
- **Lists (stages, left to right):**
  1. Ideas & Backlog
  2. Drafting
  3. Needs Approval  ← the approval gate
  4. Approved & Scheduled
  5. Posted
- **Labels (platform):** LinkedIn, Facebook, Instagram, Bluesky, X.
- **Card = one piece of content.** A card moves left-to-right through the lists; platform label(s) tag where it will post.

## 4. Functional requirements
1. Capture content ideas and route them through Drafting -> Needs Approval -> Approved & Scheduled -> Posted.
2. Enforce a human approval gate: the **"Needs Approval"** list is where a card waits for sign-off (proof/approve) before it can move to Approved & Scheduled.
3. Tag each card by target platform via labels (LinkedIn / Facebook / Instagram / Bluesky / X).
4. Provide a one-click launch from the portal Tools section ("Content Board"), opening the board in a new browser tab.

## 5. Non-functional requirements
- **Approval-first:** no content reaches "Approved & Scheduled" without passing through "Needs Approval."
- **Low-friction:** Trello is the editing surface; the portal only links out (no duplicate UI to maintain in Phase 1).
- **Credential hygiene:** API key and token live in `/home/aiciv/.env` (`TRELLO_API_KEY` / `TRELLO_TOKEN`), never committed to the repo.

## 6. Security / Auth
- The portal launch button is inside the authenticated portal Tools section; Trello itself enforces its own board access (Trello account / board membership).
- Trello cannot be iframed (X-Frame-Options), so it opens in a new tab via the portal link — no credential passthrough from the portal.
- Trello API credentials are stored only in `.env` and used for any future server-side mirroring; they are not exposed to the browser.

## 7. Acceptance criteria
- Board exists with the five lists in order and the five platform labels.
- "Needs Approval" functions as the approval gate.
- Portal Tools section has a "Content Board" button that opens the board in a new tab.
- Trello credentials are present in `.env` and absent from the repo.

## 8. Verification evidence (2026-06-16)
- Board live at `https://trello.com/b/qh7giGys` with the five lists and platform labels.
- `TRELLO_API_KEY` and `TRELLO_TOKEN` confirmed present in `/home/aiciv/.env`.
- Portal "Content Board" launch button present in the sidebar Tools section (opens in a new tab).

## 9. Open items / Phase 2
- **Read-only mirror** of the board into the portal via the Trello API (cards by list/label), so the pipeline is visible without leaving the portal.
- Optional: programmatic card creation from the portal (e.g. auto-draft cards from generated content).
