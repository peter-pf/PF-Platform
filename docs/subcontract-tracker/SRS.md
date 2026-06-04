# SRS: Subcontract Tracker (Project Dashboard module)
**Status:** SPEC ONLY (visual-first build later, with Tether + Melanie). Date: 2026-06-04. Owner: Peter.

## Purpose
For each awarded subcontract, Peter extracts key terms and presents them in a nicely-formatted, navigable view in the project dashboard. One record per subcontract; reviewable by all partners.

## Data model (fields per Brad, 6/4)
1. Job Name
2. Subcontract Number
3. Date of Subcontract
4. Project Location (address)
5. Subcontract Amount
6. Scope of Work (as defined in subcontract)
7. Contracting party (who PF contracts with) + their address
8. Main point of contact
9. Contact info (email, phone, etc.)
10. Insurance requirements
11. Billing procedures
12. Safety instructions
13. Liquidated Damages (present? terms)
14. Retainage (amount held + release terms)
15. Payment terms
16. Pay App due date
17. Lien waiver needed? (form, notarized?)
18. Pay app notarized?
19. Other risk exposure to PF (LDs flow-down, cure period, notice deadlines, indemnity, differing-site-conditions, etc.)

## Extraction process (Peter)
Read subcontract PDF -> extract the 19 fields (verify checkboxes visually) -> independent legal-review verification on risk items -> structured record -> dashboard. Same flow for all future subcontracts.

## Build path
Visual-first: build the dashboard module UI (with Tether + Melanie) for partners to review; approve; then connect backend (store records, auto-extract pipeline). Per the Build Sequence Principle.
