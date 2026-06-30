# Platform Data Integrity -- Operational Notes

**Version:** 1.0
**Date:** June 30, 2026
**Prepared by:** Peter (AI COO)
**Status:** Active warning, open action below

---

## Historical Bid Log financials are hand-maintained and the sync reverts them

The Historical Bid Log financials in `data/precon-historical.js` are **hand-maintained**. They are the authoritative record and include:

- The authoritative 2025 block
- The helical rows
- The Habitat Homes name fix

The sync job `sync/build-precon-historical` **overwrites these on every run**. It does not read the WIP tab, does not parse helical, and does not preserve the name fix, so each sync reverts `data/precon-historical.js` back to incomplete or incorrect data.

### Until the sync is fixed: restore after every sync

After any run of `sync/build-precon-historical`, **restore `data/precon-historical.js` from the committed version before deploying.** The committed file is the source of truth, not the sync output.

```
# after a sync run, before deploy
git checkout -- data/precon-historical.js
```

Verify the 2025 block, the helical rows, and the Habitat Homes name are present before deploying.

### Open action

Fix `sync/build-precon-historical` to:

1. Read the WIP tab
2. Parse helical rows
3. Preserve the Habitat Homes name fix

Once that is done, the sync output will match the hand-maintained file and this restore step can be retired.
