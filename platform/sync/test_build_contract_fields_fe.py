#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit harness for build-contract-fields-from-fe-subcontract.py (Part B engine).
Runs OFFLINE — no Graph calls. Proves:
  (1) FE detection: matches real FE filenames, rejects PE/DRAFT/Rev/non-subcontract.
  (2) Extractors are fail-closed: return a value ONLY for explicitly-labeled statements,
      None (absent) otherwise; a bare "$X" is never taken as the subcontract value.
  (3) _fmt_date normalizes to MM/DD/YYYY and fails closed on garbage.
  (4) merge_subcontract minimal-churn rules: create when new fields + no prior; noop-hand
      when 0 fields but a hand block exists (never blank it); noop-empty when 0 fields + null.

Run: python3 sync/test_build_contract_fields_fe.py   (cwd = platform/ or anywhere)
"""
import os
import sys
import importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "fe_engine", os.path.join(HERE, "build-contract-fields-from-fe-subcontract.py"))
fe = importlib.util.module_from_spec(spec)
# The module reads _env() at import for SP_DRIVE_ID; that's fine offline (just a string).
spec.loader.exec_module(fe)

passed = 0
failed = 0
fails = []


def ok(name, cond):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        fails.append(name)
        print("  FAIL:", name)


# (1) FE detection ------------------------------------------------------------
FE_YES = [
    "26-0331 - POET Subcontract Agmt FE.pdf",
    "26-0715 - The Granary Sub Agmt FE.pdf",
    "Pier Foundations - Park and Poplar Subcontract (6-11-26) FE.pdf",
    "26-011 - Indy Housing Hub - Shiel FE.pdf",
]
FE_NO = [
    "26-0714 - The Granary Sub Agmt PE.pdf",                                  # partially executed
    "Pier Foundations - Park and Poplar Subcontract (6-11-26) DRAFT.pdf",     # draft
    "Pier Foundations - Park and Poplar Subcontract (6-11-26) Rev2.0 PE.pdf", # rev + PE
    "Madison St Parking Garage Sub Agmt.pdf",                                 # no FE marker
    "11303-03 SA Pier Foundations 03.31.26.pdf",                             # no FE marker
    "Exhibit E - Schedule of Values.xlsx",                                    # not a PDF
    "Some Feasibility Report.pdf",                                            # 'Fe' not standalone token
]
for f in FE_YES:
    ok("detect FE: " + f, fe.is_fe_candidate(f) is True)
for f in FE_NO:
    ok("reject non-FE: " + f, fe.is_fe_candidate(f) is False)

# (2) extractors fail-closed ---------------------------------------------------
# commencement: explicit label -> value; nothing labeled -> None.
v, _ = fe.x_commencement("COMMENCEMENT DATE:   06/03/2026 \nCOMPLETION DATE:  ")
ok("x_commencement explicit -> 06/03/2026", v == "06/03/2026")
v, _ = fe.x_commencement("Contract Times will commence to run on: March 30, 2026")
ok("x_commencement prose date not numeric -> None (fail closed)", v is None)
v, _ = fe.x_commencement("blah commencement of Subcontractor's Work and until finally complete")
ok("x_commencement generic prose -> None", v is None)
v, _ = fe.x_commencement("Contract Times ... commence to run on: 03/30/2026")
ok("x_commencement 'commence to run on' + date -> 03/30/2026", v == "03/30/2026")

# subcontract value: only under an explicit sum label; bare $ ignored.
v, _ = fe.x_subcontract_value("The Stipulated Sum is ... Dollars ($343,037.07), subject to")
ok("x_subcontract_value stipulated sum -> $343,037.07", v == "$343,037.07")
v, _ = fe.x_subcontract_value("Amount includes payment for all applicable taxes  $ 69,700.00")
ok("x_subcontract_value bare dollar NOT taken (fail closed)", v is None)
v, _ = fe.x_subcontract_value("Subcontract Amount: $398,500.00 total")
ok("x_subcontract_value labeled amount -> $398,500.00", v == "$398,500.00")

# substantial completion: explicit label only.
v, _ = fe.x_substantial_completion("SUBSTANTIAL COMPLETION DATE: 05/03/2027 FINAL")
ok("x_substantial_completion explicit -> 05/03/2027", v == "05/03/2027")
v, _ = fe.x_substantial_completion("substantial completion of the Project or for such period")
ok("x_substantial_completion prose -> None (fail closed)", v is None)

# (3) date normalization -------------------------------------------------------
ok("_fmt_date 6/3/2026 -> 06/03/2026", fe._fmt_date("6/3/2026") == "06/03/2026")
ok("_fmt_date 06/03/26 -> 06/03/2026", fe._fmt_date("06/03/26") == "06/03/2026")
ok("_fmt_date garbage -> ''", fe._fmt_date("March 30") == "")
ok("_fmt_date impossible month -> ''", fe._fmt_date("13/40/2026") == "")

# DocuSign markers
ok("docusign_completed on Envelope Id", fe.docusign_completed("... Envelope Id: ABC ...") is True)
ok("docusign_completed absent", fe.docusign_completed("plain printed contract") is False)

# (4) merge minimal-churn ------------------------------------------------------
def payload_with(records):
    return {"records": records}

meta = {"source_file": "x FE.pdf", "pages": 20, "scanned_pages": [], "docusign_completed": True}

# created: new field, no prior block
p = payload_with({"26-011": {"subcontract": None}})
r = fe.merge_subcontract(p, "26-011", {"commencement_date": "06/03/2026"}, {"commencement_date": "snip"}, meta)
ok("merge created", r == "created" and p["records"]["26-011"]["subcontract"]["fields"]["commencement_date"] == "06/03/2026")

# noop-hand: 0 new fields, hand-curated block exists -> untouched, source_file preserved
hand = {"subcontract": {"fields": {"subcontract_value": "$398,500.00", "payment_terms": "net 30"},
                        "source_file": "DRAFT.pdf"}}
p = payload_with({"26-013": dict(hand)})
r = fe.merge_subcontract(p, "26-013", {}, {}, meta)
ok("merge noop-hand keeps hand fields", r == "noop-hand" and p["records"]["26-013"]["subcontract"]["source_file"] == "DRAFT.pdf"
   and p["records"]["26-013"]["subcontract"]["fields"]["subcontract_value"] == "$398,500.00")

# noop-empty: 0 new fields, no prior -> stays null
p = payload_with({"25-026": {"subcontract": None}})
r = fe.merge_subcontract(p, "25-026", {}, {}, meta)
ok("merge noop-empty leaves null", r == "noop-empty" and p["records"]["25-026"]["subcontract"] is None)

# merged: new field + existing hand block -> hand fields preserved, new added, never blanked
p = payload_with({"26-013": {"subcontract": {"fields": {"payment_terms": "net 30"}}}})
r = fe.merge_subcontract(p, "26-013", {"commencement_date": "06/03/2026"}, {"commencement_date": "s"}, meta)
ok("merge merged preserves + adds", r == "merged"
   and p["records"]["26-013"]["subcontract"]["fields"]["payment_terms"] == "net 30"
   and p["records"]["26-013"]["subcontract"]["fields"]["commencement_date"] == "06/03/2026")

# no-record: project not in feed -> not invented
p = payload_with({})
r = fe.merge_subcontract(p, "99-999", {"commencement_date": "06/03/2026"}, {}, meta)
ok("merge no-record does not invent", r == "no-record" and "99-999" not in p["records"])

print("\n==== FE contract-fields engine unit harness ====")
print("PASS: %d  FAIL: %d" % (passed, failed))
if failed:
    print("FAILURES: " + "; ".join(fails))
    sys.exit(1)
sys.exit(0)
