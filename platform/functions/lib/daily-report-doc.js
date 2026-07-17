// Render a daily-report record into a PDF (Uint8Array) and provide the Graph
// helpers that (a) email that PDF to the mailing list and (b) upload it into the
// "Daily Report Output (Test)" SharePoint folder.
//
// ZERO FINANCIALS: this renderer NEVER prints a dollar amount, rate, or cost. It
// only reads the operational fields daily-report.js already stores (hours,
// counts, weather, narrative, maintenance). No pay/$ field is ever referenced.
//
// The three side effects (PDF, email, SharePoint) live here so the endpoint stays
// small and each concern is independently testable.

import { PdfDoc, bytesToBase64, PF } from './pdf.js';
import { GRAPH } from './graph.js';

// ---------------------------------------------------------------------------
// 1) RENDER: record -> PDF bytes  (PF-branded: azure header band, azure section
//    chips, Eurostile display font, PF text palette. Layout/aesthetics only --
//    identical fields, identical data contract, ZERO financials.)
// ---------------------------------------------------------------------------
export function renderDailyReportPdf(rec) {
  const doc = new PdfDoc();
  const weather = [rec.precipitation, rec.temp].filter(Boolean).join('  ');
  // Azure masthead: LEFT = wordmark/tagline/title, RIGHT = labeled job-info block.
  // Derek: put the categories (with text labels) in the header, project number
  // AMONG them (after the named fields). This block replaces the old duplicate
  // Project/Date/Foreman/Weather list that used to sit in the body.
  doc.brandHeader('Daily Field Report', [
    { label: 'Project',    value: rec.projectName || '-' },
    { label: 'Date',       value: rec.date || '-' },
    { label: 'Foreman',    value: rec.foreman || '-' },
    { label: 'Weather',    value: weather || rec.weather || '-' },
    { label: 'Project No', value: rec.projectId || '-' },
  ]);
  doc.spacer(2);

  // ---- production (table: centered value column + zebra rows) ----
  doc.heading('Production');
  doc.table([
    { label: 'Columns installed',    value: (rec.columnsInstalled != null) ? String(rec.columnsInstalled) : '-' },
    { label: 'Linear feet installed', value: (rec.lfInstalled != null) ? String(rec.lfInstalled) : '-' },
  ], { valueW: 130 });

  // ---- crew (name + HOURS only, never pay) ----
  doc.heading('Crew');
  const crew = Array.isArray(rec.crew) ? rec.crew.filter((c) => c && (c.name || c.hours != null)) : [];
  if (crew.length) {
    doc.table(crew.map((c) => ({
      label: c.costCode ? `${c.name || '-'}  (${c.costCode})` : (c.name || '-'),
      value: (c.hours != null && c.hours !== '') ? `${c.hours} h` : '',
    })), { valueW: 90 });
  } else {
    doc.text('No crew recorded.', { size: 10 });
  }

  // ---- equipment owned + rental (machine + operating hours, no $) ----
  const owned = Array.isArray(rec.equipmentOwned) ? rec.equipmentOwned.filter((e) => e && (e.machine || e.hours != null)) : [];
  const rental = Array.isArray(rec.equipmentRental) ? rec.equipmentRental.filter((e) => e && (e.category || e.hours != null)) : [];
  if (owned.length || rental.length) {
    doc.heading('Equipment');
    const eqRows = [];
    if (owned.length) {
      eqRows.push({ label: 'Owned', value: '' }); // sub-heading row
      for (const e of owned) {
        eqRows.push({ label: e.machine || '-', indent: 12,
          value: (e.hours != null && e.hours !== '') ? `${e.hours} hr` : '' });
      }
    }
    if (rental.length) {
      eqRows.push({ label: 'Rental', value: '' }); // sub-heading row
      for (const e of rental) {
        eqRows.push({ label: e.category || '-', indent: 12,
          value: (e.hours != null && e.hours !== '') ? `${e.hours} hr` : '' });
      }
    }
    doc.table(eqRows, { valueW: 110, subLabels: new Set(['Owned', 'Rental']) });
  }

  // ---- maintenance (category / type / subcategory / detail / hour-at-failure) --
  const maint = Array.isArray(rec.maintenance)
    ? rec.maintenance.filter((m) => m && (m.type || m.subcategory || m.item || m.category))
    : [];
  if (maint.length) {
    doc.heading('Maintenance');
    doc.table(maint.map((m) => {
      const bits = [m.type, m.subcategory, m.item].filter(Boolean).join(' - ');
      return {
        label: `${m.category || 'General'}: ${bits || '-'}`,
        value: (m.hourAtFailure != null && m.hourAtFailure !== '') ? `${m.hourAtFailure} hr` : '',
      };
    }), { valueW: 90 });
  }

  // ---- future issues (equipment + description, no $) ----
  const future = Array.isArray(rec.futureIssues)
    ? rec.futureIssues.filter((f) => f && (f.equipment || f.description))
    : [];
  if (future.length) {
    doc.heading('Future Maintenance / Issues');
    for (const f of future) {
      const line = f.equipment ? `${f.equipment} - ${f.description || ''}` : (f.description || '-');
      doc.text('- ' + line, { size: 10 });
    }
  }

  // ---- delays ----
  doc.heading('Delays');
  doc.text(rec.delays && rec.delays.trim() ? rec.delays : 'None reported.', { size: 10 });

  // ---- safety ----
  doc.heading('Safety');
  doc.text(rec.safety && rec.safety.trim() ? rec.safety : 'None reported.', { size: 10 });

  // ---- work completed narrative ----
  doc.heading('Work Completed');
  doc.text(rec.workCompleted && rec.workCompleted.trim() ? rec.workCompleted : 'No narrative provided.', { size: 10 });

  // ---- attachments (names only; the files live in SharePoint) ----
  const attach = Array.isArray(rec.attachments) ? rec.attachments.filter((a) => a && (a.name || a.itemId)) : [];
  if (attach.length) {
    doc.heading('Attachments (in SharePoint)');
    for (const a of attach) {
      const bkt = a.bucket === 'guhma' ? 'GUHMA Data' : (a.bucket === 'handlogs' ? 'Hand Logs' : '');
      doc.text('- ' + (a.name || a.itemId) + (bkt ? `  [${bkt}]` : ''), { size: 10 });
    }
  }

  // ---- footer note ----
  doc.spacer(12);
  doc.rule(0.8, PF.border);
  const gen = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  doc.text(`Generated by the PF Platform on submit - ${gen}. Field operations record - no financial data.`,
    { size: 8, color: PF.muted });

  return doc.toBytes();
}

// A safe, short filename component (letters/digits/-/_ only).
export function safeComponent(v, fallback) {
  const s = String(v == null ? '' : v).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60);
  return s || fallback;
}

// Sanitize a project NAME for a SharePoint filename: strip only the characters
// SharePoint/OneDrive forbid ( \ / : * ? " < > | ) plus control chars; KEEP
// spaces and hyphens (Derek wants the readable project name). Collapse repeat
// whitespace, trim, and drop any leading/trailing dots (SharePoint dislikes
// leading/trailing dots + spaces). Bounded length. Never empty.
export function safeProjectName(v, fallback) {
  let s = String(v == null ? '' : v)
    .replace(/[\\/:*?"<>|]/g, '')     // SharePoint-illegal characters
    .replace(/[\x00-\x1f]/g, '')       // control chars
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim()
    .replace(/^\.+/, '').replace(/\.+$/, '') // no leading/trailing dots
    .trim()
    .slice(0, 80)
    .trim();
  return s || (fallback || 'Project');
}

// Derek's filename convention: "YY-MMDD-[project name].pdf".
//   YY-MMDD is derived from the report DATE (e.g. 2026-07-17 -> 26-0717).
//   [project name] is the readable, SharePoint-safe project name.
// conflictBehavior 'rename' on upload gives same-day duplicates a numeric suffix.
export function pdfFilename(rec) {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(String(rec.date || ''))
    ? String(rec.date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-');
  const datePart = `${yyyy.slice(2)}-${mm}${dd}`;               // YY-MMDD
  const name = safeProjectName(rec.projectName || rec.projectId, 'Project');
  return `${datePart}-${name}.pdf`;
}

// ---------------------------------------------------------------------------
// 2) EMAIL: Graph sendMail as peter@ with the PDF as a base64 attachment
// ---------------------------------------------------------------------------
// The app-only Graph token (client_credentials) carries the Mail.Send APPLICATION
// role, so we may send AS a specific mailbox via /users/{upn}/sendMail.
export const MAIL_FROM = 'peter@pierfoundations.com';

export async function sendReportEmail(env, token, { recipients, subject, bodyText, pdfBytes, filename }) {
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
  // Graph sendMail returns 202 Accepted with an empty body on success.
  if (resp.status !== 202) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error('sendMail failed ' + resp.status + (detail ? ' ' + detail : ''));
  }
  return true;
}

// A short plain-text email body summarizing the report (NO $).
export function buildEmailBody(rec) {
  const lines = [];
  lines.push(`Daily field report for ${rec.projectName || rec.projectId || 'project'} on ${rec.date || ''}.`);
  lines.push('');
  lines.push(`Foreman: ${rec.foreman || '-'}`);
  const weather = [rec.precipitation, rec.temp].filter(Boolean).join('  ') || rec.weather || '-';
  lines.push(`Weather: ${weather}`);
  const prod = [];
  if (rec.columnsInstalled != null) prod.push(`${rec.columnsInstalled} columns`);
  if (rec.lfInstalled != null) prod.push(`${rec.lfInstalled} LF`);
  lines.push(`Production: ${prod.length ? prod.join(', ') : '-'}`);
  const crewN = Array.isArray(rec.crew) ? rec.crew.filter((c) => c && c.name).length : 0;
  lines.push(`Crew on site: ${crewN}`);
  if (rec.delays && rec.delays.trim()) lines.push(`Delays: ${rec.delays.trim().slice(0, 200)}`);
  if (rec.safety && rec.safety.trim()) lines.push(`Safety: ${rec.safety.trim().slice(0, 200)}`);
  lines.push('');
  lines.push('The full report is attached as a PDF. This is an automated message from the PF Platform.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3) SHAREPOINT: upload the PDF into the fixed "Daily Report Output (Test)" folder
// ---------------------------------------------------------------------------
// The target folder drive-item id is FIXED on the server (env or the known test
// id). The client NEVER supplies a drive id, path, or item id — same "not an open
// proxy" posture as field-upload.js. A daily-report PDF is well under 4MB so a
// simple PUT ...:/content upload is sufficient (no upload session needed).
export async function uploadReportPdf(env, token, folderId, filename, pdfBytes) {
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
