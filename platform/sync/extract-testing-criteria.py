#!/usr/bin/env python3
"""
extract-testing-criteria.py — STANDALONE, NO SIDE EFFECTS.

Pull the 4 (really 5) AP Testing criteria out of a project's APPROVED shop-drawing
PDF and PRINT them as JSON. This stage writes NOTHING to any portal data store,
KV, or override — it is a pure read + print, safe to run any time.

Values extracted (validated on 26-013 Park & Poplar):
  - ap_reaction_modulus_pci   : GI-100 text  "REACTION MODULUS USED HEREIN IS 135 PCI"  -> 135
  - ap_design_diameter_ft     : GI-200 text  "Ø30\" AGGREGATE PIER" -> 30 in / 12       -> 2.5
  - diameter_of_plate_ft      : same 30" nominal diameter                                -> 2.5
  - ap_design_load_kips       : GI-200 Modulus Test Schedule, Applied Load @ 100% row    -> 68  (VISION)
  - ap_max_test_load_kips     : GI-200 Modulus Test Schedule, Applied Load @ 150% row    -> 102 (VISION)

Text values are pure PyMuPDF text + regex. The two load values live in a DRAWN
(graphics, not text) schedule table, so they are read by a HEADLESS vision call:
we shell out to the local `claude` CLI in non-interactive mode (`claude -p`) and
let its Read tool do the multimodal read of a rendered crop. There is NO hosted
vision API key on this box (no GOOGLE_API_KEY / ANTHROPIC_API_KEY in /home/aiciv/.env),
so the Claude CLI is the viable headless vision path. See the module docstring in
the STAGE-1 report for the rationale.

FAIL-CLOSED: if a value can't be read with confidence (missing sheet, regex miss,
vision integrity check fails), we DO NOT emit a guessed number — we set
needs_review=true with a reason and leave that field null.

Usage:
  extract-testing-criteria.py 26-013
  extract-testing-criteria.py --only 26-013
  extract-testing-criteria.py 26-013 --dump   # save the crops to /tmp for inspection

Auth: Microsoft Graph app-only, via pf_email._env / pf_email._token (per task spec).
"""
import sys, os, re, json, subprocess, tempfile, argparse
import urllib.request, urllib.parse, urllib.error

# --- Graph auth: reuse the canonical helpers per task spec ---
sys.path.insert(0, "/home/aiciv/tools")
import pf_email  # noqa: E402  -> provides _env() and _token()

import fitz  # PyMuPDF  # noqa: E402

GRAPH = "https://graph.microsoft.com/v1.0"
PROJECTS_BASE = "04 - Project Management/02 - Projects"
ENG_BASE = "03 - Engineering & Design"
APPROVED_SUBFOLDER_NAMES = ["Approved Shop Dwgs", "Approved Shop Drawings"]

_ENV = pf_email._env()
DRIVE_ID = _ENV.get("SP_DRIVE_ID", "")

# Only real project folders start with an "NN-NNN" number.
PROJNUM_RE = re.compile(r"^(\d{2}-\d{3})\b")

# GI-100 modulus:  "...THE DESIGN PIER REACTION MODULUS USED HEREIN IS 135 PCI..."
MODULUS_RE = re.compile(r"REACTION\s+MODULUS\s+USED\s+HEREIN\s+IS\s*(\d+(?:\.\d+)?)\s*PCI", re.I)
# GI-200 diameter: "Ø30\"± AGGREGATE PIER"  /  "30\" NOMINAL DIAMETER".
# Anchor on the digit IMMEDIATELY preceding the phrase so a stray digit elsewhere
# (or the Ø multibyte glyph) can't hijack the match. Allow an optional inch mark
# and an optional "±" tolerance mark between the number and the phrase.
DIAMETER_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[\"”]?\s*(?:±\s*)?(?:AGGREGATE\s+PIER|NOMINAL\s+DIAMETER)",
    re.I,
)
# The schedule table's text anchor (drawn table sits ABOVE this label).
SCHED_ANCHOR_RE = re.compile(r"MODULUS\s+TEST\s+SCHEDULE", re.I)

# Vision: how big a rendered crop, and the claude CLI budget.
RENDER_ZOOM = 2.0          # 2x -> ~144 dpi, plenty legible for the table
CLAUDE_TIMEOUT = 240       # seconds
CROP_MAX_EDGE = 1500       # keep crops well under the 2000px image-API cap


# ---------------- Graph helpers (pattern from build-garbin-prelim.py) ----------------
def gget(token, url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def list_children_by_path(token, path):
    p = urllib.parse.quote(path)
    url = f"{GRAPH}/drives/{DRIVE_ID}/root:/{p}:/children"
    items = []
    while url:
        data = gget(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def try_list_children_by_path(token, path):
    try:
        return list_children_by_path(token, path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def list_children_by_item(token, item_id):
    url = f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}/children"
    items = []
    while url:
        data = gget(token, url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def download_item_content(token, item_id, dest):
    url = f"{GRAPH}/drives/{DRIVE_ID}/items/{item_id}/content"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())


# ---------------- project + PDF resolution ----------------
def resolve_project_folder(token, projnum):
    """Return the driveItem folder name for a project number (e.g. '26-013 ...')."""
    children = list_children_by_path(token, PROJECTS_BASE)
    for it in children:
        if not it.get("folder"):
            continue
        m = PROJNUM_RE.match(it.get("name", ""))
        if m and m.group(1) == projnum:
            return it.get("name", "")
    return None


def resolve_approved_pdf(token, folder):
    """Find the Approved Shop Dwgs PDF under a project's E&D folder.
    Returns (item_dict, subfolder_name) or (None, None)."""
    for sub in APPROVED_SUBFOLDER_NAMES:
        path = f"{PROJECTS_BASE}/{folder}/{ENG_BASE}/{sub}"
        kids = try_list_children_by_path(token, path)
        if not kids:
            continue
        pdfs = [c for c in kids
                if c.get("file") and c.get("name", "").lower().endswith(".pdf")]
        if not pdfs:
            continue
        # Prefer a file whose name signals it's the approved/exceptions set; else newest.
        def rank(c):
            n = c.get("name", "").lower()
            approved = 1 if ("approved" in n or "exception" in n) else 0
            mtime = (c.get("lastModifiedDateTime") or "")
            return (approved, mtime)
        pdfs.sort(key=rank, reverse=True)
        return pdfs[0], sub
    return None, None


# ---------------- sheet resolution by TITLE-BLOCK TOKEN (not page index) ----------------
def find_sheet_page(doc, token_re):
    """Return the 0-based page index whose title block contains the sheet token
    (e.g. GI-100). We look for the token in the lower-right title-block region first
    (where sheet numbers live), then fall back to anywhere on the page."""
    # Pass 1: title-block region (right ~30%, bottom ~25%).
    for pno in range(doc.page_count):
        page = doc[pno]
        rect = page.rect
        tb = fitz.Rect(rect.x0 + rect.width * 0.65, rect.y0 + rect.height * 0.72,
                       rect.x1, rect.y1)
        txt = page.get_text("text", clip=tb)
        if token_re.search(txt):
            return pno
    # Pass 2: anywhere on the page (some title blocks render as vector; fall back).
    for pno in range(doc.page_count):
        if token_re.search(doc[pno].get_text("text")):
            return pno
    return None


GI100_RE = re.compile(r"\bGI[-\s]?100\b", re.I)
GI200_RE = re.compile(r"\bGI[-\s]?200\b", re.I)


# ---------------- text extractions ----------------
def extract_modulus(doc, gi100_page):
    if gi100_page is None:
        return None, "GI-100 sheet not found"
    txt = doc[gi100_page].get_text("text")
    m = MODULUS_RE.search(txt)
    if not m:
        # normalize whitespace/newlines and retry (text often line-wraps)
        m = MODULUS_RE.search(re.sub(r"\s+", " ", txt))
    if not m:
        return None, "modulus line 'REACTION MODULUS USED HEREIN IS N PCI' not found on GI-100"
    return float(m.group(1)), None


def extract_diameter_ft(doc, gi200_page):
    if gi200_page is None:
        return None, "GI-200 sheet not found"
    txt = re.sub(r"\s+", " ", doc[gi200_page].get_text("text"))
    m = DIAMETER_RE.search(txt)
    if not m:
        return None, "nominal diameter ('N\" AGGREGATE PIER' / 'N\" NOMINAL DIAMETER') not found on GI-200"
    inches = float(m.group(1))
    if inches <= 0 or inches > 120:
        return None, f"implausible diameter {inches} in"
    return round(inches / 12.0, 4), None


# ---------------- vision extraction of the schedule table ----------------
def render_schedule_crop(doc, gi200_page, dump=False):
    """Locate the 'MODULUS TEST SCHEDULE' anchor on GI-200 and render the region
    ABOVE it (the drawn table) to a PNG. Returns (png_path, err)."""
    page = doc[gi200_page]
    anchors = page.search_for("MODULUS TEST SCHEDULE")
    if not anchors:
        # anchor may be split across words; try a looser token
        anchors = page.search_for("TEST SCHEDULE")
    if not anchors:
        return None, "could not locate 'MODULUS TEST SCHEDULE' anchor on GI-200"
    anchor = anchors[0]  # top-most match
    rect = page.rect
    # The schedule table sits directly ABOVE the label. Take a generous band:
    # from a bit above the top of the sheet down to just past the anchor, and
    # horizontally around the anchor's column (widen to catch the full table).
    x0 = max(rect.x0, anchor.x0 - rect.width * 0.20)
    x1 = min(rect.x1, anchor.x1 + rect.width * 0.28)
    y1 = min(rect.y1, anchor.y1 + 6)
    # table height is unknown; grab up to ~55% of page height above the anchor
    y0 = max(rect.y0, anchor.y0 - rect.height * 0.55)
    clip = fitz.Rect(x0, y0, x1, y1)

    zoom = RENDER_ZOOM
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
    # cap the long edge under the image-API limit
    if max(pix.width, pix.height) > CROP_MAX_EDGE:
        scale = CROP_MAX_EDGE / max(pix.width, pix.height)
        zoom = zoom * scale
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)

    if dump:
        out = f"/tmp/extract_sched_{os.getpid()}.png"
    else:
        fd, out = tempfile.mkstemp(prefix="sched_", suffix=".png")
        os.close(fd)
    pix.save(out)
    return out, None


VISION_PROMPT = (
    'Use the Read tool on the image file {path}. It is a "Modulus Test Schedule" '
    'table from an aggregate-pier shop drawing. The table has columns including a '
    'percent-of-design-load column and an Applied Load (kips) column, and it steps '
    'the load up then back down (e.g. 25%,50%,75%,100%,125%,150%,125%,100%,75%...). '
    'Read the Applied Load value (kips) at the 100%-of-design-load row and at the '
    '150%-of-design-load row. Note: the 100% row appears TWICE (once on the way up, '
    'once on the way down) and both must show the SAME applied load. Return ONLY a '
    'compact JSON object and nothing else, no prose, no code fence: '
    '{{"applied_load_at_100pct": <number>, "applied_load_at_100pct_second": <number>, '
    '"applied_load_at_150pct": <number>}}'
)


def vision_read_schedule(png_path):
    """Call the headless claude CLI to read the schedule crop. Returns (dict, err)."""
    prompt = VISION_PROMPT.format(path=png_path)
    try:
        proc = subprocess.run(
            ["claude", "-p", "--allowedTools", "Read"],
            input=prompt, capture_output=True, text=True, timeout=CLAUDE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return None, "vision call timed out"
    if proc.returncode != 0:
        return None, f"vision CLI exit {proc.returncode}: {proc.stderr.strip()[:200]}"
    out = proc.stdout.strip()
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return None, f"vision returned no JSON: {out[:200]}"
    try:
        return json.loads(m.group(0)), None
    except json.JSONDecodeError as e:
        return None, f"vision JSON parse error: {e} :: {out[:200]}"


def _num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def check_loads(vdict):
    """Integrity checks on the vision result. Returns (design_load, max_load, err)."""
    l100 = _num(vdict.get("applied_load_at_100pct"))
    l100b = _num(vdict.get("applied_load_at_100pct_second"))
    l150 = _num(vdict.get("applied_load_at_150pct"))
    if l100 is None or l150 is None:
        return None, None, "vision missing 100% or 150% applied load"
    # 100% appears twice (load/unload) — both must agree if the second was read.
    if l100b is not None and l100b != l100:
        return None, None, f"100% rows disagree ({l100} vs {l100b}) — table read ambiguous"
    # 150% must exceed 100%.
    if not (l150 > l100):
        return None, None, f"150% load ({l150}) does not exceed 100% load ({l100})"
    return l100, l150, None


# ---------------- main extraction ----------------
def extract(projnum, dump=False):
    result = {
        "projnum": projnum,
        "ap_reaction_modulus_pci": None,
        "ap_design_diameter_ft": None,
        "diameter_of_plate_ft": None,
        "ap_design_load_kips": None,
        "ap_max_test_load_kips": None,
        "confidence": "high",
        "needs_review": False,
        "review_reasons": [],
        "source": {"pdf_name": None, "gi100_page": None, "gi200_page": None},
    }

    def flag(reason):
        result["needs_review"] = True
        result["confidence"] = "low"
        result["review_reasons"].append(reason)

    if not DRIVE_ID:
        flag("SP_DRIVE_ID not set in /home/aiciv/.env")
        return result

    token = pf_email._token()

    folder = resolve_project_folder(token, projnum)
    if not folder:
        flag(f"project folder for {projnum} not found under {PROJECTS_BASE}")
        return result

    pdf_item, sub = resolve_approved_pdf(token, folder)
    if not pdf_item:
        flag(f"no Approved Shop Dwgs PDF found under {folder}/{ENG_BASE}/{{Approved Shop Dwgs}}")
        return result
    result["source"]["pdf_name"] = pdf_item.get("name")

    fd, pdf_path = tempfile.mkstemp(prefix=f"approved_{projnum}_", suffix=".pdf")
    os.close(fd)
    try:
        download_item_content(token, pdf_item["id"], pdf_path)
        doc = fitz.open(pdf_path)

        gi100 = find_sheet_page(doc, GI100_RE)
        gi200 = find_sheet_page(doc, GI200_RE)
        result["source"]["gi100_page"] = (gi100 + 1) if gi100 is not None else None
        result["source"]["gi200_page"] = (gi200 + 1) if gi200 is not None else None

        # --- text values ---
        modulus, err = extract_modulus(doc, gi100)
        if err:
            flag(err)
        else:
            result["ap_reaction_modulus_pci"] = _num(modulus)

        dia_ft, err = extract_diameter_ft(doc, gi200)
        if err:
            flag(err)
        else:
            result["ap_design_diameter_ft"] = _num(dia_ft)
            result["diameter_of_plate_ft"] = _num(dia_ft)

        # --- vision values ---
        if gi200 is None:
            flag("GI-200 not found — cannot read Modulus Test Schedule")
        else:
            png, err = render_schedule_crop(doc, gi200, dump=dump)
            if err:
                flag(err)
            else:
                if dump:
                    result["source"]["schedule_crop"] = png
                vdict, err = vision_read_schedule(png)
                if err:
                    flag(f"vision: {err}")
                else:
                    design_load, max_load, err = check_loads(vdict)
                    if err:
                        flag(f"schedule integrity: {err}")
                    else:
                        result["ap_design_load_kips"] = _num(design_load)
                        result["ap_max_test_load_kips"] = _num(max_load)
                if not dump:
                    try:
                        os.remove(png)
                    except OSError:
                        pass
        doc.close()
    finally:
        if not dump:
            try:
                os.remove(pdf_path)
            except OSError:
                pass
        else:
            result["source"]["pdf_local"] = pdf_path

    return result


def main():
    ap = argparse.ArgumentParser(description="Extract AP Testing criteria from a project's Approved Shop Dwgs PDF (prints JSON; no side effects).")
    ap.add_argument("projnum", nargs="?", help="Project number, e.g. 26-013")
    ap.add_argument("--only", help="Project number (alias for positional)")
    ap.add_argument("--dump", action="store_true", help="Save the schedule crop + PDF to /tmp for inspection")
    args = ap.parse_args()

    projnum = args.only or args.projnum
    if not projnum:
        ap.error("provide a project number (positional or --only NN-NNN)")
    projnum = projnum.strip()
    if not PROJNUM_RE.match(projnum):
        ap.error(f"'{projnum}' is not a valid NN-NNN project number")

    result = extract(projnum, dump=args.dump)
    print(json.dumps(result, indent=2))
    # exit non-zero if it needs review, so a caller/daemon can branch on it
    sys.exit(2 if result["needs_review"] else 0)


if __name__ == "__main__":
    main()
