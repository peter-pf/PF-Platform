# Field-Ops Discovery — List-Free KV Key Scheme

**Date:** 2026-07-28
**Author:** Peter (pf-backend-agent)
**Decision context:** Stay on Cloudflare free tier (Brad + Witness aligned). The free
tier caps KV **list-keys at 1,000/day**; the poller's per-cycle `list?prefix=fieldq:`
call exhausted that cap. Reads (100k/day) and writes are fine. **Only LIST is capped.**
This re-architects discovery so the poller **never lists** — it finds every pending job
using only constructed GETs.

---

## Why Hermes stays private (unchanged, load-bearing)

Hermes (`hermes -p aiciv-doctor`) has **zero public surface**: no tunnel, no hostname,
no port, no inbound listener. The crew browser only ever talks to the same-origin Pages
Function behind the portal's own auth gate. The **only** channel between the browser and
Hermes is Workers KV: the Function *writes* a job to KV, the local poller *reads* it,
runs Hermes locally, and *writes* the answer back to KV. A push/webhook was explicitly
rejected by Witness because it would create an inbound path to Hermes. This redesign
changes **only how the poller discovers jobs in KV** — it adds no network surface. The
poller still makes only OUTBOUND https to the Cloudflare KV API plus a local timeboxed
CLI. No listener, no port.

---

## The problem with the obvious alternatives

- **A single shared mutable index key** (`fieldq:index` = JSON array of ids): rejected.
  In eventually-consistent KV this is a read-modify-write race — two writers in the same
  window each read the old array, append their id, and write back, and the second write
  **clobbers** the first's append. Under free-tier eventual consistency this loss is real,
  not theoretical.
- **A push/webhook to the poller**: rejected — creates an inbound path to Hermes.

The fix is to make writers **contention-free**: each writer writes to keys **only it owns**
(never read-modify-write), and the poller **constructs** the keys it needs to GET from
time and a small fixed slot space — no listing, ever.

---

## The scheme: time-bucketed beacon + slot pointers

Three kinds of KV keys. The browser-facing job key is **unchanged** so the answer-poll
contract is preserved.

| Key | Written by | Value | Purpose |
|-----|-----------|-------|---------|
| `fieldq:<id>` | Function (POST) | full job JSON `{id,query,project_hint,status:"pending",...}` | **Unchanged.** The browser GETs this by id for the answer. The poller writes the answer back here. |
| `fqb:<bucket>` | Function (POST) | `"1"` (presence beacon) | Signals "bucket `<bucket>` has at least one job — probe it." Last-writer-wins is safe: it carries no data, only presence. |
| `fqx:<bucket>:<slot>` | Function (POST) | the `<id>` string | Contention-free pointer. `<slot>` is crypto-random `0..SLOTS-1`, so the writer owns its own key. |

- `<bucket>` = `floor(epoch_seconds / BUCKET_SECS)`, with **`BUCKET_SECS = 10`**.
- `<slot>` = crypto-random integer in `[0, SLOTS)`, with **`SLOTS = 64`**.
- All three keys carry the same 1-hour `expirationTtl` for self-cleanup.

**Enqueue (Function, POST), all contention-free writes, no reads:**
1. `PUT fieldq:<id>` = job JSON (as today).
2. `PUT fqx:<bucket>:<slot>` = `<id>`.
3. `PUT fqb:<bucket>` = `"1"`.

**Discovery (poller), only constructed GETs, never a list:**
Each cycle the poller computes the set of **candidate buckets** = every bucket index
overlapping `[now - LOOKBACK, now]` (`LOOKBACK = 25s`, ≥ idle interval + skew, so no
bucket is ever skipped between cycles — at 15s idle and 10s buckets, up to 3 bucket
indices can be in flight, so it checks the current + 2 prior = **3 beacon GETs/cycle**).
For each candidate bucket:
- `GET fqb:<bucket>`. **Absent → bucket is empty → skip all 64 slot probes (0 extra GETs).**
- **Present** and the bucket is still **open** (i.e. `now < bucket_end + SKEW`, so it could
  still receive writes) → `GET fqx:<bucket>:0 .. fqx:<bucket>:63` (64 GETs), collect every
  id found, and process each `fieldq:<id>`. Keep probing an open bucket each cycle so a
  late same-bucket write is still caught.
- Present but the bucket is **closed** (`now ≥ bucket_end + SKEW`) → do one **final** slot
  sweep, process any new ids, then **retire** the bucket locally (never probe it again).

The poller keeps a small in-memory `seen_ids` set (and a `retired_buckets` set) so it never
re-probes a fully-drained closed bucket and never re-answers an id. This is local state
only — it holds no KV list, needs no shared index, and races nothing.

---

## GET-volume budget (well under the 100k/day free cap)

- **Idle** (no questions): 3 beacon GETs/cycle × (86,400 / 15s) = **17,280 GETs/day**.
  Empty beacons cost nothing beyond the 3 probes — no slot GETs when idle.
- **Hot** (a bucket received ≥1 question): 64 slot GETs per open-probe cycle. A bucket's
  open lifetime is `BUCKET_SECS + SKEW ≈ 15s`; at ACTIVE cadence (3s) that's ~5 probe
  cycles → ~320 GETs per hot bucket. Even at a very heavy **200 questions/day** in their
  own buckets: 17,280 idle + ~64,000 hot ≈ **81k GETs/day** — still under 100k. For a real
  small crew (a handful of questions/day) it is ~**18k GETs/day**.
- **Zero LIST calls.** The 1,000/day list cap is no longer touched at all.

---

## Collision / loss analysis (honest residual)

A job is lost **only if** two questions land in the **same 10s bucket** AND draw the
**same 1-of-64 slot** — then the second `PUT fqx:<bucket>:<slot>` clobbers the first, so
the poller resolves that slot to only one id and the other job's pointer is gone.

- The beacon is **not** a loss vector: it carries only presence, so a same-bucket second
  write just re-asserts "probe this bucket." The `fieldq:<id>` job keys are distinct
  128-bit ids and never collide. Only the **slot pointer** can be clobbered.
- `P(≥1 slot collision | k questions in the SAME 10s bucket)`: k=2 → **1.56%**, k=3 → 4.6%.
- Pier is a small company — realistically at most one question every several seconds, so
  two questions inside the *same* 10s window is already a rare event, and the 1.56%
  slot-collision is conditional on top of that. Compound residual is **negligible**.
- **Self-healing:** even in that rare case, the losing job's `fieldq:<id>` still exists but
  never gets an answer written. The browser's answer-poll simply times out and the crew
  member re-asks — a fresh id, a fresh bucket/slot, no data corruption, no wrong answer.
  We never fabricate; the worst outcome is one re-ask.

**Why this beats a shared index:** a shared mutable index loses writes via read-modify-write
races that recur under *normal* sequential use; this scheme only loses in the rare
same-bucket-same-slot coincidence, and self-heals. It is not perfectly lossless without a
list, but the residual is quantified, tiny for this crew, and safe (re-ask, never a wrong
answer). If Pier ever grows to sustained concurrent field querying, raise `SLOTS` (128/256)
or shrink `BUCKET_SECS` — both cut the residual further at a modest GET-budget cost, still
with zero lists.

---

## What did NOT change

- Hermes stays private (KV-only, no inbound path).
- The 3-layer financial guard (regex pre-filter, prompt rule, dollar post-filter).
- The browser answer-poll contract: `GET /api/field-companion?id=<id>` → `fieldq:<id>`.
- The Function's `field_ops` RBAC and fail-closed behavior.
- KV reads/writes/deletes (all uncapped-enough on free tier). Only the **list** call is gone.
