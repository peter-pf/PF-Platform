// Cloudflare Pages Function -- /api/past-reports
// Returns a combined list of Daily Field Reports, Site Readiness records,
// and Toolbox Talks for the authenticated user's role, sorted by date DESC.
//
// RBAC: field_ops area (same gate as DFR + SR + TT endpoints).
//   field_ops = admin / partner / business_dev / field_ops
//   ZERO financials: only operational metadata is returned (date, project, status,
//   PDF name, SharePoint link).  No dollar amounts, rates, or costs.
//
// RESPONSE:
//   { ok: true, reports: [{ id, type, date, projectName, projectId, status,
//                           pdfName, pdfWebUrl, submittedAt, createdAt }] }
//   type = 'daily-report' | 'site-readiness' | 'toolbox-talk'
//   reports sorted by date DESC, then createdAt DESC within the same date.

import { requireArea } from '../lib/auth.js';
import { listReports } from '../lib/daily-report-store.js';
import { listRecords as listSrRecords } from '../lib/site-readiness-store.js';
import { listRecords as listTtRecords } from '../lib/toolbox-talk-store.js';

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
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  // Caller identity for draft scoping. Prefer uid (stable) over name.
  // Keep callerName separately so legacy records (createdBy = display name)
  // are still visible to their creator after the uid migration.
  const callerUid  = session && (session.uid  || '') ;
  const callerName = session && (session.name || '');
  const isAdmin    = session && session.role === 'admin';

  try {
    if (!env.PF_SCHEDULE && !env.DB) {
      return json({ ok: true, reports: [], note: 'No data store available.' });
    }

    // Load DR and SR in parallel. These are well-established; if either fails the
    // outer try/catch returns 500, which is intentional (core data unavailable).
    const [drResult, srResult] = await Promise.all([
      listReports(env, {}),
      listSrRecords(env, {}),
    ]);

    // TT is isolated: migration may not yet be applied in all environments.
    // If TT errors for any reason, log it and return no TT rows so DR/SR still list.
    let ttResult = null;
    try {
      ttResult = await listTtRecords(env, {});
    } catch (e) {
      console.error('api/past-reports: TT list failed, returning no TT rows:', e && e.message);
    }

    // Visibility rule:
    //   SENT records  -> visible to ALL field_ops (including field crew).
    //   DRAFT records -> visible ONLY to their creator (createdBy === callerUid)
    //                    OR to admins (who see everything).
    // This prevents crew members from enumerating each other's in-progress drafts.
    function draftVisible(r) {
      if (s(r.status) === 'sent') return true;
      if (isAdmin) return true;
      const cb = s(r.createdBy);
      // Match uid (new records) OR display name (legacy records written before uid migration).
      return (callerUid && cb === callerUid) || (callerName && cb === callerName);
    }

    const drReports = (drResult && Array.isArray(drResult.reports) ? drResult.reports : [])
      .filter(draftVisible)
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
      .filter(draftVisible)
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

    const ttReports = (ttResult && Array.isArray(ttResult.records) ? ttResult.records : [])
      .filter(draftVisible)
      .map((r) => ({
        id:          s(r.id),
        type:        'toolbox-talk',
        date:        s(r.date),
        projectName: s(r.projectName || r.projectId),
        projectId:   s(r.projectId),
        status:      s(r.status),
        topic:       s(r.topic),
        presenter:   s(r.presenter),
        pdfName:     s(r.pdfName),
        pdfWebUrl:   /^https:\/\//i.test(String(r.pdfWebUrl || '')) ? s(r.pdfWebUrl, 500) : '',
        submittedAt: s(r.sentAt || r.submittedAt),
        createdAt:   s(r.createdAt),
      }));

    const combined = drReports.concat(srReports).concat(ttReports).sort((a, b) => {
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
