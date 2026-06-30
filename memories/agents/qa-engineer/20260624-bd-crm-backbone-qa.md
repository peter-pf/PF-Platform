# QA: BD CRM backbone (commit 12b844d) — PASS w/ 2 id-uniqueness bugs
Date: 2026-06-24
- Builder deterministic; counts reconcile EXACTLY to PF_BD_Master.xlsm: 263 companies, 399 contacts, 375 linked, 24 unlinked. 16 company fields / 14 contact fields. No datetime/nan leaks.
- BUG2 (LIVE): contact id = sha1(Name||Org); 4 duplicate (Name,Org) rows -> 4 shared ids. Interactions would bleed between twins. FIX: collision-only suffix.
- BUG1 (latent): duplicate company Name -> duplicate id; 0 dups today, no guard. FIX: guard + warn.
- Write-back fail closed: field_ops/no-session->403, invalid->400 not 500, size caps, angle brackets stripped, server ids ov_/ix_. Sync non-fatal. Gate 401 all endpoints.
