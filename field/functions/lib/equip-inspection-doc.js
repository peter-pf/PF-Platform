// equip-inspection-doc.js -- PDF generation + SharePoint upload for Daily Equipment Inspection.
//
// Mirrors site-readiness-doc.js end to end.
//
// SharePoint path:
//   05 - Field Operations/Equipment Checklist/<Machine Type>/<Serial>/<filename>
//
// Filename format (Derek, 10/25/2026): YY-MMDD-<serial>-daily-inspection.pdf
//   where serial is already sanitized (alphanumerics + dashes).
//
// SOURCE NOTES (checklist items):
//   Cat Skid Steer OMM SEBU9258-01 (262D3/272D3 series):
//     https://www.cat.com/en_US/support/operations/service-manuals.html
//   Cat Excavator OMM UENR7706-00 (320/323 series):
//     https://www.cat.com/en_US/support/operations/service-manuals.html
//   Cat Excavator OMM UENR8027 (336 series):
//     https://www.cat.com/en_US/support/operations/service-manuals.html
//   Generic daily walk-around reference also at:
//     https://www.cat.com/en_US/support/maintenance.html

import { PdfDoc, bytesToBase64, PF } from './pdf.js';
import { GRAPH } from './graph.js';
import { CHECKLIST_ITEMS, MACHINE_LABELS } from './equip-inspection-store.js';

// ---------------------------------------------------------------------------
// 1. FILENAME
// ---------------------------------------------------------------------------
// YY-MMDD-<serial>-daily-inspection.pdf
// serial already sanitized by the API endpoint before this is called.
export function pdfFilename(rec) {
  const d = rec.date || '';               // YYYY-MM-DD
  const yy   = d.slice(2, 4);
  const mmdd = d.slice(5, 7) + d.slice(8, 10);
  const serial = sanitizeSerial(rec.serialNumber || 'unknown');
  return `${yy}-${mmdd}-${serial}-daily-inspection.pdf`;
}

// Sanitize serial for filename: alphanumerics and hyphens only.
function sanitizeSerial(raw) {
  return String(raw).replace(/[^A-Za-z0-9\-]/g, '').slice(0, 40) || 'unknown';
}

// ---------------------------------------------------------------------------
// 2. RENDER: record -> PDF bytes (PF-branded)
// ---------------------------------------------------------------------------
export function renderEquipInspectionPdf(rec) {
  const doc = new PdfDoc();

  const typeLabel = MACHINE_LABELS[rec.machineType] || rec.machineType || '-';
  const safeResult = rec.safeToOperate === true ? 'Safe to Operate: YES'
    : rec.safeToOperate === false ? 'Safe to Operate: NO'
    : 'Safe to Operate: Not answered';
  const ownedRented = rec.ownedOrRented || '-';

  doc.brandHeader('Daily Equipment Inspection', [
    { label: 'Machine',     value: typeLabel },
    { label: 'Job #',       value: rec.projectId || rec.jobNumber || '-' },
    { label: 'Date',        value: fmtDate(rec.date) },
    { label: 'Serial #',    value: rec.serialNumber || '-' },
  ]);
  doc.spacer(2);

  // Safe-to-operate banner
  const isOk = rec.safeToOperate === true;
  const bannerH = 22;
  if (doc.y - (bannerH + 8) < 54) doc._newPage();
  doc.y -= 8;
  const by = doc.y - bannerH;
  const bannerBg = isOk ? [0.22, 0.78, 0.38] : [0.85, 0.25, 0.25];
  doc.fillRect(54, by, 612 - 54 * 2, bannerH, bannerBg);
  doc._draw(safeResult, 11, 'helvb', 54 + 8, by + 7, [1, 1, 1]);
  doc.y = by - 4;

  // Header details block
  doc.heading('Machine Information');
  doc.table([
    { label: 'Machine Type',  value: typeLabel },
    { label: 'Job Number',    value: rec.projectId || rec.jobNumber || '-' },
    { label: 'Date',          value: fmtDate(rec.date) },
    { label: 'Inspected By',  value: rec.inspectedBy || '-' },
    { label: 'Owned / Rented', value: ownedRented },
    { label: 'Serial Number', value: rec.serialNumber || '-' },
    { label: 'Machine Hours', value: rec.machineHours != null ? String(rec.machineHours) + ' hrs' : '-' },
  ], { valueW: 260 });

  // Checklist sections
  const items = Array.isArray(rec.items) ? rec.items : [];
  const bySection = {};
  const sectionOrder = [];
  for (const def of CHECKLIST_ITEMS) {
    if (!def.types.includes(rec.machineType)) continue;
    if (!bySection[def.section]) {
      bySection[def.section] = [];
      sectionOrder.push(def.section);
    }
    const found = items.find((it) => it && it.key === def.key);
    bySection[def.section].push({
      label: def.label,
      answer: (found && found.answer) || '',
      note:   (found && found.note)   || '',
    });
  }

  for (const section of sectionOrder) {
    doc.heading(section);
    const rows = bySection[section].flatMap(({ label, answer, note }) => {
      const rowAnswer = answer || '—';
      const display = note ? `${rowAnswer}   Note: ${note}` : rowAnswer;
      return [{ label, value: display }];
    });
    doc.table(rows, { valueW: 280 });
  }

  // Deficiencies / Notes
  if (rec.deficienciesNotes && String(rec.deficienciesNotes).trim()) {
    doc.heading('Deficiencies / Notes');
    doc.text(rec.deficienciesNotes, { size: 10 });
  }

  // Footer note
  doc.spacer(8);
  doc.text('This checklist is a starting-point template. Contact Derek Franke to refine items for your specific machine.', {
    size: 9, color: PF.secondary,
  });

  return doc.build();
}

function fmtDate(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// 3. EMAIL (Graph sendMail) -- mirrors site-readiness-doc.js
// ---------------------------------------------------------------------------
export async function sendEquipInspectionEmail(token, rec, pdfBytes, recipients) {
  if (!token || !recipients || !recipients.length) return;
  const typeLabel = MACHINE_LABELS[rec.machineType] || rec.machineType || '-';
  const filename = pdfFilename(rec);
  const subject = `Daily Equipment Inspection — ${typeLabel} ${rec.serialNumber || ''} — ${fmtDate(rec.date)}`;
  const bodyText = buildEmailBody(rec);

  const payload = {
    message: {
      subject,
      body: { contentType: 'Text', content: bodyText },
      toRecipients: recipients.map((a) => ({ emailAddress: { address: a } })),
      attachments: [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: filename,
        contentType: 'application/pdf',
        contentBytes: bytesToBase64(pdfBytes),
      }],
    },
  };
  await fetch(`${GRAPH}/users/peter@pierfoundations.com/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function buildEmailBody(rec) {
  const typeLabel = MACHINE_LABELS[rec.machineType] || rec.machineType || '-';
  const safeStr = rec.safeToOperate === true ? 'YES' : rec.safeToOperate === false ? 'NO' : 'Not answered';
  const items = Array.isArray(rec.items) ? rec.items : [];
  const attn = items.filter((i) => i && i.answer === 'Needs Attention');
  let body = `Daily Equipment Inspection\n\nMachine: ${typeLabel}\nSerial: ${rec.serialNumber || '-'}\n`;
  body += `Job: ${rec.projectId || rec.jobNumber || '-'}\nDate: ${fmtDate(rec.date)}\nInspected By: ${rec.inspectedBy || '-'}\n`;
  body += `Machine Hours: ${rec.machineHours != null ? rec.machineHours + ' hrs' : '-'}\nOwned/Rented: ${rec.ownedOrRented || '-'}\n`;
  body += `\nSafe to Operate: ${safeStr}\n`;
  if (attn.length) {
    body += `\nItems Needing Attention (${attn.length}):\n`;
    for (const it of attn) {
      const def = CHECKLIST_ITEMS.find((d) => d.key === it.key);
      body += `  - ${def ? def.label : it.key}${it.note ? ': ' + it.note : ''}\n`;
    }
  }
  if (rec.deficienciesNotes) body += `\nDeficiencies / Notes:\n${rec.deficienciesNotes}\n`;
  return body;
}

// ---------------------------------------------------------------------------
// 4. SHAREPOINT UPLOAD
// ---------------------------------------------------------------------------
// Path: 05 - Field Operations/Equipment Checklist/<Machine Type Folder>/<Serial>/<filename>
//
// "Equipment Checklist" folder already exists at id 016ISVH63BW25FXFK2Y5H2UPBKEI2ZRSW2
// (verified 2026-10-25 via Graph). We create Machine Type and Serial subfolders if needed.

const EQUIP_CHECKLIST_ID = '016ISVH63BW25FXFK2Y5H2UPBKEI2ZRSW2';

// Folder name per machine type (safe SP names, no special chars)
const MACHINE_TYPE_FOLDERS = {
  skid_steer:         'Skid Steer Loader',
  predrill_excavator: 'Predrill Excavator',
  vibro_excavator:    'Vibro Excavator',
};

export async function uploadEquipInspectionPdf(env, token, rec, pdfBytes) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const filename = pdfFilename(rec);
  const machineFolder = MACHINE_TYPE_FOLDERS[rec.machineType] || 'Other';
  const serialFolder  = sanitizeSerial(rec.serialNumber || 'unknown');

  // Ensure Machine Type folder under Equipment Checklist
  const machineId = await ensureChildFolder(env, token, EQUIP_CHECKLIST_ID, machineFolder);
  // Ensure Serial folder under Machine Type folder
  const serialId  = await ensureChildFolder(env, token, machineId, serialFolder);

  // Upload PDF (conflictBehavior=rename so no overwrite)
  const uploadUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(serialId)}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/pdf',
    },
    body: pdfBytes,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => '');
    throw new Error(`SP upload failed ${uploadResp.status}: ${errText.slice(0, 200)}`);
  }
  const item = await uploadResp.json();
  return { name: filename, itemId: item.id || '', webUrl: item.webUrl || '' };
}

async function findChildFolder(env, token, parentId, name) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const listUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=999`;
  const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listResp.ok) return null;
  const data = await listResp.json();
  const existing = (Array.isArray(data && data.value) ? data.value : [])
    .find((it) => it && it.folder && it.name === name);
  return existing ? existing.id : null;
}

async function ensureChildFolder(env, token, parentId, name) {
  const found = await findChildFolder(env, token, parentId, name);
  if (found) return found;

  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const createUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children`;
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (createResp.status === 409) {
    const reuse = await findChildFolder(env, token, parentId, name);
    if (reuse) return reuse;
    throw new Error('folder conflict but folder not found on re-list');
  }
  if (!createResp.ok) throw new Error('folder create failed ' + createResp.status);
  const created = await createResp.json();
  return created.id;
}
