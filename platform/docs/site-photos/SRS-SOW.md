# Site Photos + Daily-Report Photo Pull — SRS / SOW

Status: BUILT on branch `camera-photos-20260805`, deployed to Cloudflare Pages
PREVIEW (not production). Awaiting code review (Peter) + Brad phone test → flip to
production on Brad's go.

## Purpose (Brad's requirement)
1. A camera button on the portal that, from an iPhone/iPad, opens the native
   camera and uploads the photo into each project's "Project Photos" folder in the
   SharePoint Field Operations area.
2. The daily report pulls in any pictures taken THAT DAY (for that project) and
   shows them on the report.

## Confirmed target (Brad, 2026-08-05)
`{SP_DRIVE_ID} :: 05 - Field Operations / 01 - Projects / {project folder} / 02 - Project Photos /`
- No literal "Pictures" folder exists; the crew photo folder is named
  "02 - Project Photos" (template uses "01 - Project Photos").
- Photos land LOOSE in that folder (no date subfolders) to match current crew habit.

## Functional requirements
- FR1 Camera capture: `<input type="file" accept="image/*" capture="environment"
  multiple>` on the daily-report form (opens rear camera; also allows library).
- FR2 Upload path: `photos` bucket → Field-Ops-tree resolver → child folder whose
  name ends in "Project Photos" (case-insensitive) → loose upload,
  conflictBehavior rename. handlogs/guhma QAQC path UNCHANGED.
- FR3 Project resolution: prefix-match NN-NNN under `05 - Field Operations/01 -
  Projects`, completed fallback under `001 - Completed Jobs`.
- FR4 Photo pull: `GET /api/project-photos?projectNumber=&date=` lists that
  project's Project Photos folder, returns photos for THAT DAY as
  `[{name,itemId,webUrl,thumbnailUrl,takenBasis}]` via `$expand=thumbnails`.
- FR5 "That day": prefer filename `YYYYMMDD_` prefix (crew camera naming), fall
  back to item `createdDateTime` (upload time, UTC calendar day).
- FR6 UI: a "Today's Photos" thumbnail strip on the form; refreshes on
  project/date change and after a photos upload. https-only links/thumbs.

## Non-functional / security
- RBAC field_ops on upload (POST) and photo pull (GET). READ-only pull.
- Fail-closed on missing Graph creds (503). Drive fixed to SP_DRIVE_ID server-side;
  client supplies only project number + date (both validated).
- No new Graph scopes (Files.ReadWrite.All + Sites.ReadWrite.All already used).
- Allowed image types: jpg/jpeg/png/heic (already in the field-upload allow-list).
- Photos are NOT written onto the daily-report KV record (they live independently
  in SharePoint); collectBody still sends only handlogs+guhma refs.
- PDF embedding of photos: intentionally SKIPPED this pass (portal display first).

## Files changed
- `functions/api/field-upload.js` — `photos` bucket + Field-Ops resolver
  (`resolveFieldOpsProjectFolder`, `resolvePhotoFolder`, `isPhotoFolderName`).
- `functions/api/project-photos.js` — NEW read-only photo-pull endpoint.
- `functions/lib/auth.js` — `/api/project-photos` → field_ops in areaForPath.
- `index.html` — Site Photos capture block, Today's Photos strip + CSS, `photos`
  bucket in UP_BUCKETS/state.attachments, `loadPhotoStrip()`, date-change wiring.

## Self-verify evidence (against live SharePoint)
- Field-Ops resolver found 26-002 POET, 26-013 Park & Poplar, 26-007 Madison and
  their `02 - Project Photos` folders (POET id 016ISVH6YRTZX3PBZBPNBYJD7S2BIIH5JL).
- Photo-pull day filter verified: POET folder returned 20 photos for 2026-05-05,
  21 for 2026-05-08, 12 for 2026-05-07 (incl. 8 no-prefix files resolved by
  createdDateTime fallback), all with usable thumbnail URLs.
- `node --check` clean on all three JS backend files.
- Production `/api/project-photos` returns 401 (route not on prod; gate holds).

## Open / follow-up
- User-facing manual (manual.html / training.html) update for the camera button:
  FOLLOW-UP (noted, not done this pass).
- Optional later: embed the day's photos into the emailed daily-report PDF.
- Note: HEIC from iOS camera capture is typically delivered as JPEG; confirm on
  Brad's device during the phone test.
