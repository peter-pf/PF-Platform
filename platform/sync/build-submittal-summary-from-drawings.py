#!/usr/bin/env python3
"""
Build Submittal Summary FROM APPROVED DRAWINGS  [Stage 1 extraction engine, READ-ONLY on SharePoint]
=====================================================================================================
"Pull from Approved Drawings" button — Stage 1 (standalone extraction tool + proof).
Given a PROJECT NUMBER, produce the Site-Readiness > Submittal Summary data by
VISION-READING the Garbin-sealed Approved AP shop drawings, with a built-in
reconciliation check (per-area sums vs pier-schedule grand total).

WHY a two-phase design (fetch/prep  then  finalize):
  The numbers on GI-300 layout plans and the pier-schedule grand total are GRAPHIC
  CAD text. Some sets (R3) happen to carry the per-area totals box in the PDF text
  layer; older sets (R1) do NOT. To FAIL CLOSED and never fabricate, the source of
  truth is the VISION READ of the rasterized sheet, not the text layer. So:

    PHASE 1  (prep):   resolve folder -> pick latest-dated AP design set -> download ->
                       classify sheets -> rasterize every GI-300 sheet + its totals-box
                       crop + title crop, and every pier-schedule page + grand-total crop.
                       Emit a MANIFEST of what a human/vision-agent must read, plus the
                       text-layer values as a NON-BINDING cross-check hint.
    (vision read)      pf-estimating-agent Reads the PNG crops and records the numbers.
    PHASE 2  (finalize): feed the vision-confirmed numbers back in; the tool reconciles,
                       computes deltas, and writes the structured JSON the Stage-2
                       frontend consumes. Any unread box/total => marked unreadable in
                       notes[], NO invented value, reconciled reflects only what was read.

FACT vs INFERENCE (8-point standard):
  - piers / lf / grand total = FACT, read-from-drawing, each row cites its source sheet.
  - area name = FACT (sheet plan title).
  - reconciled / delta = INFERENCE (arithmetic over the facts).
  - text-layer hints in the manifest = NON-BINDING; never written to output.

Source access: window.PF_DESIGN_SUBMITTAL[projnum].folder_url in
  PF-Platform/platform/data/pf-design-submittal.js  (Approved Shop Dwgs folder).
  Graph auth reuses tools/pf_email (_token/_env), Files/Sites.ReadWrite.All.

Artifacts (for pf-intel-verifier, read-only, no poppler): everything under
  <workdir>/<projnum>/  ->  downloaded PDF(s), *_sheetNN.png, *_box.png, *_title.png,
  pier-schedule pages + grand-total crop, prep-manifest.json, and the final
  submittal-summary.json.

Usage:
  # Phase 1 — fetch + rasterize + emit manifest of crops to vision-read
  python3 build-submittal-summary-from-drawings.py --project 26-002 --prep

  # Phase 2 — finalize with vision-confirmed numbers (JSON file or inline)
  python3 build-submittal-summary-from-drawings.py --project 26-002 \
      --finalize --readings /path/to/readings.json --pulled-at 2026-08-13T00:00:00Z

readings.json shape (what the vision-agent fills in after reading the crops):
  {
    "source_pdf": {"name": "...", "id": "...", "revision": "R3", "date": "2026-07-23"},
    "areas": [ {"area": "...", "piers": 1316, "lf": 13160, "source_sheet": "GI-300"}, ... ],
    "pier_schedule_total": {"piers": 2062, "lf": 19781, "source_sheet": "GI-412"},
    "notes": [ "..." ]        # optional extra caveats
  }
Any area/total the vision-agent could not read: OMIT it and add a note; the tool
records it unreadable rather than guessing.
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
import urllib.request
import urllib.parse
import urllib.error

import fitz  # PyMuPDF

sys.path.insert(0, "/home/aiciv/tools")
from pf_email import _token, _env  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"
DEFAULT_WORKDIR = "/home/aiciv/poet-submittal-mapping/out"
DESIGN_SUBMITTAL_JS = (
    "/home/aiciv/PF-Platform/platform/data/pf-design-submittal.js"
)

# A GI-3xx layout sheet == one AREA. A pier-schedule sheet == GI-4xx.
GI_LAYOUT_RE = re.compile(r"GI-3\d{2}")
GI_SCHED_RE = re.compile(r"GI-4\d{2}")
# per-area totals box (graphic CAD, but sometimes in the text layer as a hint)
BOX_LF_RE = re.compile(r"TOTAL\s+LF\s*=\s*([\d,]+)", re.I)
BOX_PIER_RE = re.compile(r"TOTAL\s+PIER\s+COUNT\s*=\s*([\d,]+)", re.I)
# grand-total line on the last pier-schedule page (graphic; hint only if present)
GRAND_LF_RE = re.compile(r"TOTAL\s+LINEAR\s+FOOTAGE\s*=\s*([\d,]+)", re.I)
GRAND_PIER_RE = re.compile(
    r"TOTAL\s+(?:PIER\s+COUNT|COLUMN\s+COUNT|NUMBER\s+OF\s+PIERS)\s*=\s*([\d,]+)",
    re.I,
)
# plan title, e.g. "AP LAYOUT PLAN - THIN STILLAGE TANK"
TITLE_RE = re.compile(r"(?:AP\s+)?LAYOUT\s+PLAN\s*[-–]\s*([A-Z0-9 ()&.'/]+)", re.I)


# ----------------------------------------------------------------------------- Graph
def _tok():
    return _token()


def _drive():
    return _env().get("SP_DRIVE_ID", "")


def gget(url, tok):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    return json.loads(urllib.request.urlopen(req).read())


def list_children_by_path(path, tok, drive):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{drive}/root:/{p}:/children"
    out = []
    while url:
        data = gget(url, tok)
        out.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return out


def list_children_by_id(item_id, tok, drive):
    url = f"{GRAPH}/drives/{drive}/items/{item_id}/children"
    out = []
    while url:
        data = gget(url, tok)
        out.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return out


def download_item(item_id, dest, tok, drive):
    url = f"{GRAPH}/drives/{drive}/items/{item_id}/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


# ----------------------------------------------------------------------------- project resolution
def resolve_source_path(projnum):
    """Read the Approved Shop Dwgs source_path from pf-design-submittal.js."""
    with open(DESIGN_SUBMITTAL_JS, "r", encoding="utf-8") as f:
        txt = f.read()
    start = txt.find("{")
    end = txt.rfind("}")
    data = json.loads(txt[start:end + 1])
    proj = data.get("projects", {}).get(projnum)
    if not proj:
        raise SystemExit(
            f"Project {projnum} not found in pf-design-submittal.js "
            f"(no Approved Shop Dwgs folder registered)."
        )
    return proj["source_path"], proj.get("folder_url", "")


def walk_pdfs(source_path, tok, drive):
    """Recursively collect PDF files under the Approved Shop Dwgs folder.

    Returns list of dicts: {name, id, modified, size, subfolder}.
    """
    root = source_path.rstrip("/")
    prefix = "04 - Project Management/02 - Projects/"
    full = prefix + root
    pdfs = []

    def recurse(item_id, subfolder):
        for it in list_children_by_id(item_id, tok, drive):
            if it.get("folder"):
                recurse(it["id"], (subfolder + "/" + it["name"]).lstrip("/"))
            elif it.get("name", "").lower().endswith(".pdf"):
                pdfs.append({
                    "name": it["name"],
                    "id": it["id"],
                    "modified": it.get("lastModifiedDateTime", ""),
                    "size": it.get("size", 0),
                    "subfolder": subfolder,
                })

    # get root folder item id
    top = list_children_by_path(full, tok, drive)
    for it in top:
        if it.get("folder"):
            recurse(it["id"], it["name"])
        elif it.get("name", "").lower().endswith(".pdf"):
            pdfs.append({
                "name": it["name"],
                "id": it["id"],
                "modified": it.get("lastModifiedDateTime", ""),
                "size": it.get("size", 0),
                "subfolder": "",
            })
    return pdfs


def is_ap_design_set(pdf_path):
    """A true AP design set has BOTH GI-3xx layout sheets and GI-4xx pier schedule.

    Returns (bool, dict of quick stats) — content-based, not filename-based, so a
    'concrete drawings' PDF that also lives in the folder is correctly excluded.
    """
    d = fitz.open(pdf_path)
    npages = len(d)
    has_layout = has_sched = False
    for pg in range(npages):
        up = d[pg].get_text().upper()
        if GI_LAYOUT_RE.search(up):
            has_layout = True
        if GI_SCHED_RE.search(up):
            has_sched = True
        if has_layout and has_sched:
            break
    d.close()
    return (has_layout and has_sched), {"pages": npages}


def detect_revision(name, pdf_path):
    """Best-effort revision label. FACT from filename token (R1/R2/R3/Rev n) or
    from the title-block 'REVISIONS' latest row date. Returns (rev_label, date)."""
    rev = None
    m = re.search(r"\bR(?:EV)?\s*[-_ ]?(\d)\b", name, re.I)
    if m:
        rev = "R" + m.group(1)
    # scan text for the latest revision row (largest leading integer w/ a date)
    d = fitz.open(pdf_path)
    latest_num, latest_date = -1, None
    date_re = re.compile(r"(\d{2}/\d{2}/\d{4})")
    for pg in range(len(d)):
        lines = d[pg].get_text().splitlines()
        for i, ln in enumerate(lines):
            s = ln.strip()
            if s.isdigit() and 0 <= int(s) <= 9:
                # look ahead a couple lines for a date
                for j in range(i + 1, min(i + 3, len(lines))):
                    dm = date_re.search(lines[j])
                    if dm and int(s) >= latest_num:
                        latest_num = int(s)
                        latest_date = dm.group(1)
                        break
    d.close()
    if rev is None and latest_num >= 0:
        rev = "R" + str(latest_num)
    return rev, latest_date


# ----------------------------------------------------------------------------- rasterization
def raster_page(doc, page_index, out_png, zoom=3.0, clip=None):
    page = doc[page_index]
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    pix.save(out_png)
    return pix.width, pix.height


def corner_clip(page, corner, fw=0.42, fh=0.20):
    """Return a fitz.Rect for a page corner (totals boxes live in bottom corners,
    titles in bottom-right title block area). corner in {'br','bl','tr','tl'}."""
    r = page.rect
    w, h = r.width, r.height
    cw, ch = w * fw, h * fh
    if corner == "br":
        return fitz.Rect(r.x1 - cw, r.y1 - ch, r.x1, r.y1)
    if corner == "bl":
        return fitz.Rect(r.x0, r.y1 - ch, r.x0 + cw, r.y1)
    if corner == "tr":
        return fitz.Rect(r.x1 - cw, r.y0, r.x1, r.y0 + ch)
    return fitz.Rect(r.x0, r.y0, r.x0 + cw, r.y0 + ch)


# ----------------------------------------------------------------------------- PHASE 1: prep
def prep(projnum, workdir):
    tok, drive = _tok(), _drive()
    proj_dir = os.path.join(workdir, projnum)
    os.makedirs(proj_dir, exist_ok=True)

    source_path, folder_url = resolve_source_path(projnum)
    pdfs = walk_pdfs(source_path, tok, drive)
    if not pdfs:
        raise SystemExit(f"No PDFs found under Approved Shop Dwgs for {projnum}.")

    # download candidates, classify, keep only true AP design sets
    candidates = []
    for p in pdfs:
        local = os.path.join(proj_dir, re.sub(r"[^\w.\-]", "_", p["name"]))
        if not os.path.exists(local) or os.path.getsize(local) != p["size"]:
            download_item(p["id"], local, tok, drive)
        ap, stats = is_ap_design_set(local)
        rev, rdate = detect_revision(p["name"], local) if ap else (None, None)
        candidates.append({**p, "local": local, "is_ap_design_set": ap,
                           "pages": stats["pages"], "revision": rev,
                           "rev_date": rdate})

    ap_sets = [c for c in candidates if c["is_ap_design_set"]]
    if not ap_sets:
        raise SystemExit(
            f"No AP design set (GI-3xx + GI-4xx) found among "
            f"{len(candidates)} PDF(s) for {projnum}."
        )

    # LATEST-DATED wins; prefer the title-block revision date, then folder mtime.
    def sort_key(c):
        return (c.get("rev_date") or "", c.get("modified") or "")
    ap_sets.sort(key=sort_key, reverse=True)
    chosen = ap_sets[0]

    # classify sheets in the chosen PDF
    doc = fitz.open(chosen["local"])
    gi300_pages = []   # (page_index, sheet_id, title, box_hint)
    gi4_pages = []
    for pg in range(len(doc)):
        up = doc[pg].get_text().upper()
        gi3_all = sorted(set(GI_LAYOUT_RE.findall(up)))
        gi4_all = sorted(set(GI_SCHED_RE.findall(up)))
        # A real area sheet == exactly ONE GI-3xx ref and NO GI-4xx ref.
        # Index/cover pages list many GI-3xx AND GI-4xx -> excluded here.
        is_area_sheet = (len(gi3_all) == 1 and len(gi4_all) == 0)
        # A real schedule sheet == exactly ONE GI-4xx ref and NO GI-3xx ref.
        is_sched_sheet = (len(gi4_all) == 1 and len(gi3_all) == 0)
        m3 = GI_LAYOUT_RE.search(up)
        m4 = GI_SCHED_RE.search(up)
        if is_area_sheet:
            sheet = m3.group(0)
            tm = TITLE_RE.search(up)
            title = tm.group(1).strip().title() if tm else None
            is_cont = "(CONT" in up
            lf = BOX_LF_RE.search(up)
            pr = BOX_PIER_RE.search(up)
            gi300_pages.append({
                "page": pg + 1, "sheet": sheet, "title": title,
                "is_continuation": is_cont,
                "box_hint": {
                    "lf": int(lf.group(1).replace(",", "")) if lf else None,
                    "piers": int(pr.group(1).replace(",", "")) if pr else None,
                },
            })
        elif is_sched_sheet:
            up_ = up
            glf = GRAND_LF_RE.search(up_)
            gpr = GRAND_PIER_RE.search(up_)
            gi4_pages.append({
                "page": pg + 1, "sheet": m4.group(0),
                "grand_hint": {
                    "lf": int(glf.group(1).replace(",", "")) if glf else None,
                    "piers": int(gpr.group(1).replace(",", "")) if gpr else None,
                },
            })

    # group GI-300 pages into AREAS (a sheet id = one area; CONT pages fold in).
    areas = []
    for gp in gi300_pages:
        if gp["is_continuation"] and areas and areas[-1]["sheet"] == gp["sheet"]:
            areas[-1]["pages"].append(gp["page"])
            continue
        areas.append({
            "sheet": gp["sheet"],
            "title": gp["title"],
            "pages": [gp["page"]],
            "box_hint": gp["box_hint"],
        })

    # rasterize each area's first page full + totals-box corners (br & bl) + title
    read_targets = []
    for a in areas:
        pg0 = a["pages"][0]
        page = doc[pg0 - 1]
        base = f"{a['sheet']}_p{pg0}"
        full_png = os.path.join(proj_dir, f"{base}_full.png")
        raster_page(doc, pg0 - 1, full_png, zoom=2.5)
        crops = {}
        for corner in ("br", "bl"):
            cpng = os.path.join(proj_dir, f"{base}_box_{corner}.png")
            raster_page(doc, pg0 - 1, cpng, zoom=5.0, clip=corner_clip(page, corner))
            crops[corner] = cpng
        title_png = os.path.join(proj_dir, f"{base}_title.png")
        raster_page(doc, pg0 - 1, title_png, zoom=4.0, clip=corner_clip(page, "br", fw=0.30, fh=0.28))
        read_targets.append({
            "sheet": a["sheet"], "pages": a["pages"], "title_hint": a["title"],
            "full_png": full_png, "box_crops": crops, "title_png": title_png,
            "text_layer_hint": a["box_hint"],
        })

    # rasterize pier-schedule LAST page full + bottom corners for the grand total
    grand_targets = []
    if gi4_pages:
        last = gi4_pages[-1]
        page = doc[last["page"] - 1]
        base = f"{last['sheet']}_p{last['page']}"
        full_png = os.path.join(proj_dir, f"{base}_full.png")
        raster_page(doc, last["page"] - 1, full_png, zoom=2.5)
        crops = {}
        for corner in ("br", "bl", "tr"):
            cpng = os.path.join(proj_dir, f"{base}_grand_{corner}.png")
            raster_page(doc, last["page"] - 1, cpng, zoom=5.0, clip=corner_clip(page, corner))
            crops[corner] = cpng
        grand_targets.append({
            "sheet": last["sheet"], "page": last["page"],
            "full_png": full_png, "crops": crops,
            "text_layer_hint": last["grand_hint"],
        })
    doc.close()

    manifest = {
        "project": projnum,
        "phase": "prep",
        "source_path": source_path,
        "folder_url": folder_url,
        "pdf_candidates": [
            {k: c[k] for k in ("name", "id", "subfolder", "modified", "size",
                               "is_ap_design_set", "pages", "revision", "rev_date")}
            for c in candidates
        ],
        "chosen_pdf": {
            "name": chosen["name"], "id": chosen["id"],
            "subfolder": chosen["subfolder"], "modified": chosen["modified"],
            "revision": chosen["revision"], "rev_date": chosen["rev_date"],
            "pages": chosen["pages"], "local": chosen["local"],
        },
        "chosen_reason": (
            "content-classified AP design set (has GI-3xx + GI-4xx); latest by "
            "title-block revision date then folder mtime"
        ),
        "areas_to_read": read_targets,
        "grand_total_to_read": grand_targets,
        "instructions": (
            "VISION-READ each area's box crop (box_br/box_bl) for TOTAL PIER COUNT "
            "and TOTAL LF, and the title crop for the area name; read the pier-"
            "schedule grand total from grand_* crops. text_layer_hint is a "
            "NON-BINDING cross-check only. Fill readings.json; OMIT anything "
            "unreadable and note it. Then run --finalize."
        ),
    }
    man_path = os.path.join(proj_dir, "prep-manifest.json")
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"PREP complete. Manifest: {man_path}")
    print(f"Chosen PDF: {chosen['name']} rev={chosen['revision']} "
          f"date={chosen['rev_date']} ({chosen['pages']} pp)")
    print(f"Areas to read: {len(read_targets)}  |  grand-total sheets: {len(grand_targets)}")
    return manifest


# ----------------------------------------------------------------------------- PHASE 2: finalize
def finalize(projnum, workdir, readings, pulled_at):
    proj_dir = os.path.join(workdir, projnum)
    man_path = os.path.join(proj_dir, "prep-manifest.json")
    if not os.path.exists(man_path):
        raise SystemExit(f"Run --prep first (no manifest at {man_path}).")
    with open(man_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    notes = list(readings.get("notes", []))

    # per-area rows — FACT, each cites its source sheet. Fail closed on missing.
    read_areas = {(a.get("source_sheet") or a.get("sheet")): a
                  for a in readings.get("areas", [])}
    areas_out = []
    sum_piers = sum_lf = 0
    all_areas_read = True
    for tgt in manifest["areas_to_read"]:
        sheet = tgt["sheet"]
        r = read_areas.get(sheet)
        if not r or r.get("piers") is None or r.get("lf") is None:
            all_areas_read = False
            notes.append(
                f"UNREADABLE: {sheet} totals box not vision-confirmed; "
                f"area omitted from sums (no value invented)."
            )
            areas_out.append({
                "area": (tgt.get("title_hint") or sheet),
                "piers": None, "lf": None, "source_sheet": sheet,
                "readable": False,
            })
            continue
        areas_out.append({
            "area": r.get("area") or tgt.get("title_hint") or sheet,
            "piers": int(r["piers"]), "lf": int(r["lf"]),
            "source_sheet": sheet, "readable": True,
        })
        sum_piers += int(r["piers"])
        sum_lf += int(r["lf"])

    # pier-schedule grand total — FACT. Fail closed if not read.
    pst = readings.get("pier_schedule_total") or {}
    grand_read = pst.get("piers") is not None and pst.get("lf") is not None
    if not grand_read:
        notes.append(
            "UNREADABLE: pier-schedule grand total not vision-confirmed "
            "(no value invented)."
        )
    pier_schedule_total = {
        "piers": int(pst["piers"]) if grand_read else None,
        "lf": int(pst["lf"]) if grand_read else None,
        "source_sheet": pst.get("source_sheet"),
    }

    reconciled = bool(all_areas_read and grand_read
                      and sum_piers == pier_schedule_total["piers"]
                      and sum_lf == pier_schedule_total["lf"])
    delta = {
        "piers": (pier_schedule_total["piers"] - sum_piers) if grand_read else None,
        "lf": (pier_schedule_total["lf"] - sum_lf) if grand_read else None,
    }
    if not (all_areas_read and grand_read):
        notes.append(
            "Reconciliation NOT possible: one or more values unreadable; "
            "delta computed only over what was read."
        )

    src = readings.get("source_pdf") or {}
    chosen = manifest["chosen_pdf"]
    output = {
        "project": projnum,
        "source_pdf": {
            "name": src.get("name") or chosen["name"],
            "sharepoint_id": src.get("id") or chosen["id"],
            "revision": src.get("revision") or chosen["revision"],
            "date": src.get("date") or chosen["rev_date"],
            "subfolder": chosen.get("subfolder"),
        },
        "pulled_at": pulled_at,  # passed in — never generated here
        "areas": areas_out,
        "extracted_total": {"piers": sum_piers, "lf": sum_lf},
        "pier_schedule_total": pier_schedule_total,
        "reconciled": reconciled,
        "delta": delta,
        "notes": notes,
        "provenance": {
            "source": "Garbin-sealed Approved AP Shop Drawings",
            "method": "vision-read of rasterized GI-3xx layout totals boxes + "
                      "GI-4xx pier-schedule grand total",
            "folder_url": manifest.get("folder_url"),
            "chosen_reason": manifest.get("chosen_reason"),
        },
    }
    out_path = os.path.join(proj_dir, "submittal-summary.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"FINALIZE complete. Output: {out_path}")
    print(f"Extracted: {sum_piers} piers / {sum_lf} LF   "
          f"Schedule: {pier_schedule_total}   reconciled={reconciled} "
          f"delta={delta}")
    return output


# ----------------------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", required=True, help="e.g. 26-002")
    ap.add_argument("--workdir", default=DEFAULT_WORKDIR)
    ap.add_argument("--prep", action="store_true", help="Phase 1: fetch+rasterize")
    ap.add_argument("--finalize", action="store_true", help="Phase 2: write JSON")
    ap.add_argument("--readings", help="path to vision readings JSON (finalize)")
    ap.add_argument("--pulled-at", default="PLACEHOLDER_PULLED_AT",
                    help="ISO timestamp passed in (never generated here)")
    args = ap.parse_args()

    if args.prep:
        prep(args.project, args.workdir)
    if args.finalize:
        if not args.readings:
            raise SystemExit("--finalize needs --readings <json>")
        with open(args.readings, "r", encoding="utf-8") as f:
            readings = json.load(f)
        finalize(args.project, args.workdir, readings, args.pulled_at)
    if not (args.prep or args.finalize):
        raise SystemExit("Nothing to do: pass --prep and/or --finalize.")


if __name__ == "__main__":
    main()
