// Cloudflare Pages Function -- /api/past-reports
// Returns a combined list of Daily Field Reports and Site Readiness records for
// the authenticated user's role, sorted by date DESC.
//
// RBAC: field_ops area (same gate as DFR + SR endpoints).
//   field_ops = admin / partner / business_dev / field_ops
//   ZERO financials: only operational metadata is returned (date, project, status,
//   PDF name, SharePoint link).  No dollar amounts, rates, or costs.
//
// RESPONSE:
//   { ok: true, reports: [{ id, type, date, projectName, projectId, status,
//                           pdfName, pdfWebUrl, submittedAt, createdAt }] }
//   type = 'daily-report' | 'site-readiness'
//   reports sorted by date DESC, then createdAt DESC within the same date.

import { requireArea } from '../lib/auth.js';
import { listReports } from '../lib/daily-report-store.js';
import { listRecords } from '../lib/site-readiness-store.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap = 300) {
  if (v == null) return '';
  let str = String(v);
  return str.length > cap ? str.slice(0, cap) : str;
}

export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;

  try {
    if (!env.PF_SCHEDULE && !env.DB) {
      return json({ ok: true, reports: [], note: 'No data store available.' });
    }

    // Load both record types in parallel.
    const [drResult, srResult] = await Promise.all([
      listReports(env, {}),
      listRecords(env, {}),
    ]);

    const drReports = (drResult && Array.isArray(drResult.reports) ? drResult.reports : [])
      .map((r) => ({
        id:          s(r.id),
        type:        'daily-report',
        date:        s(r.date),
        projectName: s(r.projectName || r.projectId),
        projectId:   s(r.projectId),
        status:      s(r.status),
        pdfName:     s(r.pdfName),
        pdfWebUrl:   /^https:\/\//i.test(String(r.pdfWebUrl || '')) ? s(r.pdfWebUrl, 500) : '',
        submittedAt: s(r.submittedAt),
        createdAt:   s(r.createdAt),
      }));

    const srReports = (srResult && Array.isArray(srResult.records) ? srResult.records : [])
      .map((r) => ({
        id:          s(r.id),
        type:        'site-readiness',
        date:        s(r.date),
        projectName: s(r.projectName || r.projectId),
        projectId:   s(r.projectId),
        status:      s(r.status),
        result:      s(r.result),
        pdfName:     s(r.pdfName),
        pdfWebUrl:   /^https:\/\//i.test(String(r.pdfWebUrl || '')) ? s(r.pdfWebUrl, 500) : '',
        submittedAt: s(r.submittedAt),
        createdAt:   s(r.createdAt),
      }));

    const combined = drReports.concat(srReports).sort((a, b) => {
      // Primary sort: date DESC (ISO string compare works for YYYY-MM-DD)
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCmp !== 0) return dateCmp;
      // Secondary: createdAt DESC
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    return json({ ok: true, reports: combined });
  } catch (err) {
    console.error('api/past-reports GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
