#!/usr/bin/env python3
"""
WRITE the portal "Budget" column into KV — PREP (DO NOT EXECUTE until greenlit)
==============================================================================
Reads the dry-run report (dryrun-budget-column-report.json) and, for every
WRITABLE job, writes the mapped per-row budgets to Cloudflare KV key
`project_budget_v1:<num>` in the SAME shape the portal + /api/project-budget use:
    { version:1, num, rows:{ "g<gi>_r<ri>":{budget,cost_code}, ... },
      _meta:{updatedBy:"budget-sync (Turnover Budget)", updatedAt:<iso>} }

SAFETY (this is FINANCIAL data):
  - DEFAULT MODE = PLAN. Prints exactly what it would do. Writes NOTHING.
    You must pass --execute to actually write, AND the working tree/deploy path
    must be confirmed clean and Brad must have confirmed the job set.
  - Only jobs with report["writable"]==True are touched. Stale-cache / no-workbook
    / all-$0 jobs are SKIPPED (never a fabricated 0).
  - PER-PROJECT BACKUP: before any write, the current KV value for that key is
    fetched and saved to backups/project_budget_v1-<num>-<ts>.json. A restore
    helper (--restore <backupfile>) puts it back verbatim.
  - MERGE, don't clobber: reads existing rows, overlays the workbook budgets by
    row_key (a hand-entered budget for a row NOT in the workbook is preserved).
    Set --replace to instead write ONLY the workbook rows (fresh authoritative).
  - VERIFY after write: re-reads the key and confirms every intended row_key +
    budget landed. Reports PASS/FAIL per job. A mismatch is loud.
  - KV I/O via `wrangler kv key get/put --namespace-id <id> --remote`.
    Requires CLOUDFLARE_API_TOKEN (source /home/aiciv/.env) + thread caps.

Usage (all no-op until --execute):
  python3 write_budget_column.py                       # PLAN (default)
  python3 write_budget_column.py --only 26-013         # PLAN one job
  python3 write_budget_column.py --execute             # WRITE (after greenlight)
  python3 write_budget_column.py --execute --replace   # authoritative overwrite
  python3 write_budget_column.py --restore backups/project_budget_v1-26-013-<ts>.json
"""
import os
for _v in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import re
import sys
import json
import subprocess
from datetime import datetime, timezone

def _load_env(path="/home/aiciv/.env"):
    """Self-sufficient: load + EXPORT .env into this process so wrangler sees
    CLOUDFLARE_API_TOKEN regardless of how the caller sourced things."""
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                if line.startswith("export "):
                    line = line[len("export "):]
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except OSError:
        pass


_load_env()

HERE = os.path.dirname(os.path.abspath(__file__))
REPORT = os.path.join(HERE, "dryrun-budget-column-report.json")
BACKUP_DIR = os.path.join(HERE, "backups")
KV_NAMESPACE_ID = "6c8bd3b9bf3a464ca8d1a5d939231858"  # PF_SCHEDULE (wrangler.toml)
KV_PREFIX = "project_budget_v1:"
UPDATED_BY = "budget-sync (Turnover Budget)"


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def kv_get(num):
    """Return the parsed current KV value for a job, or None if absent."""
    key = KV_PREFIX + num
    r = subprocess.run(
        ["npx", "wrangler", "kv", "key", "get", key,
         "--namespace-id", KV_NAMESPACE_ID, "--remote"],
        cwd=os.path.dirname(HERE), capture_output=True, text=True,
        env={**os.environ, "GOMAXPROCS": "1", "OMP_NUM_THREADS": "1"})
    if r.returncode != 0:
        # wrangler returns non-zero when the key doesn't exist
        if "not found" in (r.stderr + r.stdout).lower():
            return None
        raise RuntimeError(f"kv get {key} failed: {r.stderr[:300]}")
    txt = r.stdout.strip()
    if not txt:
        return None
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return {"_raw": txt}


def kv_put(num, obj):
    key = KV_PREFIX + num
    payload = json.dumps(obj)
    # write value via stdin-safe temp file to avoid arg-length/quoting issues
    tmp = os.path.join(BACKUP_DIR, f".put-{num}.json")
    with open(tmp, "w") as f:
        f.write(payload)
    try:
        r = subprocess.run(
            ["npx", "wrangler", "kv", "key", "put", key,
             "--namespace-id", KV_NAMESPACE_ID, "--remote", "--path", tmp],
            cwd=os.path.dirname(HERE), capture_output=True, text=True,
            env={**os.environ, "GOMAXPROCS": "1", "OMP_NUM_THREADS": "1"})
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    if r.returncode != 0:
        raise RuntimeError(f"kv put {key} failed: {r.stderr[:300]}")
    return True


def backup(num):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    cur = kv_get(num)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = os.path.join(BACKUP_DIR, f"project_budget_v1-{num}-{ts}.json")
    with open(path, "w") as f:
        json.dump({"key": KV_PREFIX + num, "captured": _now(),
                   "value": cur}, f, indent=2)
    return path, cur


def _merge_row(old, new):
    """Merge ONE incoming workbook row (new) onto an existing KV row (old),
    field-by-field, so a BLANK incoming field never erases a non-blank existing one.
      - budget: overwritten only when the incoming row carries a numeric budget
                (workbook budgets win); if 'budget' is absent from new (a
                vendor/notes-only payload), the existing budget is PRESERVED.
      - cost_code: incoming wins when non-empty, else keep existing.
      - vendor / notes: incoming wins when non-empty, else keep existing
                (a blank workbook F/G never blanks a hand-entered value).
    Returns a fresh row dict."""
    old = old if isinstance(old, dict) else {}
    out = dict(old)
    if "budget" in new and new.get("budget") is not None:
        out["budget"] = new["budget"]
    # per-row actual (col D, arithmetic-recovered): incoming numeric value wins;
    # an absent/None actual preserves whatever was already stored. This is what
    # breaks out multi-row cost codes (5405 VSC/Predrill/Fall Off) per line.
    if "actual" in new and new.get("actual") is not None:
        out["actual"] = new["actual"]
    nc = (new.get("cost_code") or "").strip()
    if nc:
        out["cost_code"] = nc
    for fld in ("vendor", "notes"):
        nv = new.get(fld)
        if isinstance(nv, str) and nv.strip():
            out[fld] = nv
    return out


def build_record(num, dry_rows, existing, replace, source_label=None):
    """Compose the KV object to write. dry_rows = {row_key:{budget?,cost_code,vendor?,notes?}}.
    Uses per-row _merge_row so incoming BLANK vendor/notes (or an absent budget)
    never blanks/zeroes an existing value — critical for budget-stale jobs whose KV
    budget is already correct and must be preserved while vendor/notes are added."""
    rows = {}
    if not replace and existing and isinstance(existing.get("rows"), dict):
        rows.update(existing["rows"])  # preserve hand-entered rows not in workbook
    for rk, new in dry_rows.items():
        rows[rk] = _merge_row(rows.get(rk), new)  # field-wise merge, blanks don't erase
    return {"version": 1, "num": num, "rows": rows,
            "_meta": {"updatedBy": UPDATED_BY, "updatedAt": _now(),
                      "source": source_label
                      or "Turnover Budget workbook (Budget vs Actual, col C/F/G)"}}


def verify(num, intended_rows):
    """Re-read KV and confirm every intended row_key/budget is present.
    (Budget-only integrity check — the financially-critical field — UNCHANGED.)"""
    cur = kv_get(num)
    if not cur or not isinstance(cur.get("rows"), dict):
        return False, "no rows after write"
    got = cur["rows"]
    for rk, v in intended_rows.items():
        if rk not in got:
            return False, f"missing {rk}"
        if "budget" not in v:
            continue  # vendor/notes-only intended row: not a budget assertion
        if abs(float(got[rk].get("budget", -1)) - float(v["budget"])) > 0.005:
            return False, f"budget mismatch at {rk}: {got[rk].get('budget')} != {v['budget']}"
    return True, f"{len(intended_rows)} rows verified"


def verify_meta(num, meta_rows, budget_before):
    """Confirm each vendor/notes row landed AND that budgets we did not intend to
    change are byte-for-byte preserved. budget_before = {row_key: budget} captured
    from the pre-write KV. Returns (ok, msg). This is the guard that a vendor/notes
    write NEVER disturbs an existing (possibly stale-cache) budget."""
    cur = kv_get(num)
    if not cur or not isinstance(cur.get("rows"), dict):
        return False, "no rows after write"
    got = cur["rows"]
    for rk, v in meta_rows.items():
        if rk not in got:
            return False, f"missing meta row {rk}"
        for fld in ("vendor", "notes"):
            want = (v.get(fld) or "")
            if want and got[rk].get(fld) != want:
                return False, f"{fld} mismatch at {rk}"
        if v.get("actual") is not None:
            ga = got[rk].get("actual")
            if ga is None or abs(float(ga) - float(v["actual"])) > 0.005:
                return False, f"actual mismatch at {rk}: {v['actual']} != {ga}"
    # budgets must be unchanged from before
    for rk, b in budget_before.items():
        gb = got.get(rk, {}).get("budget")
        if b is None:
            continue
        if gb is None or abs(float(gb) - float(b)) > 0.005:
            return False, f"BUDGET CHANGED at {rk}: {b} -> {gb}"
    return True, f"{len(meta_rows)} vendor/notes rows verified, budgets preserved"


def restore(backup_file):
    with open(backup_file) as f:
        b = json.load(f)
    key = b["key"]
    num = key.split(":", 1)[1]
    val = b["value"]
    if val is None:
        print(f"Backup shows key {key} was ABSENT. To restore-absence, delete the key manually.")
        return
    kv_put(num, val)
    print(f"Restored {key} from {backup_file}")


def main():
    args = sys.argv[1:]
    if "--restore" in args:
        i = args.index("--restore")
        restore(args[i + 1])
        return

    execute = "--execute" in args
    replace = "--replace" in args
    only = set()
    i = 0
    while i < len(args):
        if args[i] == "--only" and i + 1 < len(args):
            only.add(args[i + 1]); i += 2
        else:
            i += 1

    if not os.path.exists(REPORT):
        print(f"ERROR: dry-run report not found: {REPORT}\nRun dryrun_budget_column.py first.",
              file=sys.stderr)
        sys.exit(1)
    report = json.load(open(REPORT))
    projects = report["projects"]
    writable = [p for p in projects if p.get("writable")]
    if only:
        writable = [p for p in writable if p["job"] in only]
    writable_jobs = {p["job"] for p in writable}

    # Vendor/notes-only pass: EVERY parsed job that has vendor/notes to place but is
    # NOT in the budget-writable set (e.g. budget-stale 26-002 POET). Its existing KV
    # budget is preserved; we only add/refresh vendor/notes. Budget-writable jobs
    # already receive vendor/notes inside their budget payload (kv_payload_rows), so
    # we exclude them here to avoid a redundant second write.
    meta_only = [p for p in projects
                 if p.get("meta_rows_count", 0) > 0
                 and p["job"] not in writable_jobs]
    if only:
        meta_only = [p for p in meta_only if p["job"] in only]

    mode = "EXECUTE (LIVE KV WRITE)" if execute else "PLAN (no write)"
    merge = "REPLACE workbook-only" if replace else "MERGE (preserve hand-entered)"
    print(f"== write_budget_column — {mode} — {merge} ==")
    print(f"   budget-writable jobs: {len(writable)}   vendor/notes-only jobs: {len(meta_only)}   "
          f"namespace: {KV_NAMESPACE_ID}\n")

    if execute and not os.environ.get("CLOUDFLARE_API_TOKEN"):
        print("ERROR: CLOUDFLARE_API_TOKEN not set. `source /home/aiciv/.env` first.",
              file=sys.stderr)
        sys.exit(1)

    results = []
    # ---- PASS 1: budget-writable jobs (budget + vendor + notes) ----
    print("  -- budget + vendor/notes (writable jobs) --")
    for p in writable:
        num = p["job"]
        dry_rows = p["kv_payload_rows"]
        total = round(sum(v.get("budget", 0) for v in dry_rows.values()), 2)
        line = f"  {num:<9} {p['name'][:24]:<24} rows={len(dry_rows):>2} total=${total:,.2f}"
        if not execute:
            print(line + "   [PLAN — would backup, write, verify]")
            results.append((num, "planned"))
            continue
        try:
            bpath, cur = backup(num)
            rec = build_record(num, dry_rows, cur, replace)
            kv_put(num, rec)
            ok, msg = verify(num, dry_rows)
            print(line + f"   backup={os.path.basename(bpath)}  "
                  f"{'VERIFY PASS' if ok else 'VERIFY FAIL'}: {msg}")
            results.append((num, "ok" if ok else f"verify-fail: {msg}"))
        except Exception as e:  # noqa: BLE001
            print(line + f"   ERROR: {str(e)[:160]}")
            results.append((num, f"error: {e}"))

    # ---- PASS 2: vendor/notes-only jobs (budget PRESERVED, never overwritten) ----
    if meta_only:
        print("\n  -- vendor/notes ONLY (budget-stale / non-writable jobs; budget preserved) --")
    for p in meta_only:
        num = p["job"]
        meta_rows = p.get("kv_meta_rows", {})
        line = f"  {num:<9} {p['name'][:24]:<24} vendor/notes rows={len(meta_rows):>2}"
        if not execute:
            print(line + "   [PLAN — would backup, merge vendor/notes, verify budget preserved]")
            results.append((num, "planned-meta"))
            continue
        try:
            bpath, cur = backup(num)
            # capture existing budgets so we can prove they are unchanged after write
            budget_before = {}
            if cur and isinstance(cur.get("rows"), dict):
                for rk, v in cur["rows"].items():
                    if isinstance(v, dict) and v.get("budget") is not None:
                        budget_before[rk] = v["budget"]
            # MERGE (never --replace) so existing budget rows survive; source label
            # notes this was a vendor/notes-only pass.
            rec = build_record(num, meta_rows, cur, replace=False,
                               source_label="Turnover Budget workbook (vendor/notes col F/G; budget preserved)")
            kv_put(num, rec)
            ok, msg = verify_meta(num, meta_rows, budget_before)
            print(line + f"   backup={os.path.basename(bpath)}  "
                  f"{'VERIFY PASS' if ok else 'VERIFY FAIL'}: {msg}")
            results.append((num, "ok" if ok else f"verify-fail: {msg}"))
        except Exception as e:  # noqa: BLE001
            print(line + f"   ERROR: {str(e)[:160]}")
            results.append((num, f"error: {e}"))

    if execute:
        ok = sum(1 for _, s in results if s == "ok")
        print(f"\n  {ok}/{len(results)} jobs written + verified.")
    else:
        print("\n  PLAN complete. Nothing written. Re-run with --execute after greenlight.")


if __name__ == "__main__":
    main()
