#!/usr/bin/env python3
"""
build-schedule.py - Generate platform/data/schedule-data.js for the Crew Scheduling view.

Reads:  platform/data/project-master.json (key "projects")  -> dates, status, value, %complete
        platform/data/bid-log.json        (key "bids")      -> total_lf, total_columns, feed_type
Writes: platform/data/schedule-data.js  (var SCHEDULE_JOBS=[...]; var CREWS=[...]; var SCHEDULE_META={...})

The page loads this static JS (same pattern as production-data.js / live-data.js).

KEY ASSUMPTIONS (documented for review):
  1. Working-day -> calendar conversion: duration_days are WORKING days. PF works a
     6-day week (Mon-Sat), Sundays off. We walk forward from projected_start, counting
     Mon-Sat as work days and skipping Sundays, to find the calendar end date. So a
     6-working-day job starting Monday spans Mon..Sat (6 cal days). A 10-working-day job
     spans ~12 calendar days (one Sunday skipped per 6 work days).
  2. #men: project-master/bid-log carry no per-job crew size. Crew complement (men) is a
     CREW attribute (a crew is a fixed team), not a per-job number, so men is read from
     the assigned crew config, not the job. Default VSC crew complement = 4.
  3. LF / columns / feed: joined from bid-log.json by project_number. If no bid-log match,
     LF/columns are null and the job still schedules (shows "--").
  4. Crew assignment: only Crew 1 (John W) is active now, so every AWARDED/PROBABLE job is
     assigned to crew 1. The 'crew' field is preserved so multi-crew balancing works later.
  5. Scheduling scope: only jobs with a real projected_start AND a duration get a Gantt bar.
     Jobs with no start date (TPS Dayton, Schaff CPA, Molto, Park&Poplar w/o start) still
     roll up into status buckets but are listed as UNSCHEDULED (no bar).
"""

import json
import os
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
PM_PATH = DATA / "project-master.json"
BID_PATH = DATA / "bid-log.json"
OUT_PATH = DATA / "schedule-data.js"

# ---- CONFIG-DRIVEN CREWS -------------------------------------------------
# Adding a crew = add one entry here. The view renders all lanes from this array.
# 'men' = standard crew complement. 'active' gates whether the lane accepts jobs now.
CREWS = [
    {
        "id": "crew-1",
        "lead": "John W",
        "equipmentSet": "Cat 336 + vibro / 80K excavator / F550",
        "men": 4,
        "activeFrom": "2026-01-01",
        "active": True,
    },
    {
        "id": "crew-2",
        "lead": "TBD",
        "equipmentSet": "Second rig (planned)",
        "men": 4,
        "activeFrom": "2026-12-31",
        "active": False,
    },
]

# ---- STATUS BUCKETS ------------------------------------------------------
# bucket id -> display label + whether it counts as AWARDED (vs PROBABLE)
BUCKETS = {
    "completed":  {"label": "Projects Completed",        "awarded": True},
    "finalized":  {"label": "Contract Finalized",        "awarded": True},
    "loi":        {"label": "Verbal Award / LOI",        "awarded": True},
    "likely":     {"label": "Likely Award (pending call)","awarded": False},
    "running":    {"label": "In the Running",            "awarded": False},
}
BUCKET_ORDER = ["completed", "finalized", "loi", "likely", "running"]


def map_status(contract_status, work_pct):
    """Map raw contract_status (+ %complete) into a status bucket id."""
    # Completed wins regardless of contract wording.
    try:
        if work_pct is not None and float(work_pct) >= 1.0:
            return "completed"
    except (TypeError, ValueError):
        pass

    s = (contract_status or "").strip().lower()
    if not s:
        # No status + has a start date -> treat as probable in-running; otherwise running.
        return "running"

    # Contract Finalized: subcontract/contract fully executed or signed copy returned.
    if ("subcontract" in s) or ("contract fe" in s) or ("sent signed" in s) or \
       (s.startswith("contract")):
        return "finalized"
    # Verbal Award / LOI: any LOI language.
    if "loi" in s:
        return "loi"
    # Likely award pending call (kept as an explicit bucket for future use).
    if "likely" in s or "verbal" in s or "pending" in s:
        return "likely"
    # Everything else (bidding / quoted / in the running).
    if "bid" in s or "quote" in s or "running" in s or "submitted" in s:
        return "running"
    # Default fallthrough.
    return "running"


def parse_date(v):
    """Parse 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD' -> date, else None."""
    if not v or not str(v).strip():
        return None
    s = str(v).strip().split(" ")[0]
    try:
        return dt.datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def working_days_to_end(start, work_days):
    """
    Walk forward from start, counting Mon-Sat as work days (skip Sunday=6),
    return the calendar end date (inclusive of the last work day).
    """
    if work_days is None or work_days <= 0:
        return start
    counted = 0
    cur = start
    # The start day itself is the first candidate work day.
    while True:
        if cur.weekday() != 6:  # not Sunday
            counted += 1
            if counted >= work_days:
                return cur
        cur += dt.timedelta(days=1)


def load_bid_index():
    """number(str) -> {total_lf, total_columns, feed_type} from bid-log.json."""
    bids = json.load(open(BID_PATH))["bids"]
    idx = {}
    for b in bids:
        num = (b.get("number") or "").strip()
        if not num or num == "Project Number":
            continue
        idx[num] = {
            "lf": b.get("total_lf"),
            "columns": b.get("total_columns"),
            "feed": (b.get("feed_type") or "").strip() or None,
        }
    return idx


def first_line(s):
    return (s or "").split("\n")[0].strip()


def main():
    pm = json.load(open(PM_PATH))
    projects = pm["projects"]
    bidx = load_bid_index()

    crew1 = CREWS[0]["id"]  # only active crew today

    jobs = []
    for p in projects:
        name = first_line(p.get("name"))
        # Filter out the junk header row.
        if not name or name == "Project Name":
            continue

        num = str(p.get("project_number", "")).strip()
        bucket = map_status(p.get("contract_status"), p.get("work_pct_complete"))
        start = parse_date(p.get("projected_start"))
        dur = p.get("duration_days")
        try:
            dur = int(dur) if dur not in (None, "", "Duration (Days)") else None
        except (TypeError, ValueError):
            dur = None
        # A job with a real start but missing/zero duration would silently drop off the
        # Gantt. Default committed work to 1 working day so it always shows. Jobs with NO
        # start date stay unscheduled (listed separately), which is intended.
        if start and not dur:
            dur = 1

        end = working_days_to_end(start, dur) if (start and dur) else None
        bid = bidx.get(num, {})

        try:
            wpc = float(p.get("work_pct_complete") or 0)
        except (TypeError, ValueError):
            wpc = 0.0

        jobs.append({
            "number": num,
            "name": name,
            "city_state": (p.get("city_state") or "").strip(),
            "gc_name": (p.get("gc_name") or "").strip(),
            "value": p.get("subcontract_value") if isinstance(p.get("subcontract_value"), (int, float)) else None,
            "status_raw": (p.get("contract_status") or "").strip(),
            "bucket": bucket,
            "pct_complete": round(wpc, 3),
            "lf": bid.get("lf"),
            "columns": bid.get("columns"),
            "feed": bid.get("feed"),
            "work_days": dur,
            "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None,
            # Assignment: only crew 1 active -> all scheduled jobs go to crew 1.
            "crew": crew1 if (start and end) else None,
            "scheduled": bool(start and end),
        })

    meta = {
        "generated": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "source": "project-master.json (dates/status/value) + bid-log.json (LF/columns/feed)",
        "buckets": [{"id": b, "label": BUCKETS[b]["label"], "awarded": BUCKETS[b]["awarded"]}
                    for b in BUCKET_ORDER],
        "work_week": "Mon-Sat (Sunday off); duration_days are working days",
        "default_crew_men": CREWS[0]["men"],
    }

    out = []
    out.append("/* GENERATED by sync/build-schedule.py - do not edit by hand */")
    out.append("var CREWS = " + json.dumps(CREWS, indent=2) + ";")
    out.append("var SCHEDULE_JOBS = " + json.dumps(jobs, indent=2) + ";")
    out.append("var SCHEDULE_META = " + json.dumps(meta, indent=2) + ";")
    OUT_PATH.write_text("\n".join(out) + "\n")

    # Console summary for the operator.
    sched = [j for j in jobs if j["scheduled"]]
    print(f"Wrote {OUT_PATH}")
    print(f"  Projects (after header filter): {len(jobs)}")
    print(f"  Scheduled (have start+duration): {len(sched)}")
    print(f"  Unscheduled (no start/duration): {len(jobs)-len(sched)}")
    print(f"  Crews defined: {len(CREWS)} (active: {sum(1 for c in CREWS if c['active'])})")
    from collections import Counter
    bc = Counter(j["bucket"] for j in jobs)
    for b in BUCKET_ORDER:
        print(f"    {BUCKETS[b]['label']:28} {bc.get(b,0)}")


if __name__ == "__main__":
    main()
