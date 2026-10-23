// Render a site-readiness record into a PDF (Uint8Array) and provide the Graph
// helpers that (a) email that PDF to the mailing list and (b) upload it into the
// job's "Site Readiness" SharePoint subfolder (created if missing).
//
// Mirrors daily-report-doc.js end to end. The SharePoint path follows the DFR
// pattern but resolves the project folder dynamically (same as field-upload.js):
//   <projectFolder>/Site Readiness/<filename>
// Filename: "YYYY-MM-DD - <job#> - Site Readiness - <READY|NOT READY>.pdf"

import { PdfDoc, bytesToBase64, PF } from './pdf.js';
import { GRAPH } from './graph.js';
import { CHECKLIST_ITEMS } from './site-readiness-store.js';

// ---------------------------------------------------------------------------
// 1) RENDER: record -> PDF bytes  (PF-branded, same palette as DFR)
// ---------------------------------------------------------------------------
export function renderSiteReadinessPdf(rec) {
  const doc = new PdfDoc();

  // Masthead: "Site Readiness Form"
  doc.brandHeader('Site Readiness Form', [
    { label: 'Project',   value: rec.projectName || rec.projectId || '-' },
    { label: 'Job #',     value: rec.projectId || '-' },
    { label: 'Date',      value: fmtDate(rec.date) },
    { label: 'Inspected', value: rec.inspectedBy || '-' },
  ]);
  doc.spacer(2);

  // ---- Overall result banner -----------------------------------------------
  const isReady = rec.result === 'READY';
  const bannerColor = isReady ? PF.green : PF.amber;
  const bannerText = isReady
    ? 'RESULT: READY — all items confirmed.'
    : 'RESULT: NOT READY — open items listed below.';

  // Paint a result chip.
  const bannerH = 22;
  if (doc.y - (bannerH + 8) < 54) doc._newPage();
  doc.y -= 8;
  const by = doc.y - bannerH;
  const bannerBg = isReady ? [0.22, 0.78, 0.38] : [0.85, 0.60, 0.12];
  doc.fillRect(54, by, 612 - 54 * 2, bannerH, bannerBg);
  const bannerFg = [1, 1, 1]; // white text
  doc._draw(bannerText, 11, 'helvb', 54 + 8, by + 7, bannerFg);
  doc.y = by - 4;

  // List open items if NOT READY.
  if (!isReady && Array.isArray(rec.openItems) && rec.openItems.length) {
    doc.spacer(4);
    doc.text('Open items (No or unanswered):', { size: 10, bold: true });
    for (const key of rec.openItems) {
      const def = CHECKLIST_ITEMS.find((d) => d.key === key);
      const label = def ? `${key}. ${def.label}` : key;
      doc.text(`  • ${label}`, { size: 10 });
    }
    doc.spacer(4);
  }

  // ---- Header info block ---------------------------------------------------
  doc.heading('Inspection Details');
  doc.table([
    { label: 'Job / Project',   value: (rec.projectId ? rec.projectId + ' - ' : '') + (rec.projectName || '-') },
    { label: 'Date',            value: fmtDate(rec.date) },
    { label: 'Inspected By',    value: rec.inspectedBy || '-' },
    { label: 'GC / Site Contact', value: rec.gcContact || '-' },
    { label: 'Site Address',    value: rec.siteAddress || '-' },
  ], { valueW: 260 });

  // ---- Checklist sections --------------------------------------------------
  // Group items by sectionLabel.
  const sections = [];
  for (const def of CHECKLIST_ITEMS) {
    let sec = sections.find((s) => s.label === def.sectionLabel);
    if (!sec) { sec = { label: def.sectionLabel, items: [] }; sections.push(sec); }
    sec.items.push(def);
  }

  for (const sec of sections) {
    doc.heading(sec.label);
    const rows = [];
    for (const def of sec.items) {
      const item = (rec.items || []).find((it) => it && it.key === def.key);
      const answer = (item && item.answer) ? String(item.answer) : '-';
      const note   = (item && item.note && String(item.note).trim()) ? String(item.note).trim() : '';
      // Show item number + truncated label as the row label.
      const rowLabel = `${def.key}. ${def.label}`;
      rows.push({ label: rowLabel, value: answer });
      // Note as an indented continuation row (no value column).
      if (note) {
        rows.push({ label: `     Note: ${note}`, value: '' });
      }
    }
    doc.table(rows, { valueW: 60 });
  }

  // Gather all attachment refs up front (used in 4b/ops sections and the summary).
  const allAttach = Array.isArray(rec.attachments) ? rec.attachments : [];

  // ---- 4b Detail sub-items (R9 back-compat: render if present in old records) --
  const d4b = rec.item4bDetail;
  if (d4b && (d4b.unloadStreet || d4b.overheadUtils || d4b.specialNotes)) {
    doc.heading('4b. Equipment Loading/Unloading Detail (legacy)');
    const rows4b = [];
    if (d4b.unloadStreet)  rows4b.push({ label: 'Unload on street / plates / curbs', value: d4b.unloadStreet });
    if (d4b.overheadUtils) rows4b.push({ label: 'Overhead utilities', value: d4b.overheadUtils });
    if (d4b.specialNotes)  rows4b.push({ label: 'Special site access notes', value: d4b.specialNotes });
    doc.table(rows4b, { valueW: 280 });
  }

  // ---- Stone & Spoils Plan sign-off (R10+) ------------------------------------
  // R10: single sitePlan sign-off. Markup/sig attachments use item key '5d'.
  // Back-compat: R9 records have stonePlacement/spoilsPlacement — render them too.
  const ops = rec.opsSignoffs;
  if (ops) {
    // R10 single sign-off.
    if (ops.sitePlan && (ops.sitePlan.desc || ops.sitePlan.superName || ops.sitePlan.pfMgrName)) {
      doc.heading('Stone & Spoils Plan Sign-off');
      const sp = ops.sitePlan;
      const rows = [];
      if (sp.desc)      rows.push({ label: 'Location description', value: sp.desc });
      if (sp.superName) rows.push({ label: 'Site Superintendent',  value: sp.superName });
      if (sp.pfMgrName) rows.push({ label: 'PF Field Ops Mgr',     value: sp.pfMgrName });
      if (sp.capturedByName || sp.signedAt) {
        const by   = sp.capturedByName || '—';
        const when = sp.signedAt
          ? fmtDate(sp.signedAt.slice(0, 10)) + ' ' + (sp.signedAt.slice(11, 16) || '') + ' UTC'
          : '—';
        rows.push({ label: 'Signature captured by', value: `${by} on ${when}` });
      }
      if (rows.length) {
        doc.table(rows, { valueW: 280 });
        // Attachments keyed to item '5d' (site plan markup item).
        const refs5d = allAttach.filter((a) => a && a.key === '5d' &&
          (a.bucket === 'sr_markup' || a.bucket === 'sr_signature'));
        for (const a of refs5d) {
          const hasUrl = a.webUrl && a.webUrl.startsWith('https://pierfoundations.sharepoint.com/');
          const urlPart = hasUrl ? `  ${String(a.webUrl).trim()}` : '';
          doc.text(`  - ${a.name}  [${bucketLabel(a.bucket)}]${urlPart}`, { size: 10 });
        }
        doc.spacer(4);
      }
    }

    // R9 back-compat: render stone/spoils separately if present.
    if (ops.stonePlacement || ops.spoilsPlacement) {
      doc.heading('Stone & Spoils Placement Sign-offs (R9 legacy)');
      const legacySecs = [
        { label: 'Stone Placement Location',     item: ops.stonePlacement,  sectionKey: 'stone' },
        { label: 'Spoils Placement Location(s)', item: ops.spoilsPlacement, sectionKey: 'spoils' },
      ];
      for (const sec of legacySecs) {
        if (!sec.item) continue;
        const rows = [];
        if (sec.item.desc)      rows.push({ label: 'Location description', value: sec.item.desc });
        if (sec.item.superName) rows.push({ label: 'Site Superintendent',  value: sec.item.superName });
        if (sec.item.pfMgrName) rows.push({ label: 'PF Field Ops Mgr',     value: sec.item.pfMgrName });
        if (sec.item.capturedByName || sec.item.signedAt) {
          const by   = sec.item.capturedByName || '—';
          const when = sec.item.signedAt
            ? fmtDate(sec.item.signedAt.slice(0, 10)) + ' ' + (sec.item.signedAt.slice(11, 16) || '') + ' UTC'
            : '—';
          rows.push({ label: 'Signature captured by', value: `${by} on ${when}` });
        }
        if (rows.length) {
          doc.text(sec.label, { size: 11, bold: true });
          doc.table(rows, { valueW: 280 });
          const sigRefs = allAttach.filter((a) => a && a.bucket === 'sr_signature' && a.key === sec.sectionKey);
          const mkRefs  = allAttach.filter((a) => a && a.bucket === 'sr_markup'    && a.key === sec.sectionKey);
          for (const a of [...sigRefs, ...mkRefs]) {
            const hasUrl = a.webUrl && a.webUrl.startsWith('https://pierfoundations.sharepoint.com/');
            const urlPart = hasUrl ? `  ${String(a.webUrl).trim()}` : '';
            doc.text(`  - ${a.name}  [${bucketLabel(a.bucket)}]${urlPart}`, { size: 10 });
          }
          doc.spacer(4);
        }
      }
    }
  }

  // ---- Attachments (refs only; bytes live in SharePoint) -------------------
  // cleanAttachments: keep only https:// webUrls so no bare item IDs or
  // non-https references reach the PDF.
  const attach = allAttach.filter((a) => a && a.name && String(a.name).trim());
  if (attach.length) {
    doc.heading('Attachments (filed in SharePoint)');
    for (const a of attach) {
      const bkt = bucketLabel(a.bucket);
      const fname = String(a.name).trim();
      // Only emit the SharePoint link if it is verifiably https.
      const hasHttpsUrl = a.webUrl && /^https:\/\//i.test(String(a.webUrl).trim());
      const urlPart = hasHttpsUrl ? `  ${String(a.webUrl).trim()}` : '';
      doc.text(`- ${fname}${bkt ? '  [' + bkt + ']' : ''}${urlPart}`, { size: 10 });
    }
  }

  // ---- Signature line -------------------------------------------------------
  doc.spacer(16);
  doc.rule(0.8, PF.border);
  doc.spacer(4);
  const sigName = rec.sigName || rec.inspectedBy || '';
  const sigDate = rec.sigDate ? fmtDate(rec.sigDate) : fmtDate(rec.date);
  doc.text(`Signed: ${sigName || '_________________________'}   Date: ${sigDate || '_________________________'}`,
    { size: 10 });

  // ---- Footer note ---------------------------------------------------------
  doc.spacer(12);
  doc.rule(0.8, PF.border);
  const gen = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  doc.text(`Generated by the PF Platform on submit - ${gen}. Site Readiness record.`,
    { size: 8, color: PF.muted });

  return doc.toBytes();
}

function bucketLabel(bucket) {
  if (bucket === 'grade_photo')  return 'Grade Photo';
  if (bucket === 'proof_roll')   return 'Proof Roll Letter';
  if (bucket === 'staking_photo') return 'Staking Photo';
  if (bucket === 'safety_cert')  return 'Safety Cert';
  if (bucket === 'sr_markup')    return 'Site Plan Markup';
  if (bucket === 'sr_signature') return 'Signature';
  if (bucket === 'photos')       return 'Site Photo';
  return bucket || '';
}

// Format an ISO date string (YYYY-MM-DD) as MM/DD/YYYY.
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// PDF filename: "YY-MMDD-<Project Name>-Site Readiness.pdf"
//   Matches Derek's Daily Report convention so all field PDFs sort together by date.
//   YY-MMDD from the inspection DATE.  Project name keeps spaces/hyphens, strips
//   SharePoint-illegal chars.  conflictBehavior 'rename' on upload handles duplicates.
export function pdfFilename(rec) {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(String(rec.date || ''))
    ? String(rec.date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-');
  const datePart = `${yyyy.slice(2)}-${mm}${dd}`;
  const name = safeProjectName(rec.projectName || rec.projectId || 'Project');
  return `${datePart}-${name}-Site Readiness.pdf`;
}

// Sanitize a project NAME for a SharePoint filename — same rules as daily-report-doc:
// strip SharePoint-illegal chars, keep spaces/hyphens, collapse whitespace, trim dots.
function safeProjectName(v) {
  let s = String(v == null ? '' : v)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '').replace(/\.+$/, '')
    .trim()
    .slice(0, 80)
    .trim();
  return s || 'Project';
}

function safeComp(v) {
  return String(v == null ? '' : v).replace(/[\\/:*?"<>|]/g, '').replace(/[\x00-\x1f]/g, '').slice(0, 60).trim() || 'Project';
}

// ---------------------------------------------------------------------------
// 2) EMAIL: Graph sendMail as peter@ with PDF attached
// ---------------------------------------------------------------------------
export const MAIL_FROM = 'peter@pierfoundations.com';

export async function sendSiteReadinessEmail(env, token, { recipients, subject, bodyText, pdfBytes, filename }) {
  const toRecipients = recipients.map((addr) => ({ emailAddress: { address: addr } }));
  const message = {
    subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients,
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: filename,
      contentType: 'application/pdf',
      contentBytes: bytesToBase64(pdfBytes),
    }],
  };
  const url = `${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (resp.status !== 202) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error('sendMail failed ' + resp.status + (detail ? ' ' + detail : ''));
  }
  return true;
}

export function buildEmailBody(rec) {
  const lines = [];
  lines.push(`Site Readiness Form for ${rec.projectName || rec.projectId || 'project'} on ${fmtDate(rec.date) || rec.date || ''}.`);
  lines.push('');
  lines.push(`Result: ${rec.result || 'N/A'}`);
  lines.push(`Inspected by: ${rec.inspectedBy || '-'}`);
  lines.push(`GC/Site Contact: ${rec.gcContact || '-'}`);
  if (rec.siteAddress) lines.push(`Site Address: ${rec.siteAddress}`);
  if (rec.result === 'NOT READY' && Array.isArray(rec.openItems) && rec.openItems.length) {
    lines.push('');
    lines.push('Open items: ' + rec.openItems.join(', '));
  }
  lines.push('');
  lines.push('The full form is attached as a PDF. This is an automated message from the PF Platform.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3) SHAREPOINT: upload PDF to job's "Site Readiness" subfolder
//    Path: <projectFolder>/Site Readiness/<filename>
//    Uses the same project-folder resolution as field-upload.js (deterministic
//    path listing, not search).
// ---------------------------------------------------------------------------

const PROJECTS_PATH = '04 - Project Management/02 - Projects';
const COMPLETED_FOLDER_NAME = '001 - Completed Projects';
const SR_SUBFOLDER = 'Site Readiness';

// Encode each path segment for Graph path addressing (keep "/" literal).
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}

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

async function resolveProjectFolder(env, token, projectNumber) {
  const active = await listFolderChildrenByPath(env, token, PROJECTS_PATH);
  const activeMatch = active.find((f) => nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  const completedPath = `${PROJECTS_PATH}/${COMPLETED_FOLDER_NAME}`;
  const yearFolders = await listFolderChildrenByPath(env, token, completedPath);
  for (const year of yearFolders) {
    const inYear = await listFolderChildrenById(env, token, year.id);
    const match = inYear.find((f) => nameMatchesProject(f.name, projectNumber));
    if (match) return { id: match.id, name: match.name };
  }

  return null;
}

async function findChildFolder(env, token, parentId, name) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=999`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const existing = (Array.isArray(data && data.value) ? data.value : [])
    .find((it) => it && it.folder && it.name === name);
  return existing ? existing.id : null;
}

async function ensureChildFolder(env, token, parentId, name) {
  const found = await findChildFolder(env, token, parentId, name);
  if (found) return found;

  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (resp.status === 409) {
    // Concurrent request created it first -- re-list and reuse.
    const reuse = await findChildFolder(env, token, parentId, name);
    if (reuse) return reuse;
    throw new Error('folder conflict but folder not found on re-list');
  }
  if (!resp.ok) throw new Error('folder create failed ' + resp.status);
  const created = await resp.json();
  return created.id;
}

// Upload the PDF into <projectFolder>/Site Readiness/<filename>.
// Returns { id, name, webUrl, size }.
// Throws if the project folder cannot be resolved or the upload fails.
export async function uploadSiteReadinessPdf(env, token, projectId, filename, pdfBytes) {
  // Resolve the project folder by project number (same logic as field-upload.js).
  const PROJ_NUM_RE = /^[0-9]{2}-[0-9]{2,4}$/;
  if (!PROJ_NUM_RE.test(String(projectId || ''))) {
    throw new Error('Site Readiness PDF upload requires a valid project number (NN-NNN format).');
  }

  const proj = await resolveProjectFolder(env, token, String(projectId));
  if (!proj) {
    throw new Error(`Could not find project folder for ${projectId} in SharePoint.`);
  }

  // Ensure "Site Readiness" subfolder exists under the project folder.
  const srFolderId = await ensureChildFolder(env, token, proj.id, SR_SUBFOLDER);

  // Upload PDF (simple PUT; site readiness PDFs are small, well under 4MB).
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(srFolderId)}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
    body: pdfBytes,
  });
  if (resp.status !== 200 && resp.status !== 201) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error('SharePoint upload failed ' + resp.status + (detail ? ' ' + detail : ''));
  }
  const item = await resp.json();
  return { id: item.id, name: item.name, webUrl: item.webUrl, size: item.size };
}
