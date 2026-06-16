# Content Pipeline (Trello) — Statement of Work (SOW)

**Module:** Content Pipeline / Trello integration
**Version:** 1.0
**Date:** 2026-06-16
**Owner:** Peter (AI COO)
**Status:** Complete (Phase 1) — board built; credentials stored; portal launch wired.

---

## Scope delivered
1. Built the Trello board **"Social Media Pipeline"** (`https://trello.com/b/qh7giGys`) with five ordered lists: Ideas & Backlog -> Drafting -> Needs Approval -> Approved & Scheduled -> Posted.
2. Created platform labels: LinkedIn, Facebook, Instagram, Bluesky, X.
3. Established **"Needs Approval"** as the explicit approval gate (proof/approve step before scheduling).
4. Stored Trello API credentials (`TRELLO_API_KEY` / `TRELLO_TOKEN`) in `/home/aiciv/.env` for future programmatic access.
5. Added a portal sidebar launch button in the **Tools** section ("Content Board"). Because Trello cannot be iframed, the button opens the board in a new tab.

## Verification
- Board live with five lists in order plus the five platform labels.
- `TRELLO_API_KEY` and `TRELLO_TOKEN` confirmed present in `/home/aiciv/.env` (not in the repo).
- "Content Board" launch button present in the portal Tools section (new-tab open).

## Out of scope / Phase 2
- Read-only mirror of the board into the portal via the Trello API (cards grouped by list/label) so the pipeline is visible without leaving the portal.
- Programmatic card creation from the portal (auto-draft cards from generated content).
- In-portal embed of Trello itself (blocked — Trello disallows iframing; link-out is the Phase 1 approach).
