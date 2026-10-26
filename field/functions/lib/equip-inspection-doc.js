// equip-inspection-doc.js -- PDF generation + SharePoint upload for Daily Equipment Inspection.
//
// SharePoint path:
//   05 - Field Operations/Equipment Checklist/<Machine Type>/<Serial>/<filename>
//
// Filename format (Derek, 10/25/2026): YY-MMDD-<serial>-daily-inspection.pdf
//   where serial is already sanitized (alphanumerics + dashes).
//
// PDF LAYOUT (Round 2 fixes):
//   - brandHeader called with empty title string; two-line "Daily Equipment / Inspection"
//     drawn manually in the band with _draw() so it never collides with the metadata block.
//   - Checklist items use doc.row() (word-wraps left column) instead of doc.table()
//     (which clips with ellipsis on long labels).
//   - Notes render under each item using doc.text() with indent.
//   - "Needs Attention" items render with red right-column text.
//   - A Deficiencies summary section lists all "Needs Attention" items near the top,
//     after Machine Information, before the per-section checklists.
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
//
// NOTE: No email. Submit = save to D1 + PDF to SharePoint only (PRIMARY-8, 2026-10-25).

import { PdfDoc, PF, bytesToBase64 } from './pdf.js';
import { GRAPH } from './graph.js';
import { CHECKLIST_ITEMS, MACHINE_LABELS } from './equip-inspection-store.js';

// ---------------------------------------------------------------------------
// bandHeader geometry constants -- must mirror brandHeader() in pdf.js exactly.
// ---------------------------------------------------------------------------
const PAGE_H     = 792;
const MARGIN     = 54;
const BAND_H     = 104;
const BAND_Y     = PAGE_H - BAND_H;      // = 688
const BAND_CTR_Y = BAND_Y + BAND_H / 2;  // = 740

// The logo occupies logoX=52, logoW<=190, so logoRightX<=242.
// titleX is 18pt after the logo's right edge. Use 260 conservatively.
const TITLE_X    = 260;

// Red colour for "Needs Attention" answer text in the PDF.
const RED = [0.75, 0.12, 0.12];

// ---------------------------------------------------------------------------
// 1. FILENAME
// ---------------------------------------------------------------------------
// YY-MMDD-<serial>-daily-inspection.pdf
export function pdfFilename(rec) {
  const d = rec.date || '';
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

// Photo thumbnail dimensions.
const THUMB_W     = 180;   // pts (2.5 inches)
const THUMB_GAP_X = 12;    // pts between thumbnails in same row
const THUMB_GAP_Y = 8;     // pts between thumbnail rows
const MAX_THUMB_H = 180;   // pts max height per thumbnail
const THUMBS_PER_ROW = 2;

// Decode JPEG from data-URL or raw base64 string.
// Returns { b64, w, h } where w/h come from caller-supplied dims.
function decodePhotoEntry(p) {
  let b64 = p.data || '';
  if (b64.startsWith('data:')) {
    const comma = b64.indexOf(',');
    b64 = comma >= 0 ? b64.slice(comma + 1) : '';
  }
  return { b64, w: p.w || 1, h: p.h || 1 };
}

// Embed section photos in the PDF (2 per row, proportional thumbnails).
function embedSectionPhotos(doc, photos) {
  if (!photos || !photos.length) return;
  doc.spacer(6);
  for (let i = 0; i < photos.length; i += THUMBS_PER_ROW) {
    const rowSlice = photos.slice(i, i + THUMBS_PER_ROW);
    // Register images and compute display dimensions.
    const rowItems = rowSlice.map((p) => {
      const { b64, w, h } = decodePhotoEntry(p);
      const aspect  = h / w;
      const dispH   = Math.min(Math.round(THUMB_W * aspect), MAX_THUMB_H);
      const idx     = doc.addJpeg(b64, w, h);
      return { idx, dispH };
    });
    const rowH = Math.max(...rowItems.map((r) => r.dispH));
    // Ensure room for this thumbnail row; creates a new page if needed.
    doc._ensure(rowH + THUMB_GAP_Y);
    const yBase = doc.y - rowH;
    for (let j = 0; j < rowItems.length; j++) {
      const { idx, dispH } = rowItems[j];
      const x = MARGIN + j * (THUMB_W + THUMB_GAP_X);
      // Draw JPEG thumbnail using the raw cm + Do operator (not placeJpeg,
      // because we want all images in the row at the same y-base).
      doc.cur.push(
        `q ${THUMB_W.toFixed(2)} 0 0 ${dispH.toFixed(2)} ${x.toFixed(2)} ${yBase.toFixed(2)} cm /DImg${idx} Do Q`
      );
    }
    doc.y = yBase - THUMB_GAP_Y;
  }
  doc.spacer(2);
}

export function renderEquipInspectionPdf(rec) {
  const doc = new PdfDoc();

  const typeLabel   = MACHINE_LABELS[rec.machineType] || rec.machineType || '-';
  const ownedRented = rec.ownedOrRented || '-';
  const safeStr     = rec.safeToOperate === true  ? 'Safe to Operate: YES'
                    : rec.safeToOperate === false ? 'Safe to Operate: NO'
                    :                               'Safe to Operate: Not answered';

  const sectionPhotos = (rec.sectionPhotos && typeof rec.sectionPhotos === 'object')
    ? rec.sectionPhotos : {};

  // ---- Brand header ----
  doc.brandHeader('', [
    { label: 'Machine',  value: typeLabel },
    { label: 'Job #',    value: rec.projectId || rec.jobNumber || '-' },
    { label: 'Date',     value: fmtDate(rec.date) },
    { label: 'Serial #', value: rec.serialNumber || '-' },
  ]);
  doc._draw('Daily Equipment', 13, 'euro', TITLE_X, BAND_CTR_Y + 7, PF.white);
  doc._draw('Inspection',      13, 'euro', TITLE_X, BAND_CTR_Y - 7, PF.white);

  doc.spacer(2);

  // ---- Safe-to-operate banner ----
  const isOk    = rec.safeToOperate === true;
  const bannerH = 22;
  if (doc.y - (bannerH + 8) < 54) doc._newPage();
  doc.y -= 8;
  const by = doc.y - bannerH;
  const bannerBg = isOk ? [0.22, 0.78, 0.38] : [0.85, 0.25, 0.25];
  doc.fillRect(MARGIN, by, 612 - MARGIN * 2, bannerH, bannerBg);
  doc._draw(safeStr, 11, 'helvb', MARGIN + 8, by + 7, [1, 1, 1]);
  doc.y = by - 4;

  // ---- Machine Information ----
  doc.heading('Machine Information');
  doc.table([
    { label: 'Machine Type',   value: typeLabel },
    { label: 'Job Number',     value: rec.projectId || rec.jobNumber || '-' },
    { label: 'Date',           value: fmtDate(rec.date) },
    { label: 'Inspected By',   value: rec.inspectedBy || '-' },
    { label: 'Owned / Rented', value: ownedRented },
    { label: 'Serial Number',  value: rec.serialNumber || '-' },
    { label: 'Machine Hours',  value: rec.machineHours != null ? String(rec.machineHours) + ' hrs' : '-' },
  ], { valueW: 260 });

  // ---- Deficiencies Summary ----
  const items      = Array.isArray(rec.items) ? rec.items : [];
  const attention  = items.filter((it) => it && it.answer === 'Needs Attention');
  if (attention.length) {
    doc.heading('Deficiencies Summary');
    for (const it of attention) {
      const def   = CHECKLIST_ITEMS.find((d) => d.key === it.key);
      const label = def ? def.label : it.key;
      doc.row(label, 'Needs Attention', { size: 9.5, rightW: 95, rightColor: RED });
      if (it.note) doc.text('Note: ' + it.note, { size: 8.5, color: PF.secondary, indent: 16 });
    }
    doc.spacer(4);
  }

  // ---- Checklist sections with photos ----
  const bySection    = {};
  const sectionOrder = [];
  for (const def of CHECKLIST_ITEMS) {
    if (!def.types.includes(rec.machineType)) continue;
    if (!bySection[def.section]) {
      bySection[def.section] = [];
      sectionOrder.push(def.section);
    }
    const found = items.find((it) => it && it.key === def.key);
    bySection[def.section].push({
      label:  def.label,
      answer: (found && found.answer) || '',
      note:   (found && found.note)   || '',
    });
  }

  for (const section of sectionOrder) {
    doc.heading(section);
    for (const { label, answer, note } of bySection[section]) {
      const isAttn    = answer === 'Needs Attention';
      const isEmpty   = !answer;
      const rightText = isEmpty ? 'Not checked' : answer;
      doc.row(label, rightText, {
        size:       9.5,
        rightW:     95,
        rightColor: isEmpty ? PF.muted : (isAttn ? RED : (answer === 'N/A' ? PF.secondary : PF.azureDark)),
      });
      if (note) doc.text('Note: ' + note, { size: 8.5, color: PF.secondary, indent: 16 });
    }
    // Embed photos for this section (if any).
    const secPhotos = sectionPhotos[section];
    if (Array.isArray(secPhotos) && secPhotos.length) {
      embedSectionPhotos(doc, secPhotos);
    }
    doc.spacer(2);
  }

  // ---- Inspector Notes ----
  if (rec.deficienciesNotes && String(rec.deficienciesNotes).trim()) {
    doc.heading('Inspector Notes');
    doc.text(rec.deficienciesNotes, { size: 10 });
  }

  doc.spacer(8);
  doc.text(
    'This checklist is a starting-point template. Contact Derek Franke to refine items for your specific machine.',
    { size: 9, color: PF.secondary }
  );

  return doc.toBytes();
}

function fmtDate(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// 3. SHAREPOINT UPLOAD
// ---------------------------------------------------------------------------
// Path: 05 - Field Operations/Equipment Checklist/<Machine Type Folder>/<Serial>/<filename>
//
// "Equipment Checklist" folder already exists at id 016ISVH63BW25FXFK2Y5H2UPBKEI2ZRSW2
// (verified 2026-10-25 via Graph). We create Machine Type and Serial subfolders if needed.

const EQUIP_CHECKLIST_ID = '016ISVH63BW25FXFK2Y5H2UPBKEI2ZRSW2';

const MACHINE_TYPE_FOLDERS = {
  skid_steer:         'Skid Steer Loader',
  predrill_excavator: 'Predrill Excavator',
  vibro_excavator:    'Vibro Excavator',
};

// ---------------------------------------------------------------------------
// 3b. UPLOAD SECTION PHOTOS TO SHAREPOINT
// ---------------------------------------------------------------------------
// Filename: YY-MMDD-<serial>-<sectionSlug>-<n>.jpg
// Placed in the same serial folder as the PDF.

export function sectionToSlug(section) {
  return String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// base64OrDataUrl -> JPEG bytes
function jpegBytes(src) {
  let b64 = src || '';
  if (b64.startsWith('data:')) {
    const comma = b64.indexOf(',');
    b64 = comma >= 0 ? b64.slice(comma + 1) : '';
  }
  // base64 -> Uint8Array
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function uploadSectionPhotos(env, token, rec, serialFolderId) {
  const driveId       = encodeURIComponent(env.SP_DRIVE_ID);
  const d             = rec.date || '';
  const yy            = d.slice(2, 4);
  const mmdd          = d.slice(5, 7) + d.slice(8, 10);
  const serial        = sanitizeSerial(rec.serialNumber || 'unknown');
  const sectionPhotos = (rec.sectionPhotos && typeof rec.sectionPhotos === 'object')
    ? rec.sectionPhotos : {};

  for (const [section, photos] of Object.entries(sectionPhotos)) {
    if (!Array.isArray(photos)) continue;
    const slug = sectionToSlug(section);
    for (let n = 0; n < photos.length; n++) {
      const p = photos[n];
      if (!p || !p.data) continue;
      const bytes    = jpegBytes(p.data);
      const filename = `${yy}-${mmdd}-${serial}-${slug}-${n + 1}.jpg`;
      const uploadUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(serialFolderId)}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;
      try {
        const resp = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
          body: bytes,
        });
        if (resp.ok) {
          const item = await resp.json();
          // Store SP URL back in the photo record for reference.
          p.spUrl = item.webUrl || '';
          p.spId  = item.id || '';
        } else {
          console.error('[equip-inspection] photo SP upload failed', resp.status, section, n);
        }
      } catch (e) {
        console.error('[equip-inspection] photo SP upload error', e && e.message, section, n);
      }
    }
  }
}

export async function uploadEquipInspectionPdf(env, token, rec, pdfBytes) {
  const driveId      = encodeURIComponent(env.SP_DRIVE_ID);
  const filename     = pdfFilename(rec);
  const machineFolder = MACHINE_TYPE_FOLDERS[rec.machineType] || 'Other';
  const serialFolder  = sanitizeSerial(rec.serialNumber || 'unknown');

  const machineId = await ensureChildFolder(env, token, EQUIP_CHECKLIST_ID, machineFolder);
  const serialId  = await ensureChildFolder(env, token, machineId, serialFolder);

  const uploadUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(serialId)}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' },
    body: pdfBytes,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => '');
    throw new Error(`SP upload failed ${uploadResp.status}: ${errText.slice(0, 200)}`);
  }
  const item = await uploadResp.json();
  return { name: filename, itemId: item.id || '', webUrl: item.webUrl || '', serialFolderId };
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
