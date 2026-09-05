// Cloudflare Pages Function -- /api/generate-test-sheet
// OFFICE "Generate Test Sheet" action for a project's Testing section. Copies the
// correct AP Modulus Test template (Enerpac small-jack <=174 kip / Durapac big-jack
// >=175 kip) into the project's SharePoint "04 - Testing" folder, populates the
// portal-known cells on the "Submittal Sheet" tab, reads back the fixed jack
// calibration factor (E14), and returns the copy's Excel-Online webUrl so the
// portal can link it and store the calibration factor.
//
// SECURITY MODEL (for the COO security review):
//  - Behind the auth gate (functions/_middleware.js): no session -> 401 before
//    this code runs. PLUS per-endpoint RBAC: requireArea(session, 'financials')
//    -> office only (admin/partner/business_dev). field_ops is BLOCKED. Test-sheet
//    generation is a PM/office setup action, mirroring the office-only Testing
//    section. A field crew session can NEVER trigger a write.
//  - NOT AN OPEN PROXY. The SharePoint drive is FIXED to env.SP_DRIVE_ID on the
//    server. The client NEVER supplies a drive id, path, host, template id, or
//    item id. The template is chosen from a fixed server-side enum (jack ->
//    template id); the destination folder is RESOLVED server-side from the
//    project number via deterministic path listing + a fixed sub-path. Same "not
//    an open proxy" model as functions/api/doc.js and functions/api/field-upload.js.
//  - App-only Graph creds live ONLY in CF env vars (shared minter in
//    functions/lib/graph.js). Never exposed to the browser.
//  - Fails CLOSED: any Graph env var missing -> 503 (never a silent no-op).
//
// SIDE-EFFECT SAFETY (this endpoint WRITES a real .xlsx):
//  - SKIP-IF-EXISTS: if "AP Modulus Test - <projnum>.xlsx" already exists in the
//    project's 04 - Testing folder we DO NOT overwrite (protects crew-entered
//    test data). We return the existing file's webUrl + alreadyExists:true.
//  - FORCE (force=1) is the ONLY way to regenerate; it re-copies with
//    conflictBehavior 'replace'. Callers must pass it deliberately.
//  - DRY-RUN (dryrun=1) resolves the template + destination folder + checks
//    existence and returns the plan WITHOUT copying or writing anything. Use this
//    to validate before the first real generate.
//  - WRITE SCOPE: we PATCH ONLY D1..D3 and E9..E12 (values the portal owns). We
//    NEVER touch E13 (the =D13*E12 formula), E14 (the calibration constant), the
//    crew cells (A4..A6 test data, AP Installed Length), or any named range.
//
// INPUT (POST JSON, or GET for dryrun):
//   projnum     : "NN-NNN" (resolves the project folder; also names the file)
//   jack        : 'enerpac' | 'durapac'  (OPTIONAL — derived from designLoad if omitted)
//   jobName     : D1  (string)
//   jobLocation : D2  (string)          -- Job Location / Address
//   designDiaFt : E9  (number, ft)      -- AP Design Diameter
//   plateDiaFt  : E10 (number, ft)      -- Diameter of Plate
//   reactionMod : E11 (number, PCI)     -- AP Reaction Modulus (design)
//   designLoad  : E12 (number, kips)    -- AP Design Load (also derives jack if unset)
//   force       : '1' to regenerate over an existing file (conflictBehavior replace)
//   dryrun      : '1' to resolve + check existence ONLY (no copy/write)
//
// OUTPUT (JSON):
//   { ok:true, webUrl, itemId, fileName, jack, calibrationFactor, alreadyExists,
//     dryRun, project:{number,folder}, wrote:[cell...] }

import { requireArea } from '../lib/auth.js';
import { GRAPH, graphConfigured, getGraphToken } from '../lib/graph.js';

// ---- fixed template ids (verified read-only against the live drive) ----------
// SharePoint: 05 - Field Operations/Modulus Test Procedure
//   Enerpac (small jack, <=174 kip): AP Modulus Test under 175kip (enerpac).xlsx
//   Durapac (big  jack, >=175 kip):  AP Modulus Test over 175kip (durapac).xlsx
// Overridable via env (AP_TEMPLATE_ENERPAC / AP_TEMPLATE_DURAPAC) so a template
// re-upload (new drive-item id) can be fixed without a code deploy.
const DEFAULT_TEMPLATES = {
  enerpac: '016ISVH62UBCKUIYFOQRGK4S7N2OQEXHAY',
  durapac: '016ISVH63VLUKLGIELRBBJFIVMAQCIFFCR',
};

// The jack breakpoint: >=175 kip design load uses the big Durapac jack.
const DURAPAC_MIN_KIPS = 175;

// The worksheet the portal-known cells live on (verified: the ONLY sheet).
const SHEET = 'Submittal Sheet';

// Project number format "NN-NNN" (e.g. 26-013). Bounded; used for resolve + name.
const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;

// SharePoint Field Operations projects tree (verified live).
const FO_PROJECTS_PATH = '05 - Field Operations/01 - Projects';
const FO_COMPLETED_FOLDER = '001 - Completed Jobs';
const TESTING_SUBFOLDER = '04 - Testing';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Encode a Graph path: encode each SEGMENT but keep "/" separators literal.
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// Does this folder name belong to the requested project number?
//   "26-013"  OR  "26-013 - ..."  OR  "26-013-..."
function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}

// Resolve the template id for a jack, honoring env overrides.
function templateIdFor(jack, env) {
  if (jack === 'enerpac') return (env && env.AP_TEMPLATE_ENERPAC) || DEFAULT_TEMPLATES.enerpac;
  if (jack === 'durapac') return (env && env.AP_TEMPLATE_DURAPAC) || DEFAULT_TEMPLATES.durapac;
  return null;
}

// List the FOLDER children of a drive item by PATH (per-segment encode).
async function listFolderChildrenByPath(env, token, path) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const encPath = encGraphPath(path);
  let url = `${GRAPH}/drives/${driveId}/root:/${encPath}:/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// List FOLDER children by ITEM ID (used to walk year folders under Completed Jobs).
async function listFolderChildrenById(env, token, itemId) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  let url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Resolve the project ROOT folder {id,name} by deterministic path listing.
// ACTIVE tree first, then the Completed Jobs fallback. Returns null if not found.
async function resolveProjectFolder(env, token, projectNumber) {
  const active = await listFolderChildrenByPath(env, token, FO_PROJECTS_PATH);
  const activeMatch = active.find((f) => nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  const completedPath = `${FO_PROJECTS_PATH}/${FO_COMPLETED_FOLDER}`;
  const completed = await listFolderChildrenByPath(env, token, completedPath);
  // The Completed Jobs folder may hold project folders directly OR year folders.
  const direct = completed.find((f) => nameMatchesProject(f.name, projectNumber));
  if (direct) return { id: direct.id, name: direct.name };
  for (const sub of completed) {
    const inSub = await listFolderChildrenById(env, token, sub.id);
    const match = inSub.find((f) => nameMatchesProject(f.name, projectNumber));
    if (match) return { id: match.id, name: match.name };
  }
  return null;
}

// Find an existing child FOLDER with this exact name under parentId, or null.
async function findChildFolder(env, token, parentId, name) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=999`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const hit = (Array.isArray(data && data.value) ? data.value : [])
    .find((it) => it && it.folder && it.name === name);
  return hit ? { id: hit.id, name: hit.name } : null;
}

// Find an existing child FILE with this exact name under parentId, or null.
// Returns {id, name, webUrl} so skip-if-exists can hand back the live link.
async function findChildFile(env, token, parentId, name) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,file,webUrl&$top=999`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const hit = (Array.isArray(data && data.value) ? data.value : [])
    .find((it) => it && it.file && it.name === name);
  return hit ? { id: hit.id, name: hit.name, webUrl: hit.webUrl } : null;
}

// Copy the template into destFolderId as fileName. Graph /copy is ASYNC: it 202s
// with a Location header pointing at a monitor URL we poll until the copy lands.
// Returns the new drive item {id, name, webUrl}. conflictBehavior 'replace' only
// when force=true (a deliberate regenerate); otherwise 'fail' so we never clobber.
async function copyTemplate(env, token, templateId, destFolderId, fileName, replace) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const copyUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(templateId)}/copy`;
  const body = {
    parentReference: { driveId: env.SP_DRIVE_ID, id: destFolderId },
    name: fileName,
    '@microsoft.graph.conflictBehavior': replace ? 'replace' : 'fail',
  };
  const resp = await fetch(copyUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (resp.status === 409) throw new Error('copy conflict: file already exists');
  if (resp.status !== 202) {
    // Some tenants return 200/201 synchronously with the item body.
    if (resp.status === 200 || resp.status === 201) {
      const it = await resp.json();
      return { id: it.id, name: it.name, webUrl: it.webUrl };
    }
    throw new Error('copy failed ' + resp.status);
  }
  // Poll the monitor URL until completed.
  const monitor = resp.headers.get('Location');
  if (!monitor) throw new Error('copy accepted but no monitor URL');
  const deadline = Date.now() + 25000; // ~25s budget; small template copies fast
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    const mResp = await fetch(monitor); // monitor URL is pre-authenticated
    if (!mResp.ok) continue;
    const status = await mResp.json();
    if (status.status === 'completed') {
      const newId = status.resourceId;
      if (!newId) throw new Error('copy completed without a resourceId');
      const itemResp = await fetch(
        `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(newId)}?$select=id,name,webUrl`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!itemResp.ok) throw new Error('fetch copied item failed ' + itemResp.status);
      const it = await itemResp.json();
      return { id: it.id, name: it.name, webUrl: it.webUrl };
    }
    if (status.status === 'failed') throw new Error('copy job failed');
  }
  throw new Error('copy did not complete in time');
}

// PATCH a single cell on the Submittal Sheet. Writes ONE value into ONE address.
async function writeCell(env, token, itemId, address, value) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}`
    + `/workbook/worksheets('${encodeURIComponent(SHEET)}')`
    + `/range(address='${encodeURIComponent(address)}')`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] }),
  });
  if (!resp.ok) throw new Error(`write ${address} failed ${resp.status}`);
}

// Read a single cell's numeric value (used for E14 read-back).
async function readCell(env, token, itemId, address) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}`
    + `/workbook/worksheets('${encodeURIComponent(SHEET)}')`
    + `/range(address='${encodeURIComponent(address)}')?$select=values`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`read ${address} failed ${resp.status}`);
  const data = await resp.json();
  const v = data && data.values && data.values[0] && data.values[0][0];
  return v;
}

// Coerce a numeric-ish input to a finite number or null (blank -> not written).
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v) {
  if (v === undefined || v === null) return '';
  return String(v).slice(0, 250);
}

// Shared handler for GET (dryrun-only) and POST.
async function handle(context, params, allowWrite) {
  const { env } = context;
  const session = context.data && context.data.session;

  // [RBAC] OFFICE ONLY. financials area = admin/partner/business_dev. field_ops BLOCKED.
  const denied = requireArea(session, 'financials');
  if (denied) return denied;

  // [fail closed] Graph creds + fixed drive id must all be present.
  if (!graphConfigured(env)) {
    return json({ status: 'error', message: 'Test-sheet generation is unavailable: the server is not configured.' }, 503);
  }

  const projnum = str(params.projnum).trim();
  if (!PROJ_NUM_RE.test(projnum)) {
    return json({ status: 'error', message: 'A valid project number (NN-NNN) is required.' }, 400);
  }

  const designLoad = num(params.designLoad);

  // Jack: explicit param wins; otherwise derive from designLoad.
  let jack = str(params.jack).trim().toLowerCase();
  if (jack && jack !== 'enerpac' && jack !== 'durapac') {
    return json({ status: 'error', message: "jack must be 'enerpac' or 'durapac'." }, 400);
  }
  if (!jack) {
    if (designLoad === null) {
      return json({ status: 'error', message: 'Provide jack, or a numeric designLoad to derive it.' }, 400);
    }
    jack = designLoad >= DURAPAC_MIN_KIPS ? 'durapac' : 'enerpac';
  }
  const templateId = templateIdFor(jack, env);
  if (!templateId) {
    return json({ status: 'error', message: 'No template configured for that jack.' }, 500);
  }

  const force = str(params.force) === '1' || params.force === true;
  const dryRun = !allowWrite || str(params.dryrun) === '1' || params.dryrun === true;
  const fileName = `AP Modulus Test - ${projnum}.xlsx`;

  try {
    const token = await getGraphToken(env);

    // Resolve project folder, then its 04 - Testing subfolder.
    const proj = await resolveProjectFolder(env, token, projnum);
    if (!proj) {
      return json({ status: 'error', message: 'Could not find that project folder in SharePoint.' }, 404);
    }
    const testing = await findChildFolder(env, token, proj.id, TESTING_SUBFOLDER);
    if (!testing) {
      return json({ status: 'error', message: `Project has no "${TESTING_SUBFOLDER}" folder.` }, 404);
    }

    // Skip-if-exists check (both dry-run and real path use this).
    const existing = await findChildFile(env, token, testing.id, fileName);

    // ----- DRY-RUN: report the plan, write nothing -----
    if (dryRun) {
      return json({
        ok: true, dryRun: true, alreadyExists: !!existing,
        wouldGenerate: !existing || force,
        jack, templateId, fileName,
        project: { number: projnum, folder: proj.name },
        testingFolderId: testing.id,
        webUrl: existing ? existing.webUrl : null,
        plannedWrites: {
          D1: str(params.jobName), D2: str(params.jobLocation), D3: projnum,
          E9: num(params.designDiaFt), E10: num(params.plateDiaFt),
          E11: num(params.reactionMod), E12: designLoad,
        },
        note: 'DRY-RUN: nothing was copied or written. E13(formula)/E14(calibration) never touched.',
      });
    }

    // ----- SKIP-IF-EXISTS (protect crew-entered data) -----
    if (existing && !force) {
      // Still read back E14 from the existing file so the portal can store it.
      let calibrationFactor = null;
      try { calibrationFactor = num(await readCell(env, token, existing.id, 'E14')); } catch (_) {}
      return json({
        ok: true, alreadyExists: true, jack, fileName,
        webUrl: existing.webUrl, itemId: existing.id, calibrationFactor,
        project: { number: projnum, folder: proj.name },
        note: 'File already exists; not overwritten. Pass force=1 to regenerate.',
      });
    }

    // ----- COPY template -> destination -----
    const copied = await copyTemplate(env, token, templateId, testing.id, fileName, !!existing && force);

    // ----- POPULATE only the portal-owned cells (D1..D3, E9..E12) -----
    // We PATCH one cell at a time so a bad single value can't corrupt a block and
    // so we never touch E13 (=D13*E12), E14, crew cells, or named ranges.
    const wrote = [];
    const writes = [
      ['D1', str(params.jobName)],
      ['D2', str(params.jobLocation)],
      ['D3', projnum],
      ['E9', num(params.designDiaFt)],
      ['E10', num(params.plateDiaFt)],
      ['E11', num(params.reactionMod)],
      ['E12', designLoad],
    ];
    for (const [addr, val] of writes) {
      if (val === null || val === '') continue; // don't blank a cell for a missing input
      await writeCell(env, token, copied.id, addr, val);
      wrote.push(addr);
    }

    // ----- READ BACK E14 (calibration factor) for the portal to store -----
    let calibrationFactor = null;
    try { calibrationFactor = num(await readCell(env, token, copied.id, 'E14')); } catch (_) {}

    return json({
      ok: true, alreadyExists: false, regenerated: !!existing, jack, fileName,
      webUrl: copied.webUrl, itemId: copied.id, calibrationFactor,
      wrote, project: { number: projnum, folder: proj.name },
    });
  } catch (err) {
    console.error('api/generate-test-sheet error:', err && err.message);
    return json({ status: 'error', message: 'An internal error occurred generating the test sheet.' }, 500);
  }
}

// GET is DRY-RUN ONLY (safe to expose; never copies/writes). Params from query.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const p = Object.fromEntries(url.searchParams.entries());
  p.dryrun = '1'; // GET can never write
  return handle(context, p, false);
}

// POST performs the real generate (or dryrun=1). Params from JSON body.
export async function onRequestPost(context) {
  let body = {};
  try {
    const ct = context.request.headers.get('Content-Type') || '';
    if (ct.toLowerCase().includes('application/json')) {
      body = await context.request.json();
    }
  } catch (_) {
    return json({ status: 'error', message: 'Invalid JSON body.' }, 400);
  }
  return handle(context, body || {}, true);
}
