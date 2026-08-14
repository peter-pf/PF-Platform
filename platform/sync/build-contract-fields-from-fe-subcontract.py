#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-contract-fields-from-fe-subcontract.py
=============================================
Roll the FE (Fully-Executed subcontract) contract-field auto-fill to ALL executed
jobs. This is the generalized engine behind the POET proof (Brad approved both the
PM-card surfacing and the all-jobs rollout on 2026-08-13).

WHAT IT DOES
------------
For every project folder under
  04 - Project Management / 02 - Projects / NN-NNN - ...
it looks in the project's
  02 - Project Management / Subcontract Agreement
folder for a Fully-Executed subcontract PDF, verifies it is DocuSign-Completed,
extracts the high-confidence contract fields, and MERGES them into the SAME data
feed the portal already reads for the Subcontract Agreement card:
  platform/data/project-records.js  ->  window.PF_PROJECT_RECORDS[num].subcontract.fields
(the frontend reads this as `D.subcontract.fields`, aliased `SF`, keyed by data_key
such as commencement_date / completion_dates / subcontract_value / ...).

CONSUMPTION PATH (why this feed, not KV)
----------------------------------------
The `__contract_pull` KV key (project-override.js) records ONLY the lightweight
provenance of a pull (source doc + fully-executed date + status). The actual field
VALUES that the card renders come from `D.subcontract.fields` (SF.*), a STATIC data
feed baked into the per-project record files. POET's proven payload lives in the
dedicated deep record `platform/data/project-record-poet.js`; every OTHER awarded
job's record lives in `platform/data/project-records.js` (subcontract:null until
populated). So the correct, matching mechanism for the rollout is to write each
executed job's extracted fields into THAT static feed — identical to how POET is
consumed. We do NOT touch KV; the office user's manual overrides (also read by the
card) still win over this synced feed, exactly as for every other synced field.

DETECTION CONVENTION (confirmed against the live folders 2026-08-14)
--------------------------------------------------------------------
The FE marker in filenames is inconsistent across GCs. Observed:
  26-002 POET       26-0331 - POET Subcontract Agmt FE.pdf
  25-026 Granary    26-0715 - The Granary Sub Agmt FE.pdf
  26-013 Park&Popl  Pier Foundations - Park and Poplar Subcontract (6-11-26) FE.pdf
  26-011 Indy/Shiel 26-011 - Indy Housing Hub - Shiel FE.pdf   (GC-name + FE, no "sub")
Each sits INSIDE the project's "Subcontract Agreement" folder, so the folder is the
"this is a subcontract" context. Detection = a PDF in that folder whose name carries
a standalone " FE" token (word-boundary), with PE / DRAFT / Rev* variants explicitly
EXCLUDED. If more than one FE candidate exists, the most-recently-modified wins (and
we flag it). No FE candidate => the job is SKIPPED (subcontract feed stays null).

FAIL-CLOSED DOCTRINE (non-negotiable)
-------------------------------------
Each GC's contract is a DIFFERENT form. A field is written ONLY when the FE states it
EXPLICITLY and UNAMBIGUOUSLY in the machine-text layer under a recognizable label
(e.g. "COMMENCEMENT DATE: 06/03/2026", "SUBSTANTIAL COMPLETION DATE: mm/dd/yyyy",
"Contract Times ... commence to run on: <date>"). Anything not so stated is LEFT
ABSENT (never guessed) and stays a blank ("-") on the card. We do NOT do bespoke
per-contract vision reads here; those remain a hand-verified, per-job task (that is
how POET's deep payload was produced). This engine's job is the automatable,
explicitly-labeled subset, plus honest emptiness everywhere else.

POET is NEVER overwritten (its deep hand-verified record is authoritative). The
frontend renderer checks PF_PROJECT_RECORDS first then PF_PROJECT_POET, and we skip
POET here so its file is untouched.

Usage:
  python3 build-contract-fields-from-fe-subcontract.py --discover     # list FE candidates, no extract, no write
  python3 build-contract-fields-from-fe-subcontract.py --all          # extract all executed jobs -> merge feed
  python3 build-contract-fields-from-fe-subcontract.py --all --dry-run # extract + print, NO write
  python3 build-contract-fields-from-fe-subcontract.py --project 26-011 [--dry-run]

CONFIDENTIAL: PF-internal contract data. The feed it writes (project-records.js) is
served ONLY behind the portal's office/financials auth gate (same gate as every
other subcontract field); field_ops never sees the Subcontract Agreement card.
"""

# --- thread caps BEFORE any heavy import (solved-box-gotchas) ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import re
import sys
import json
import argparse
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
RECORDS_JS = os.path.join(DATA_DIR, "project-records.js")

PROJECTS_ROOT = "04 - Project Management/02 - Projects"
SUBK_PATH = "02 - Project Management/Subcontract Agreement"

# POET (26-002) is authoritative in its own deep record — never touched here.
POET_NUMBER = "26-002"

# Local work dir for downloaded FE PDFs (kept out of the repo).
WORK_DIR = "/home/aiciv/fe-contract-fields/work"

_env_cache = _env()
DRIVE_ID = _env_cache.get("SP_DRIVE_ID", "")

# ---- FE detection -----------------------------------------------------------
# A standalone "FE" token (fully executed) — NOT part of another word, typically
# the last token before the extension. Guards against "PE"/"DRAFT"/"Rev".
FE_TOKEN_RE = re.compile(r'(?:^|[\s_\-\(\)])FE(?=[\s_\-\.\)]|$)', re.I)
EXCLUDE_RE = re.compile(r'(?:^|[\s_\-\(\)])(PE|DRAFT|REV\d*(?:\.\d+)?)(?=[\s_\-\.\)]|$)', re.I)


def is_fe_candidate(filename):
    """True iff a PDF filename in the Subcontract Agreement folder is a Fully-Executed
    subcontract (FE token present, PE/DRAFT/Rev absent)."""
    if not filename.lower().endswith(".pdf"):
        return False
    stem = filename.rsplit(".", 1)[0]
    if EXCLUDE_RE.search(stem):
        return False
    return bool(FE_TOKEN_RE.search(stem))


# ---------------- Graph helpers (pattern from build-project-records.py) -------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req).read())


def list_children_by_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/children"
    items = []
    try:
        while url:
            data = gget(token, url)
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink")
    except urllib.error.HTTPError:
        return None  # folder missing => None (distinct from empty [])
    return items


def download_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(req).read()


def list_project_folders(token):
    out = {}
    items = list_children_by_path(token, PROJECTS_ROOT) or []
    for item in items:
        if not item.get("folder"):
            continue
        m = re.match(r"^(\d{2}-\d{3,4})\b", item["name"].strip())
        if m:
            out[m.group(1)] = item["name"]
    return dict(sorted(out.items()))


# ---------------- FE discovery per project -----------------------------------
def discover_fe(token, folder_name):
    """Return (candidate_item_or_None, reason, all_files) for one project folder."""
    path = f"{PROJECTS_ROOT}/{folder_name}/{SUBK_PATH}"
    children = list_children_by_path(token, path)
    if children is None:
        return None, "no Subcontract Agreement folder", []
    files = [c for c in children if c.get("file")]
    names = [c["name"] for c in files]
    fe = [c for c in files if is_fe_candidate(c["name"])]
    if not fe:
        if not files:
            return None, "Subcontract Agreement folder empty", names
        return None, "no Fully-Executed (FE) subcontract found", names
    if len(fe) > 1:
        # Prefer most-recently-modified; flag the ambiguity.
        fe.sort(key=lambda c: c.get("lastModifiedDateTime", ""), reverse=True)
        return fe[0], f"MULTIPLE FE candidates ({len(fe)}) — chose newest: {fe[0]['name']}", names
    return fe[0], "single FE candidate", names


# ---------------- extraction (text-clean, explicitly-labeled ONLY) -----------
def pdf_text(pdf_bytes):
    import fitz  # imported lazily (thread caps already set)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = [p.get_text() for p in doc]
    n = doc.page_count
    doc.close()
    return "\n".join(pages), n


DATE_RE = r'(\d{1,2}/\d{1,2}/\d{2,4})'


def _fmt_date(raw):
    """Normalize a mm/dd/yyyy-ish token to MM/DD/YYYY (portal display standard).
    Fail-closed: return '' on anything not a clean date."""
    m = re.match(r'^\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\s*$', raw)
    if not m:
        return ""
    mm, dd, yy = m.groups()
    if len(yy) == 2:
        yy = "20" + yy
    try:
        mm_i, dd_i, yy_i = int(mm), int(dd), int(yy)
        if not (1 <= mm_i <= 12 and 1 <= dd_i <= 31 and 2000 <= yy_i <= 2099):
            return ""
    except ValueError:
        return ""
    return f"{mm_i:02d}/{dd_i:02d}/{yy_i}"


def docusign_completed(txt):
    """True if the FE carries a DocuSign 'Completed' / envelope-complete marker."""
    return bool(re.search(r'Envelope\s*Id|Signing Complete|Status:\s*Completed|Completed\s+Security Checked', txt, re.I))


def docusign_completed_date(txt):
    """Best-effort DocuSign completion date (MM/DD/YYYY) from the cert page, or ''."""
    m = re.search(r'(?:Signing Complete|Completed)[^\n]{0,40}?' + DATE_RE, txt, re.I)
    return _fmt_date(m.group(1)) if m else ""


# Each extractor returns (value, snippet) or (None, None). value=None => field absent
# (fail-closed). We ONLY accept explicitly labeled, unambiguous statements.
def x_commencement(txt):
    # "COMMENCEMENT DATE: 06/03/2026"  |  "Contract Times ... commence to run on: <date>"
    m = re.search(r'commencement date[:\s]{1,6}' + DATE_RE, txt, re.I)
    if m:
        d = _fmt_date(m.group(1))
        if d:
            return d, m.group(0).strip()[:160]
    m = re.search(r'commence(?:s|ment)?\s+to\s+run\s+on[:\s]{1,6}' + DATE_RE, txt, re.I)
    if m:
        d = _fmt_date(m.group(1))
        if d:
            return d, m.group(0).strip()[:160]
    return None, None


def x_substantial_completion(txt):
    m = re.search(r'substantial completion date[:\s]{1,6}' + DATE_RE, txt, re.I)
    if m:
        d = _fmt_date(m.group(1))
        if d:
            return d, m.group(0).strip()[:160]
    return None, None


def x_subcontract_value(txt):
    # Only when explicitly labeled as the (sub)contract / stipulated sum. A bare "$X"
    # is NOT safe (invoices, insurance limits, LDs are also dollar amounts).
    for pat in (r'stipulated sum[^\n$]{0,60}(\$[\d,]+\.\d{2})',
                r'(?:subcontract|contract) (?:sum|amount|price|value)[^\n$]{0,40}(\$[\d,]+\.\d{2})',
                r'lump sum[^\n$]{0,40}(\$[\d,]+\.\d{2})'):
        m = re.search(pat, txt, re.I)
        if m:
            amt = m.group(1)
            if amt not in ("$0.00", "$0,000.00"):
                return amt, m.group(0).strip()[:160]
    return None, None


EXTRACTORS = [
    ("commencement_date", x_commencement),
    ("completion_dates", x_substantial_completion),
    ("subcontract_value", x_subcontract_value),
]


def extract_fields(pdf_bytes, source_filename):
    """Return (fields, snippets, meta). Only explicitly-labeled values are populated;
    everything else is absent (fail-closed)."""
    txt, npages = pdf_text(pdf_bytes)
    fields, snippets = {}, {}
    for key, fn in EXTRACTORS:
        val, snip = fn(txt)
        if val:
            fields[key] = val
            snippets[key] = snip
    ds_completed = docusign_completed(txt)
    ds_date = docusign_completed_date(txt)
    if ds_date:
        fields["fully_executed_date"] = ds_date
        snippets["fully_executed_date"] = "DocuSign completion date (cert page)"
    meta = {
        "source_file": source_filename,
        "pages": npages,
        "text_chars": len(txt),
        "docusign_completed": ds_completed,
        "scanned_pages": [],  # this engine does text-clean only; vision left to per-job hand review
    }
    return fields, snippets, meta


# ---------------- records.js merge (surgical: only the subcontract block) -----
def load_records():
    if not os.path.exists(RECORDS_JS):
        raise SystemExit(f"ERROR: {RECORDS_JS} not found")
    with open(RECORDS_JS) as f:
        txt = f.read()
    m = re.search(r"window\.PF_PROJECT_RECORDS\s*=\s*(\{.*\});", txt, re.S)
    if not m:
        raise SystemExit("ERROR: could not parse window.PF_PROJECT_RECORDS")
    payload = json.loads(m.group(1))
    return payload


def write_records(payload):
    payload["generated"] = datetime.now(timezone.utc).isoformat() + "Z"
    with open(RECORDS_JS, "w") as f:
        f.write("// AUTO-GENERATED by sync/build-project-records.py — do not edit by hand.\n")
        f.write("// All awarded project records (except POET, which is project-record-poet.js).\n")
        f.write("// window.PF_PROJECT_RECORDS keyed by project number.\n")
        f.write("// subcontract.fields populated by sync/build-contract-fields-from-fe-subcontract.py\n")
        f.write("window.PF_PROJECT_RECORDS = ")
        json.dump(payload, f, indent=2)
        f.write(";\n")


def merge_subcontract(payload, num, fields, snippets, meta):
    """Merge an extracted subcontract block into records[num].subcontract.
    Returns one of: 'created' | 'merged' | 'noop-hand' | 'noop-empty' | 'no-record'.

    MINIMAL-CHURN / FAIL-CLOSED rules:
      - No record in the feed  -> 'no-record' (never invent a record).
      - We extracted >=1 field  -> create-or-merge (extracted values win, but NEVER
        blank an existing hand-entered value; hand-curated fields are preserved).
      - We extracted 0 fields AND a hand-curated block already exists -> 'noop-hand'
        (do NOT churn hand data / flip its source_file with an automated pass that
        contributes nothing).
      - We extracted 0 fields AND no prior block -> 'noop-empty' (leave subcontract
        null; the card renders its honest empty state either way).
    """
    records = payload.get("records") or {}
    if num not in records:
        return "no-record"
    rec = records[num]
    prior = rec.get("subcontract") if isinstance(rec.get("subcontract"), dict) else None
    prior_fields = (prior.get("fields") if (prior and isinstance(prior.get("fields"), dict)) else {})

    if not fields:
        return "noop-hand" if prior_fields else "noop-empty"

    # Merge: extracted values win, but NEVER blank an existing hand-entered value.
    merged_fields = dict(prior_fields)
    for k, v in fields.items():
        merged_fields[k] = v
    rec["subcontract"] = {
        "fields": merged_fields,
        "snippets": {**((prior or {}).get("snippets") or {}), **snippets},
        "source_file": meta["source_file"],
        "pages": meta["pages"],
        "scanned_pages": meta["scanned_pages"],
        "docusign_completed": meta["docusign_completed"],
        "extracted_at": datetime.now(timezone.utc).isoformat() + "Z",
        "extractor": "build-contract-fields-from-fe-subcontract.py (text-clean, explicitly-labeled only)",
        "confidential": "PF-INTERNAL — office/financials gate only",
    }
    return "created" if prior is None else "merged"


# ---------------- main -------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--discover", action="store_true", help="list FE candidates only; no download, no write")
    ap.add_argument("--all", action="store_true", help="extract every executed job -> merge feed")
    ap.add_argument("--project", help="single project number, e.g. 26-011")
    ap.add_argument("--dry-run", action="store_true", help="extract + print, do NOT write the feed")
    args = ap.parse_args()

    if not DRIVE_ID:
        raise SystemExit("ERROR: SP_DRIVE_ID not set in /home/aiciv/.env")
    if not (args.discover or args.all or args.project):
        ap.error("specify --discover, --all, or --project NN-NNN")

    token = _token()
    folders = list_project_folders(token)
    if args.project:
        folders = {k: v for k, v in folders.items() if k == args.project}
        if not folders:
            raise SystemExit(f"ERROR: project {args.project} folder not found under {PROJECTS_ROOT}")

    os.makedirs(WORK_DIR, exist_ok=True)

    rows = []  # (num, status, detail)
    payload = None if (args.discover) else load_records()
    populated, skipped = [], []
    any_change = False

    for num, folder_name in folders.items():
        if num == POET_NUMBER:
            rows.append((num, "SKIP-POET", "authoritative deep record (project-record-poet.js) — never overwritten"))
            continue
        cand, reason, all_files = discover_fe(token, folder_name)
        if not cand:
            rows.append((num, "SKIP", reason))
            skipped.append((num, reason))
            continue
        if args.discover:
            rows.append((num, "FE-FOUND", f"{cand['name']} — {reason}"))
            continue

        # download + extract
        path = f"{PROJECTS_ROOT}/{folder_name}/{SUBK_PATH}/{cand['name']}"
        try:
            data = download_path(token, path)
        except Exception as e:
            rows.append((num, "ERROR", f"download failed: {e}"))
            skipped.append((num, f"download failed: {e}"))
            continue
        fields, snippets, meta = extract_fields(data, cand["name"])

        # A job in the folder-list but NOT in the records feed can't be merged (e.g.
        # not yet an awarded record). Report honestly rather than inventing a record.
        exists = num in (payload.get("records") or {})
        if not exists:
            rows.append((num, "NO-RECORD", f"FE found ({cand['name']}) but no record in project-records.js — not merged"))
            skipped.append((num, "no record in feed"))
            continue

        note = "DocuSign Completed" if meta["docusign_completed"] else \
            "no DocuSign-Completed marker in text layer (may be a flattened/printed FE) — flag"
        nvals = len(fields)
        result = merge_subcontract(payload, num, fields, snippets, meta)
        changed = result in ("created", "merged")
        if changed:
            any_change = True
        vals = ", ".join(f"{k}={v}" for k, v in fields.items())
        if nvals:
            status = "POPULATED"
            detail = f"{cand['name']} | {nvals} field(s): {vals} | merge={result} [{note}]"
            populated.append((num, cand["name"], fields, result, note))
        else:
            status = "FE-NO-FIELDS"
            detail = (f"{cand['name']} | 0 explicitly-labeled fields (fail-closed, "
                      f"stays blank) | merge={result} [{note}]")
        rows.append((num, status, detail))

    if not args.discover and not args.dry_run:
        if any_change:
            write_records(payload)
        # else: nothing changed — leave the feed byte-identical (no churn).

    # ---- report ----
    print("=" * 92)
    print("FE CONTRACT-FIELD ROLLOUT  —  " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    print("mode:", "discover" if args.discover else ("dry-run" if args.dry_run else "WRITE"),
          "| feed:", RECORDS_JS)
    print("=" * 92)
    for num, status, detail in rows:
        print(f"{num:8} {status:12} {detail}")
    print("-" * 92)
    print(f"populated: {len([r for r in rows if r[1]=='POPULATED'])}  "
          f"| fe-no-fields: {len([r for r in rows if r[1]=='FE-NO-FIELDS'])}  "
          f"| skipped: {len([r for r in rows if r[1] in ('SKIP','NO-RECORD','ERROR')])}  "
          f"| poet-preserved: {len([r for r in rows if r[1]=='SKIP-POET'])}")
    if not args.discover and not args.dry_run:
        print(f"WROTE: {RECORDS_JS}" if any_change else "NO CHANGE — feed left byte-identical (nothing to write)")


if __name__ == "__main__":
    main()
