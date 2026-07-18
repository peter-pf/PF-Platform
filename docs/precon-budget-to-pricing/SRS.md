# SRS — Budget→Actively move + detail wrap + Actively Bidding rename

**Module:** Preconstruction pipeline
**Files:** `platform/index.html`, `platform/functions/api/pipeline-state.js`
**Branch:** `website-build-20260609`
**Owner:** Derek (requests 1 + 2) + coordinator (request 3)

> Naming: the tab formerly shown as "Actively Pricing" is the internal `actively_bidding`
> bucket. Request 3 renames the USER-FACING label to "Actively Bidding". Internal ids,
> bucket keys, data-* attrs, CSS classes, and the pipeline-state status value are unchanged.

---

## Request 1 — move a bid from Budget Pricing back to Actively Bidding

**New pipeline-state status `pricing`** relocates a bid INTO `actively_bidding` (the reverse
of `budget`). It works for BOTH ways a bid lands in Budget Pricing:
- (a) auto-bucketed there by its bid-log SECTION, and
- (b) auto-bucketed in `actively_bidding` but carrying a `budget` override.
`pricing` is used instead of `active` because `active` clears the override to the AUTO
bucket — which for a section-budget bid is still `budget_pricing` (wouldn't move it).

**FR-1** `functions/api/pipeline-state.js`: `VALID_STATUS` gains `pricing: 1`. Same privileged
auth (canResolve). `pricing` is NOT in `DEAD_STATUS_REASON`, so `deadSet=false` (live item).
**FR-2** `calEffectiveBucket` + `effBucketFull`: `st === 'pricing'` → `actively_bidding`
(returns the TARGET, so a section-budget bid resolves to actively_bidding, not its auto bucket).
**FR-3** renderMount lists: `actively_bidding` is now an explicit branch that keeps auto rows
not relocated away AND `pullRelocated('pricing')` (pulls bids moved in from other buckets);
`budget_pricing` naturally excludes a `pricing`-overridden bid (its status ≠ budget); the
generic stage else-branch also drops `pricing`.
**FR-4** Budget Pricing DnD bar gains an "Actively Bidding" drop zone (`data-act="pricing"`)
plus a per-row "Actively Bidding" button (`pfResolveBid(k,'pricing')`) for touch. Action
column widened to 232px for the 3rd button. Only `budget_pricing` gets the zone/button.
**FR-5** `wireDnd` drop whitelist accepts `pricing`. After the POST, `renderAll()` re-renders
so the bid leaves Budget Pricing and appears in Actively Bidding; persisted in KV overrides.

## Request 2 — wrap long values in the detail dropdown

**FR-6** `.pf-hl-field .pf-hl-value` and `.pf-hl-label`: `white-space: normal;
overflow-wrap: break-word; word-break: break-word; min-width: 0`. `.pf-hl-field` keeps
`min-width: 0`. Root cause: a grid/flex child defaults to `min-width: auto`, which lets a long
value (e.g. a long Address) push past its track and collide with the next field (Site Size).
`min-width:0` + wrapping makes a long value STACK inside its own card. Applies to all buckets
(shared detail renderer).

## Request 3 — rename user-facing "Actively Pricing" → "Actively Bidding"

**FR-7** Changed DISPLAYED TEXT only, in `platform/index.html`:
- Nav tabs (AP + HP): `>Actively Pricing<` → `>Actively Bidding<` (ids
  `precon-ap/hp-actively-bidding` unchanged).
- Module title map: "Aggregate Piers / Helical Pilings - Actively Pricing" → "... - Actively
  Bidding".
- `BUCKET_LABEL.actively_bidding`: 'Actively Pricing' → 'Actively Bidding' (drives the in-page
  `<h2>` heading).
- Runtime strings: manual-bid remove confirm, "Add to Actively Bidding" button, empty-state
  "send one back to Actively Bidding", due-soon meta, funnel label.
- Request-1's new zone/button labeled "Actively Bidding" (consistent with the rename).
- **Unchanged:** `actively_bidding` bucket key, `precon-*-actively-bidding` module ids,
  data-* attributes, CSS class names, the `pricing` pipeline-state value. Only code COMMENTS
  still mention "Actively Pricing" (they document the internal bucket; harmless).

## Verification

- `docs/precon-budget-to-pricing/move-and-detail.test.js` (jsdom real render): **24/24** —
  budget zone+button exist and read "Actively Bidding"; a `pricing`-overridden budget bid
  RELOCATES to actively_bidding and leaves budget_pricing; API whitelists `pricing` (non-dead);
  detail values compute `white-space:normal` + break + `min-width:0`, long Address wraps; nav
  tabs + rendered `<h2>` read "Actively Bidding"; internal ids/status unchanged.
- Regressions: `runtime-sort` 20/20, `header-wrap` 17/17, `name-width` 14/14.
- `node --check`: pipeline-state.js OK, index main script block OK.
- Live `/data/*` + `/api/*` are auth-gated (401); verification is deploy-success + the jsdom
  render proof (the API/relocation logic is exercised in-process).
