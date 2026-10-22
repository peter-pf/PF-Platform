#!/usr/bin/env python3
"""
geocode-job-coords.py — pre-compute lat/lon for PF field job sites.

Strategy:
  1. Try the full site address first (from fo-projects-data.js).
  2. If the address is null OR Nominatim returns no result, fall back to
     "City, ST" (city_state field).  Record which level was used.
  3. Write output to field/functions/lib/job-coords.js.

Run from the repo root:
    python3 field/scripts/geocode-job-coords.py

WHY this runs on this box, not in the Worker:
  Nominatim has a 1-req/sec policy and is not suitable for real-time
  Worker calls.  The US Census Geocoder rejects Cloudflare IPs entirely.
  Precomputing coords and bundling them at deploy time is the correct
  pattern: fast at request time, deterministic, no external dependency.

REFRESH CADENCE:
  Run this script (or build-fo-projects-field.py, which calls it) whenever
  new projects are added to fo-projects-data.js / fo-projects-field.js.
"""

import json, time, sys, os
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from datetime import date

NOMINATIM_UA  = "PF-Field-Portal/1.0 (peter@pierfoundations.com)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
RATE_DELAY    = 1.1  # Nominatim policy: max 1 req/sec

# ── Master job data ────────────────────────────────────────────────────────
# Sync with fo-projects-data.js and fo-projects-field.js when new jobs are added.
# address: full street address or None
# city_state: always present — used as fallback when address is None or not found
#
# Source for addresses: platform/data/project-master.json
# Source for city_state: platform/data/fo-projects-field.js

JOB_DATA = {
    "25-026":  {
        "name":       "The Granary",
        "address":    "S 8th St & Walnut St, Noblesville, IN 46060",
        "city_state": "Noblesville, IN",
    },
    "26-001":  {
        "name":       "WPAFB Housing Project",
        "address":    "Talbott Rd and Locust Street, Wright Patterson AFB, OH 45433",
        "city_state": "Wright Patterson AFB, OH",
    },
    "26-002":  {
        "name":       "POET Bioprocessing - Shelbyville",
        "address":    "2373 W 300 N, Shelbyville, IN 46176",
        "city_state": "Shelbyville, IN",
    },
    "26-007":  {
        "name":       "Madison Lifestyle District Parking Garage",
        "address":    "416 Dr Martin Luther King Jr Blvd, South Bend, IN 46601",
        "city_state": "South Bend, IN",
    },
    "26-008":  {
        "name":       "INAW Terre Haute WTF GAC Addition",
        "address":    "51 Locust St, Terre Haute, IN 47807",
        "city_state": "Terre Haute, IN",
    },
    "26-009":  {
        "name":       "International School of IN - New International Plaza",
        "address":    "4330 N Michigan Rd, Indianapolis, IN 46208",
        "city_state": "Indianapolis, IN",
    },
    "26-010":  {
        "name":       "Founders Park Ph II",
        "address":    "550 Riverfront Lane, Columbus, OH 43201",
        "city_state": "Columbus, OH",
    },
    "26-011":  {
        "name":       "Indianapolis Housing Hub",
        "address":    "1010 E Georgia St, Indianapolis, IN 46202",
        "city_state": "Indianapolis, IN",
    },
    "26-012":  {
        "name":       "Warrick Place",
        "address":    "3838 E Washington St, Indianapolis, IN 46204",
        "city_state": "Indianapolis, IN",
    },
    "26-013":  {
        "name":       "Park & Poplar",
        "address":    "Westfield Boulevard & Park Street, Westfield, IN 46074",
        "city_state": "Westfield, IN",
    },
    "26-014":  {
        "name":       "TPS Dayton",
        "address":    "125 Sears Street, Dayton, OH 45402",
        "city_state": "Dayton, OH",
    },
    "26-015":  {
        "name":       "Schaaf CPA HQ Building",
        "address":    "250 North Union Street, Westfield, IN 46074",
        "city_state": "Westfield, IN",
    },
    "26-016":  {
        "name":       "Filager Campus Improvement Phase II",
        "address":    "4011 Filager Road, Batavia, OH 45103",
        "city_state": "Batavia, OH",
    },
    "26-017":  {
        "name":       "Molto Canal Pointe",
        "address":    None,  # street address incomplete in PM — use city fallback
        "city_state": "Canal Winchester, OH",
    },
    "26-022":  {
        "name":       "DFS Grain Bins",
        "address":    "2905 S 33rd St, Oskaloosa, IA 52577",
        "city_state": "Oskaloosa, IA",
    },
    "25-2001": {
        "name":       "Greenways Trail ITP Extension",
        "address":    None,
        "city_state": "Plymouth, IN",
    },
    "25-2002": {
        "name":       "Herrick Village",
        "address":    None,
        "city_state": "Racine, WI",
    },
}


def geocode(query):
    """Geocode a query string via Nominatim. Returns (lat, lon) floats or None."""
    params = urlencode({"q": query, "format": "json", "limit": "1"})
    req = Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": NOMINATIM_UA},
    )
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  geocode error: {e}", file=sys.stderr)
    return None


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path   = os.path.normpath(
        os.path.join(script_dir, "..", "functions", "lib", "job-coords.js")
    )

    coords = {}
    today  = date.today().isoformat()

    print(f"Geocoding {len(JOB_DATA)} jobs via Nominatim (address-first, city fallback)...")
    print()

    for job_num, info in JOB_DATA.items():
        name       = info["name"]
        address    = info["address"]
        city_state = info["city_state"]

        result = None
        level  = None

        # Step 1: try full address
        if address:
            print(f"  {job_num} [{name[:35]}] address: {address!r} ...", end=" ", flush=True)
            result = geocode(address)
            if result:
                level = "address"
                lat, lon = result
                print(f"OK  lat={lat:.5f}, lon={lon:.5f}")
            else:
                print("NOT FOUND — trying city fallback")
            time.sleep(RATE_DELAY)

        # Step 2: city_state fallback
        if result is None and city_state:
            print(f"  {job_num} [{name[:35]}] city:    {city_state!r} ...", end=" ", flush=True)
            result = geocode(city_state)
            if result:
                level = "city"
                lat, lon = result
                print(f"OK  lat={lat:.5f}, lon={lon:.5f}")
            else:
                print("NOT FOUND")
            time.sleep(RATE_DELAY)

        if result:
            coords[job_num] = {
                "lat":    round(lat, 5),
                "lon":    round(lon, 5),
                "level":  level,
                "source": "nominatim",
                "date":   today,
            }
        else:
            coords[job_num] = None
            print(f"  {job_num}: no address and city lookup failed — null")

    # Build the JS output
    lines = [
        "// AUTO-GENERATED by field/scripts/geocode-job-coords.py",
        "// DO NOT EDIT BY HAND. Re-run the script (or build-fo-projects-field.py)",
        "// when job addresses change.",
        "//",
        "// Each entry: { lat, lon, level, source, date } or null (no location on file).",
        "//   level: 'address' = geocoded from full street address",
        "//          'city'    = geocoded from city/state only (address unavailable or not found)",
        "//   null entry → Worker shows 'No site location on file for this job'",
        "//",
        "// Used by /api/weather to skip geocoding at request time.",
        f"// Last generated: {today}",
        "",
        "export const JOB_COORDS = {",
    ]
    for job_num, entry in coords.items():
        if entry is None:
            lines.append(f"  {json.dumps(job_num)}: null,")
        else:
            lines.append(
                f"  {json.dumps(job_num)}: "
                f"{{ lat: {entry['lat']}, lon: {entry['lon']}, "
                f"level: {json.dumps(entry['level'])}, "
                f"source: {json.dumps(entry['source'])}, "
                f"date: {json.dumps(entry['date'])} }},"
            )
    lines += ["};", ""]

    with open(out_path, "w") as f:
        f.write("\n".join(lines))

    non_null = sum(1 for v in coords.values() if v is not None)
    addr_lvl = sum(1 for v in coords.values() if v and v.get("level") == "address")
    city_lvl = sum(1 for v in coords.values() if v and v.get("level") == "city")
    print()
    print(f"Wrote {out_path}")
    print(f"Coverage: {non_null}/{len(coords)} jobs have coords "
          f"({addr_lvl} address-level, {city_lvl} city-level)")


if __name__ == "__main__":
    main()
