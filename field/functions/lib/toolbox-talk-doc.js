// toolbox-talk-doc.js: PDF renderer + email + SharePoint upload for Safety Analysis.
// Renamed from "Toolbox Talk" to "Safety Analysis" (Derek Franke, 2026-10-30).
//
// PDF layout order (per Derek's spec):
//   1. Header - brand masthead, title "Safety Analysis"
//   2. Project Info - project, date, location, superintendent
//   3. Jobsite Safety Analysis - JSA textareas + 20-item hazard checklist + hierarchy
//   4. Toolbox Talk - presenter, topic, key points, hazards today, questions, actions
//   5. Crew Acknowledgment - statement + name/title/acknowledged per attendee
//
// ZERO FINANCIALS: this renderer never touches dollar amounts, rates, or costs.

import { PdfDoc, bytesToBase64, PF } from './pdf.js';
import { TOPIC_LABELS, HAZARD_ITEMS, HAZARD_KEY_LABELS } from './toolbox-talk-store.js';
import { GRAPH } from './graph.js';

export const MAIL_FROM = 'peter@pierfoundations.com';

// SP folder path - UNCHANGED from original TT design.
const TT_SP_BASE_PATH = '05 - Field Operations/Toolbox Talks';

// Convert YYYY-MM-DD -> MM/DD/YYYY for display.
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  return `${m[2]}/${m[3]}/${m[1]}`;
}

// ---------------------------------------------------------------------------
// 1) RENDER: record -> PDF bytes
// ---------------------------------------------------------------------------
export function renderToolboxTalkPdf(rec) {
  const doc = new PdfDoc();

  // ---- Header ----------------------------------------------------------------
  doc.brandHeader('Safety Analysis', [
    { label: 'Project',    value: rec.projectName || '-' },
    { label: 'Project No', value: rec.projectId   || '-' },
    { label: 'Date',       value: fmtDate(rec.date) || '-' },
    { label: 'Supt.',      value: rec.superintendent || '-' },
  ]);
  doc.spacer(2);

  // ---- Section 2: Project Info -----------------------------------------------
  doc.heading('Project Info');
  doc.table([
    { label: 'Project',        value: rec.projectName || '-' },
    { label: 'Project No',     value: rec.projectId   || '-' },
    { label: 'Date',           value: fmtDate(rec.date) || '-' },
    { label: 'Location',       value: rec.location    || '-' },
    { label: 'Superintendent', value: rec.superintendent || '-' },
  ], { valueW: 280 });

  // ---- Section 3: Jobsite Safety Analysis ------------------------------------
  doc.heading('Jobsite Safety Analysis');

  // Three textareas
  doc.text('Sequence of Basic Job Steps', { size: 9, bold: true, color: PF.secondary });
  doc.spacer(1);
  doc.text(rec.jsaSteps && rec.jsaSteps.trim() ? rec.jsaSteps : 'None recorded.', { size: 10 });
  doc.spacer(4);

  doc.text('Potential Hazards', { size: 9, bold: true, color: PF.secondary });
  doc.spacer(1);
  doc.text(rec.jsaHazards && rec.jsaHazards.trim() ? rec.jsaHazards : 'None recorded.', { size: 10 });
  doc.spacer(4);

  doc.text('Preventative Measures', { size: 9, bold: true, color: PF.secondary });
  doc.spacer(1);
  doc.text(rec.jsaPreventative && rec.jsaPreventative.trim() ? rec.jsaPreventative : 'None recorded.', { size: 10 });
  doc.spacer(6);

  // Hazard checklist as a 4-column grid
  doc.text('Check Off Potential Hazards', { size: 9, bold: true, color: PF.secondary });
  doc.spacer(2);
  const checkedSet = new Set(Array.isArray(rec.hazardChecks) ? rec.hazardChecks : []);
  _renderHazardGrid(doc, checkedSet);
  doc.spacer(4);

  // Hierarchy of Competency
  doc.text('Hierarchy of Competency', { size: 9, bold: true, color: PF.secondary });
  doc.spacer(1);
  const hierNames = Array.isArray(rec.hierarchyNames) ? rec.hierarchyNames : [];
  if (hierNames.some((n) => n && n.trim())) {
    const rows = hierNames.map((name, i) => ({
      label: String(i + 1) + '.',
      value: (name && name.trim()) ? name.trim() : '-',
    }));
    doc.table(rows, { valueW: 340 });
  } else {
    doc.text('Not recorded.', { size: 10 });
  }

  // ---- Section 4: Toolbox Talk -----------------------------------------------
  doc.heading('Toolbox Talk');

  const topicLabel = TOPIC_LABELS[rec.topic] || rec.topic || '-';
  const topicDisplay = (rec.topic === 'other' && rec.topicOther)
    ? `Other: ${rec.topicOther}`
    : topicLabel;

  doc.table([
    { label: 'Presenter', value: rec.presenter || '-' },
    { label: 'Topic',     value: topicDisplay },
    { label: 'Location',  value: rec.location  || '-' },
  ], { valueW: 280 });

  doc.heading('Key Points Discussed', { top: 6 });
  doc.text(rec.keyPoints && rec.keyPoints.trim() ? rec.keyPoints : 'None recorded.', { size: 10 });

  doc.heading('Hazards Specific to Today\'s Work', { top: 6 });
  doc.text(rec.hazards && rec.hazards.trim() ? rec.hazards : 'None identified.', { size: 10 });

  doc.heading('Questions or Concerns Raised', { top: 6 });
  doc.text(rec.questions && rec.questions.trim() ? rec.questions : 'None.', { size: 10 });

  const actions = rec.actions && rec.actions.trim();
  if (actions) {
    doc.heading('Corrective Actions', { top: 6 });
    doc.text(actions, { size: 10 });
  }

  // ---- Section 5: Crew Acknowledgment ----------------------------------------
  doc.heading('Crew Acknowledgment');

  // Statement text (exact text from Derek's spec)
  doc.text(
    'By checking Acknowledged, I confirm I attended this safety briefing, I understand the hazards and ' +
    'preventative measures reviewed on this form, and I agree to follow them. ' +
    'This serves as my digital signature.',
    { size: 9, color: PF.secondary }
  );
  doc.spacer(4);

  const attendees = Array.isArray(rec.attendees) ? rec.attendees.filter((a) => a && a.name) : [];
  if (attendees.length) {
    // Header row
    doc.table([{ label: 'Name / Title', value: 'Acknowledged' }], {
      valueW: 110, size: 9,
    });
    doc.spacer(2);
    // Attendee rows
    const attRows = attendees.map((a) => {
      const nameTitle = a.name + (a.title ? ' / ' + a.title : '');
      const ackLabel  = a.acknowledged ? 'Acknowledged' : 'Not acknowledged';
      return { label: nameTitle, value: ackLabel };
    });
    doc.table(attRows, { valueW: 110, size: 10 });
  } else {
    doc.text('No attendees recorded.', { size: 10 });
  }

  // ---- Footer ----------------------------------------------------------------
  // No spacer before rule -- attendee content flows directly into footer.
  doc.rule(0.8, PF.border);
  const gen = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  doc.text(`Generated by the PF Platform on submit - ${gen}. Safety Analysis record.`,
    { size: 8, color: PF.muted });

  return doc.toBytes();
}

// Render a 4-column hazard checklist grid into the doc at current position.
// Each cell: [checkmark] Label or [ ] Label depending on checked state.
function _renderHazardGrid(doc, checkedSet) {
  const items = HAZARD_ITEMS;
  const COLS  = 4;
  const rowH  = 14;
  // Cell width = content width / columns
  const MARGIN = 54;
  const CONTENT_W = 612 - MARGIN * 2;
  const cellW = CONTENT_W / COLS;

  // Group into rows of 4
  for (let i = 0; i < items.length; i += COLS) {
    doc._ensure(rowH + 2);
    doc.y -= rowH;
    for (let c = 0; c < COLS && (i + c) < items.length; c++) {
      const item = items[i + c];
      const x = MARGIN + c * cellW;
      const mark = checkedSet.has(item.key) ? '[x]' : '[ ]';
      doc._draw(`${mark} ${item.label}`, 8.5, 'helv', x, doc.y + rowH * 0.25, PF.body);
    }
  }
  doc.spacer(2);
}

// ---- Filename convention: "YY-MMDD-<Project>-Safety Analysis.pdf" ----------
function safeProjectName(v, fallback) {
  let s = String(v == null ? '' : v)
    .replace(/[\\/:*?"<>|]/g, '').replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').replace(/\.+$/, '').trim()
    .slice(0, 80).trim();
  return s || (fallback || 'Project');
}

export function pdfFilename(rec) {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(String(rec.date || ''))
    ? String(rec.date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-');
  const datePart = `${yyyy.slice(2)}-${mm}${dd}`;
  const name = safeProjectName(rec.projectName || rec.projectId, 'Project');
  return `${datePart}-${name}-Safety Analysis.pdf`;
}

// ---------------------------------------------------------------------------
// 2) EMAIL
// ---------------------------------------------------------------------------
export async function sendTalkEmail(env, token, { recipients, subject, bodyText, pdfBytes, filename }) {
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
  const topicLabel = TOPIC_LABELS[rec.topic] || rec.topic || '-';
  const topicDisplay = (rec.topic === 'other' && rec.topicOther)
    ? `Other: ${rec.topicOther}` : topicLabel;
  const lines = [];
  lines.push(`Safety Analysis for ${rec.projectName || rec.projectId || 'project'} on ${fmtDate(rec.date) || rec.date || ''}.`);
  lines.push('');
  lines.push(`Superintendent: ${rec.superintendent || '-'}`);
  lines.push(`Location:       ${rec.location || '-'}`);
  const checkedKeys = Array.isArray(rec.hazardChecks) ? rec.hazardChecks : [];
  if (checkedKeys.length) {
    const labels = checkedKeys.map((k) => HAZARD_KEY_LABELS[k] || k);
    lines.push(`Hazards checked: ${labels.join(', ')}`);
  }
  lines.push('');
  lines.push(`Toolbox Talk Topic:     ${topicDisplay}`);
  lines.push(`Presenter:              ${rec.presenter || '-'}`);
  const n = Array.isArray(rec.attendees) ? rec.attendees.filter((a) => a && a.name).length : 0;
  lines.push(`Crew members: ${n}`);
  if (rec.keyPoints && rec.keyPoints.trim()) {
    lines.push('');
    lines.push(`Key Points: ${rec.keyPoints.trim().slice(0, 300)}`);
  }
  if (rec.hazards && rec.hazards.trim()) {
    lines.push(`Hazards Today: ${rec.hazards.trim().slice(0, 200)}`);
  }
  if (rec.actions && rec.actions.trim()) {
    lines.push(`Corrective Actions: ${rec.actions.trim().slice(0, 200)}`);
  }
  lines.push('');
  lines.push('The full record is attached as a PDF. This is an automated message from the PF Platform.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3) SHAREPOINT: upload to "05 - Field Operations/Toolbox Talks/{YYYY}/"
// ---------------------------------------------------------------------------
// SP folder UNCHANGED from original TT design - Safety Analysis PDFs are
// still safety-meeting logs, stored alongside legacy TT records.

async function ensureFolder(env, token, path) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const segments = String(path).split('/');
  let parentId = 'root';
  for (const seg of segments) {
    if (!seg) continue;
    const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: seg, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (resp.status === 409 || resp.status === 201 || resp.status === 200) {
      const listUrl = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=999`;
      const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!listResp.ok) throw new Error('ensureFolder list failed ' + listResp.status);
      const data = await listResp.json();
      const match = (data.value || []).find((it) => it && it.folder && it.name === seg);
      if (!match) throw new Error(`ensureFolder: could not find child "${seg}" under parent`);
      parentId = match.id;
    } else {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`ensureFolder create "${seg}" failed ${resp.status}: ${detail}`);
    }
  }
  return parentId;
}

export async function uploadTalkPdf(env, token, rec, filename, pdfBytes) {
  const year = (rec.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const folderPath = `${TT_SP_BASE_PATH}/${year}`;
  const folderId = await ensureFolder(env, token, folderPath);

  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content?@microsoft.graph.conflictBehavior=rename`;
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
