#!/usr/bin/env python3
"""
seed-schedule-state.py - ONE-TIME import: build the editable schedule STATE
model (the KV source of truth) from the existing generated schedule-data.js,
applying the CEO's current-reality corrections.

After this runs once, the KV store at key schedule:state:v1 is authoritative.
This script does NOT auto-overwrite from the WIP tab on every build; it is a
manual seed step. Re-running it overwrites the store with a fresh seed (only do
that intentionally).

STATE MODEL (per project):
  {id, name, crew, status, lf, columns, feed, value,
   mobilizations:[{start:"YYYY-MM-DD", work_days:N, columns:N, label, done:bool}],
   done:bool}

CORRECTIONS applied (CEO, current reality):
  - The Granary  -> start 2026-08-20, work_days 14 (was a mid-May seed bar)
  - Old National Bank -> DONE
  - Madison (Madison Style District Parking Garage) -> mob 1 DONE, plus a 2nd
    mobilization "Utility relocation return" ~120 columns, placeholder date ~6
    weeks out (user drags to adjust).

Run with: OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python3 seed-schedule-state.py
Outputs:  platform/data/schedule-seed-state.json  (the seed payload)
The same JSON is also what the front-end embeds as the fallback seed and what we
PUT into KV once.
"""
import json
import re
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
SRC = DATA / "schedule-data.js"
OUT = DATA / "schedule-seed-state.json"
SEED_JS = DATA / "schedule-seed.js"  # embeddable fallback, generated FROM the JSON


def load_generated():
    """Pull the JSON arrays out of the generated schedule-data.js."""
    txt = SRC.read_text()

    def grab(varname):
        m = re.search(r"var\s+" + varname + r"\s*=\s*(\[.*?\]|\{.*?\});", txt, re.S)
        if not m:
            raise SystemExit(f"Could not find {varname} in {SRC}")
        return json.loads(m.group(1))

    return grab("CREWS"), grab("SCHEDULE_JOBS"), grab("SCHEDULE_META")


def main():
    crews, jobs, meta = load_generated()

    # Map raw bucket id -> simple status string kept on the job.
    out_jobs = []
    for j in jobs:
        jid = (j.get("number") or j.get("name") or "").strip() or j.get("name")
        name = j.get("name")
        crew = j.get("crew") or "crew-1"
        mobs = []
        if j.get("scheduled") and j.get("start") and j.get("work_days"):
            mobs.append({
                "start": j["start"],
                "work_days": int(j["work_days"]),
                "columns": j.get("columns") or 0,
                "label": "Mobilization 1",
                "done": False,
            })
        out_jobs.append({
            "id": jid,
            "number": j.get("number"),
            "name": name,
            "crew": crew,
            "bucket": j.get("bucket"),
            "status_raw": j.get("status_raw"),
            "city_state": j.get("city_state"),
            "gc_name": j.get("gc_name"),
            "lf": j.get("lf"),
            "columns": j.get("columns"),
            "feed": j.get("feed"),
            "value": j.get("value"),
            "mobilizations": mobs,
            "done": False,
        })

    # ---- CORRECTION 1: The Granary -> start 2026-08-20, work_days 14 ----
    granary = next((jb for jb in out_jobs if "Granary" in (jb["name"] or "")), None)
    if granary:
        granary["mobilizations"] = [{
            "start": "2026-08-20",
            "work_days": 14,
            "columns": granary.get("columns") or 0,
            "label": "Mobilization 1",
            "done": False,
        }]
        granary["done"] = False
        # CEO correction: Granary start 2026-08-20, 14 working days (ends 2026-09-04).

    # ---- CORRECTION 2: Old National Bank -> DONE ----
    onb = next((jb for jb in out_jobs if "Old National Bank" in (jb["name"] or "")), None)
    if onb:
        onb["done"] = True
        for m in onb["mobilizations"]:
            m["done"] = True
        # CEO correction: Old National Bank DONE.

    # ---- CORRECTION 3: Madison -> mob1 DONE + 2nd mob "Utility relocation return" ----
    madison = next((jb for jb in out_jobs
                    if "Madison" in (jb["name"] or "")), None)
    if madison:
        if not madison["mobilizations"]:
            madison["mobilizations"] = [{
                "start": "2026-05-11", "work_days": 10,
                "columns": madison.get("columns") or 0,
                "label": "Mobilization 1", "done": True,
            }]
        else:
            madison["mobilizations"][0]["label"] = "Mobilization 1"
            madison["mobilizations"][0]["done"] = True
        # 2nd mob placeholder ~6 weeks after mob1 start (user adjusts)
        mob1_start = madison["mobilizations"][0]["start"] or "2026-05-11"
        placeholder = (dt.date.fromisoformat(mob1_start) + dt.timedelta(weeks=6)).isoformat()
        madison["mobilizations"].append({
            "start": placeholder,
            "work_days": 2,          # ~120 columns ~ a couple working days; user adjusts
            "columns": 120,
            "label": "Utility relocation return",
            "done": False,
        })
        # The project as a whole is NOT done (2nd mob outstanding).
        madison["done"] = False
        # CEO correction: Madison mob1 DONE + 2nd mob "Utility relocation return"
        # ~120 cols, placeholder date (user drags to adjust).

    state = {
        "version": 1,
        "jobs": out_jobs,
        "crews": crews,
        "meta": {
            "source": "Seeded from project-master + bid-log, with CEO corrections",
            "work_week": meta.get("work_week", "Mon-Sat (Sunday off)"),
            "buckets": meta.get("buckets", []),
            "seeded": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        },
    }

    payload = json.dumps(state, indent=2)
    OUT.write_text(payload + "\n")
    # Generate the embeddable fallback seed FROM the same payload so the JSON and
    # the JS can never drift (one source).
    SEED_JS.write_text(
        "/* GENERATED seed fallback for the editable scheduler -- KV is authoritative once seeded. */\n"
        "window.SCHEDULE_SEED = " + payload + ";\n"
    )
    print(f"Wrote {OUT}")
    print(f"Wrote {SEED_JS}")
    print(f"  jobs: {len(out_jobs)}  crews: {len(crews)}")
    # Verify the 3 corrections.
    print("  Granary:", granary["mobilizations"][0] if granary else "MISSING")
    print("  Old National Bank done:", onb["done"] if onb else "MISSING")
    if madison:
        print("  Madison mobs:")
        for m in madison["mobilizations"]:
            print("    ", m["label"], m["start"], "done=" + str(m["done"]),
                  "cols=" + str(m["columns"]))


if __name__ == "__main__":
    main()
