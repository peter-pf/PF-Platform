---
🌐: "Web Development"
🎯: "Deepen Park & Poplar (26-013) subcontract into project record — DRAFT contract"
⏰: "2026-06-18 02:40"
🔍: "build-project-record.py --project deep mode; new parse_subcontract_pp extractor; surgical merge preserving analysis block; Graph item-id embed"
💡: "DRAFT contracts: extract fully_executed_date as 'Not executed — DRAFT' + carry top-level execution_status; preserve pre-existing analysis block via md5 before/after; fix _norm_money to compare NUMERICALLY so 398500 == $398,500.00 (no false discrepancy)"
📈: "17 fields extracted, item_id resolved + PDF fetch proven, analysis md5 IDENTICAL, only 26-013 changed, all node --check pass, did NOT deploy/push"
rubric_score: 5
---

# Park & Poplar (26-013) Subcontract Deepen — DRAFT

## What I Built
Added `pp` extractor + PROJECT_DEEP config for 26-013 to
`platform/sync/build-project-record.py`, reusing the exact Schaaf deep-mode
pattern (`deep_extract_subcontract` / `deepen_project` / EXTRACTORS registry).
Old Town Construction uses its OWN "Subcontractor Agreement" form (§-numbered
body + page-1 PROJECT/SUBCONTRACT-SUM/CONTRACTOR/SUBCONTRACTOR/OWNER block) —
different from POET (AIA A142) and Schaaf (Patterson Horth header), so it needed
its own parser. 17 fields extracted with verbatim snippets, no fabrication.

## Key Facts of This Job (for future reference)
- DRAFT, not executed (signature page blank, §1.2 sub reps blank). Footer
  "Last updated 5/27/2026 (BAR)"; page-1 PROJECT DATE 6/11/2026.
- Value $398,500.00 — MATCHES Bid Log $398,500 exactly (no real discrepancy).
- Owner (Park & Poplar Residential LLC) is an AFFILIATE of Contractor (Old Town) §1.4.
- PAY-WHEN-PAID: progress payments 10 days after GC receives Owner payment (§4.4);
  final payment conditioned on GC receiving final Owner payment (§4.8(d)).
- Retainage 10% (work + stored materials). Bonds NOT required (§3.5 No[X]).
- LDs: proportional flow-down + Contractor's OWN uncapped actual delay damages.
- Insurance heavier than baseline: CGL $2M/occ, $5M agg/project, CPL $1M/$2M,
  PL $2M/$4M (§14.9), umbrella $5M.
- No prevailing-wage / certified-payroll clause; labor = E-Verify + I-9.
- Scope: VSC + Galvanized Helical Piers (design-build, signed/sealed submittals).
- Contract item id: 016ISVH63O4Z5QSFM4Z5C2SAT4ZMB6YGC5 (SP copy byte-identical to
  /tmp DRAFT, 1,089,789 bytes, %PDF-1.7).

## What I Learned / Gotchas
1. **Preserve a pre-existing analysis block via md5.** 26-013 already had a rich
   `analysis` block (RED, 11 risks, execution_status). Snapshot it to /tmp BEFORE
   running, compare md5 AFTER. deepen_project only touches subcontract/
   discrepancies/execution_status/generated/data_note — analysis is never read or
   written, so it survives untouched. Always PROVE it with the hash.
2. **DRAFT execution_status.** Added `execution_status` key to PROJECT_DEEP cfg;
   deepen_project sets a TOP-LEVEL `rec["execution_status"]` (additive,
   queryable). The analysis block keeps its OWN execution_status independently.
   data_note gets a "DRAFT subcontract (not executed)." prefix when cfg says DRAFT.
3. **_norm_money false-positive fix.** Old version stripped to digits only, so
   "398500" != "398500.00" → FALSE discrepancy. Fixed to compare numerically
   (repr(float(...))). Verified Schaaf's REAL discrepancy ($56,700 vs $68,200)
   still flags correctly.
4. **Orphan check method:** grep `SF\.([a-z_]+)` in index.html vs the keys present
   in the record's subcontract.fields. 15/17 displayed; `bonds_required` +
   `owner_party` are data-only (harmless, owner_party used by POET renderer).
   Missing keys render blank (em-dash) = correct no-fabrication behavior.

## Self-Check Evidence
- node --check both data files + all 28 inline scripts in index.html → PASS.
- Only 26-013 record md5 changed; 26-015 (Schaaf) md5 unchanged; POET file
  (project-record-poet.js) untouched.
- DID NOT deploy, DID NOT git push. Working tree only.

## Files
- platform/sync/build-project-record.py (PROJECT_DEEP[26-013], parse_subcontract_pp,
  EXTRACTORS['pp'], execution_status merge, _norm_money numeric fix)
- platform/data/project-records.js (records[26-013] merged)
- Re-run: `python3 sync/build-project-record.py --project 26-013`
