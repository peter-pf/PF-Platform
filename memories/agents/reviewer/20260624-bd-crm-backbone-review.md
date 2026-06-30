# Review: BD CRM backbone (commit 12b844d) — NEEDS-FIX
Date: 2026-06-24
- BLOCKER: builder emits unlinkedContacts (24) into bd-records.js but index.html never renders it -> 24 real contacts invisible. Pattern: "reported in data, dropped in view" — any feed collection the front-end doesn't consume is a silent data-loss bug. FIX: render unlinked group.
- Matcher misses: exact-normalized-name only; fixable suffix/legal-name misses (Lauth->Lauth Group Inc., Panzica->Panzica Construction, Alston/ARCO regional). FIX: second-pass suffix-strip + prefix match, single-candidate links logged to _fuzzyLinks, multi-candidate stays unlinked+ambiguousCandidates.
- LATENT KV race: both write-back handlers do read-modify-write on one KV key (bd_overlay_v1 / per-entity log); CF KV is last-writer-wins, no CAS -> concurrent POST can clobber. Low for 3-person BD. Durable fix = D1 inserts. Add KNOWN comment.
- Merge logic (buildMerged) CLEARED: base ids co_/ct_ (sha1 of Name) vs overlay ov_co_/ov_ct_ never collide; re-sync never wipes KV.
- Field fidelity CLEARED: row-4 header-name based (reorder-safe), blanks -> "", datetimes -> YYYY-MM-DD.
- Audit fields (addedBy/addedAt) server-set from session, client cannot spoof. CLEARED.
