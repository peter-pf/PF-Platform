#!/usr/bin/env python3
"""
Precon Dashboard ingest (build-precon-dashboard.py)
===================================================
Derives PERIOD (month / quarter / annual) KPIs for the Preconstruction
(bid pipeline) view from the SAME bid-log source the precon pipeline uses.

Output: platform/data/precon-dashboard.js  (window.PF_PRECON_DASH = {...})
shaped EXACTLY like data/pf-dashboard.js so it renders through the SHARED
window.PFDashboard.render(...) engine in index.html.

SOURCE (in priority order):
  1. --xlsx <path>  : a Project Bid Log .xlsx (re-runs the precon parser)  [optional]
  2. SharePoint     : download Project Bid Log.xlsx (needs Graph token)     [optional]
  3. data/precon-pipeline.js (DEFAULT) : the already-parsed, already-bucketed
     bid-log feed (window.PF_PRECON). This is the same bid-log source, already
     cleaned + section-bucketed, so deriving from it is reproducible with NO
     token and NO network. This is the default path.

KPIs emitted (only metrics with a REAL source column — nothing fabricated):
  - Bid Invites          (count)        : jobs with an Invite Date in the period
  - Bids Sent            (count_money)  : jobs with a Date Submitted in the period;
                                          $ = sum of Bid Total Value submitted
  - Budget Pricing       (count)        : budget-pricing-stage jobs, by Invite Date
  - Awarded              (count_money)  : awarded-stage jobs, by Date Submitted
                                          (winning bid's submit date — see NOTE);
                                          $ = sum of awarded Bid Total Value
  - Not Awarded          (count)        : not-awarded-stage jobs, by Date Submitted
  - Win Rate             (pct)          : awarded / (awarded + not_awarded) decided

NOTE (honesty): the bid log has NO dedicated "Award Date" column. Awarded /
Not Awarded are dated by their Date Submitted (the date the bid that was later
won/lost was sent). This is documented in the feed banner + here. If an
"Award Date" column is added to the bid log later, switch AWARDED_DATE_FIELD.

GATING: this is BID/PIPELINE (project-level) data, NOT company P&L. Area =
`preconstruction` (auth.js DATA_FILE_AREAS maps /data/precon-dashboard.js ->
'preconstruction'). admin + partner + business_dev see it; field_ops BLOCKED.

Thread caps are set BEFORE importing openpyxl (solved-box-gotchas).

Usage:
  python3 build-precon-dashboard.py                 # default: read data/precon-pipeline.js
  python3 build-precon-dashboard.py --year 2026     # force the dashboard year
  python3 build-precon-dashboard.py --xlsx /path/to/Project_Bid_Log.xlsx
"""

# --- thread caps BEFORE any heavy import ---
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
           "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ.setdefault(_v, "1")

import sys
import re
import json
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.dirname(HERE)
DATA_DIR = os.path.join(PLATFORM, "data")
PRECON_JS = os.path.join(DATA_DIR, "precon-pipeline.js")
OUT_JS = os.path.join(DATA_DIR, "precon-dashboard.js")

SOURCE_FILE = "Project Bid Log.xlsx"
SOURCE_TAB = "Agg Pier + Helical Pier Bid Logs"

MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December']
QUARTERS = {
    'Q1': ['January', 'February', 'March'],
    'Q2': ['April', 'May', 'June'],
    'Q3': ['July', 'August', 'September'],
    'Q4': ['October', 'November', 'December'],
}

# metric -> type (the SAME types the shared engine understands)
METRICS = [
    ('Bid Invites',     'count'),
    ('Bids Sent',       'count_money'),
    ('Budget Pricing',  'count'),
    ('Awarded',         'count_money'),
    ('Not Awarded',     'count'),
    ('Win Rate',        'pct'),
]

# Which bid-log date field dates each stage's jobs.
AWARDED_DATE_FIELD = 'Date Submitted'   # no dedicated Award Date column exists


def load_precon_feed():
    """Parse window.PF_PRECON out of data/precon-pipeline.js (no token needed)."""
    with open(PRECON_JS, "r") as f:
        txt = f.read()
    m = re.search(r"window\.PF_PRECON\s*=\s*", txt)
    if not m:
        raise SystemExit("Could not find window.PF_PRECON in %s" % PRECON_JS)
    body = txt[m.end():].rstrip()
    if body.endswith(";"):
        body = body[:-1]
    return json.loads(body)


def jobs_from_feed(feed):
    """Flatten PF_PRECON into a list of {discipline, section, value, invite, submit}."""
    out = []
    for disc in ("ap", "hp"):
        buckets = feed.get(disc, {})
        for section, rows in buckets.items():
            for r in rows:
                fields = r.get("fields", {}) or {}
                out.append({
                    "discipline": disc,
                    "section": section,
                    "value": _num(r.get("value")),
                    "invite": _ym(r.get("invite_date") or fields.get("Invite Date")),
                    "submit": _ym(fields.get("Date Submitted")),
                })
    return out


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^\d.\-]", "", str(v))
    if s in ("", "-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _ym(v):
    """Return (year:int, monthIndex:0-11) from an ISO-ish date string, else None."""
    if not v:
        return None
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})", s)
    if not m:
        return None
    y = int(m.group(1)); mo = int(m.group(2))
    if mo < 1 or mo > 12:
        return None
    return (y, mo - 1)


def build(jobs, year):
    """Bucket jobs into monthly KPI rows for the chosen year."""
    # accumulators: per month index 0-11 -> metric -> {qty, amt}
    blank = lambda: {name: {"qty": 0, "amt": 0.0, "has": False} for name, _ in METRICS}
    months_acc = [blank() for _ in range(12)]

    def hit(mi, name, qty=0, amt=0.0):
        a = months_acc[mi][name]
        a["qty"] += qty
        a["amt"] += amt
        a["has"] = True

    for j in jobs:
        inv = j["invite"]
        sub = j["submit"]
        # Bid Invites -> by invite date
        if inv and inv[0] == year:
            hit(inv[1], 'Bid Invites', qty=1)
        # Bids Sent -> by submit date (count + $)
        if sub and sub[0] == year:
            hit(sub[1], 'Bids Sent', qty=1, amt=(j["value"] or 0.0))
        # Budget Pricing -> stage bucket, dated by invite
        if j["section"] == "budget_pricing" and inv and inv[0] == year:
            hit(inv[1], 'Budget Pricing', qty=1)
        # Awarded -> stage bucket, dated by submit (count + $)
        if j["section"] == "awarded" and sub and sub[0] == year:
            hit(sub[1], 'Awarded', qty=1, amt=(j["value"] or 0.0))
        # Not Awarded -> stage bucket, dated by submit
        if j["section"] == "not_awarded" and sub and sub[0] == year:
            hit(sub[1], 'Not Awarded', qty=1)

    months = {}
    month_has_data = {}
    for mi, mname in enumerate(MONTH_ORDER):
        acc = months_acc[mi]
        rows = []
        any_data = False
        for name, typ in METRICS:
            if name == 'Win Rate':
                aw = acc['Awarded']["qty"]
                na = acc['Not Awarded']["qty"]
                decided = aw + na
                pctv = (aw / decided) if decided > 0 else None
                rows.append({
                    'metric': name, 'type': 'pct',
                    'qtyActual': None, 'qtyGoal': None,
                    'amtActual': pctv, 'amtBudget': None, 'delta': None,
                })
                continue
            a = acc[name]
            qty = a["qty"] if a["has"] else None
            amt = a["amt"] if (typ == 'count_money' and a["has"]) else None
            if a["has"]:
                any_data = True
            rows.append({
                'metric': name, 'type': typ,
                'qtyActual': qty, 'qtyGoal': None,
                'amtActual': amt, 'amtBudget': None, 'delta': None,
            })
        months[mname] = {'rows': rows}
        month_has_data[mname] = any_data

    # Detect template/identical-month data (parity with build-pf-dashboard.py):
    # if every populated month is byte-identical, the feed is placeholder data.
    def sig(m):
        return json.dumps(months[m]['rows'], sort_keys=True)
    populated = [m for m in MONTH_ORDER if month_has_data[m]]
    is_template = len(populated) > 1 and len({sig(m) for m in populated}) == 1

    out = {
        'year': year,
        'sourceFile': SOURCE_FILE,
        'sourceTab': SOURCE_TAB,
        'syncedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'isTemplateData': is_template,
        'monthOrder': MONTH_ORDER,
        'quarters': QUARTERS,
        'monthHasData': month_has_data,
        'metricsMeta': [_meta_entry(n, t) for (n, t) in METRICS],
        'months': months,
    }
    return out


def _meta_entry(name, typ):
    """metricsMeta entry; pct metrics that are a ratio of counts declare a basis
    so the engine rolls them up as a POOLED ratio (sum num / sum den) over a
    quarter/year instead of averaging the monthly rates."""
    entry = {'metric': name, 'type': typ}
    if name == 'Win Rate':
        # Win Rate = Awarded / (Awarded + Not Awarded), pooled over the period.
        entry['basisNum'] = 'Awarded'
        entry['basisDen'] = ['Awarded', 'Not Awarded']
    return entry


def pick_year(jobs, forced):
    if forced:
        return int(forced)
    years = {}
    for j in jobs:
        for k in ("invite", "submit"):
            if j[k]:
                years[j[k][0]] = years.get(j[k][0], 0) + 1
    if not years:
        return datetime.datetime.now(datetime.timezone.utc).year
    # The year with the MOST data points (not the max year) so a single stray /
    # typo date (e.g. a "2028" invite) cannot hijack the dashboard year. Ties
    # break to the more recent year.
    best = max(years.items(), key=lambda kv: (kv[1], kv[0]))
    return best[0]


def write_js(data):
    note = (
        "// AUTO-GENERATED by sync/build-precon-dashboard.py — DO NOT EDIT BY HAND.\n"
        "// Source: %s (the bid log; derived via data/precon-pipeline.js)  synced %s\n"
        "// Preconstruction PERIOD KPIs (invites / bids sent / budget pricing /\n"
        "// awarded / not awarded / win rate). Awarded + Not Awarded are dated by\n"
        "// Date Submitted (no dedicated Award Date column exists in the bid log).\n"
        "// ACCESS: preconstruction — admin/partner/business_dev (field_ops BLOCKED).\n"
        % (data['sourceFile'], data['syncedAt'])
    )
    body = "window.PF_PRECON_DASH = " + json.dumps(data, indent=2) + ";\n"
    with open(OUT_JS, "w") as f:
        f.write(note + body)
    populated = [m for m in data['monthOrder'] if data['monthHasData'][m]]
    print("wrote", OUT_JS,
          "(year %s, %d metrics, %d months with data: %s)"
          % (data['year'], len(data['metricsMeta']), len(populated), ", ".join(populated)))


def main():
    forced_year = None
    if "--year" in sys.argv:
        forced_year = sys.argv[sys.argv.index("--year") + 1]

    if "--xlsx" in sys.argv:
        # Re-parse a raw bid log via the existing precon parser, then derive.
        sys.path.insert(0, HERE)
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "build_precon_pipeline", os.path.join(HERE, "build-precon-pipeline.py"))
        bpp = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bpp)  # noqa
        path = sys.argv[sys.argv.index("--xlsx") + 1]
        with open(path, "rb") as f:
            feed = bpp.build(f.read()) if hasattr(bpp, "build") else None
        if feed is None:
            raise SystemExit("precon parser has no build(); falling back not supported via --xlsx")
    else:
        feed = load_precon_feed()

    jobs = jobs_from_feed(feed)
    year = pick_year(jobs, forced_year)
    data = build(jobs, year)
    write_js(data)


if __name__ == "__main__":
    main()
