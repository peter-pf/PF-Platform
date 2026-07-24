// Cloudflare Pages Function — /api/hr
//
// Serves the CURATED, NON-SENSITIVE HR DIRECTORY roster to the portal HR module.
// This is a DIRECTORY + ORG view ONLY. It returns ONLY these safe fields per
// employee: id, name, title, department, location, startDate, status, workEmail,
// workPhone.
//
// 🔒 HARD SENSITIVE BOUNDARY (non-negotiable):
//   - This endpoint NEVER reads, computes, or returns compensation, bonus, salary,
//     wages, pay rates, tax forms (W-4/WH-4/941), SSN, benefits, payment schedules,
//     or W9 data. Those remain document-only in SharePoint under existing SP
//     permissions and are NEVER surfaced in the portal.
//   - The roster below was curated ONLY from non-sensitive sources (org knowledge,
//     the D1 login-email records, the role map). No HR document was opened to
//     source any value. Values not available from a non-sensitive source are
//     'TBD — confirm with Brad/Derek'.
//   - Output is WHITELIST-FILTERED to SAFE_FIELDS on every response, so even if the
//     source data were later edited to include a stray key, only safe fields are
//     ever serialized. Sensitive keys cannot leak by construction.
//
// RBAC:
//   - Behind the auth gate (functions/_middleware.js): no verified session -> 401.
//   - The middleware ALSO gates /api/hr -> 'hr' area (auth.js areaForPath), so a
//     non-admin/non-hr session is denied at the middleware BEFORE this runs.
//   - This handler calls requireArea(session, 'hr') as a defense-in-depth backstop
//     (admin + hr role ONLY). Fails CLOSED.
//
// DATA SOURCE:
//   The curated roster is embedded as a SERVER CONSTANT here (the function IS the
//   served register, per Derek's sourced->register->portal-reads-it standard). It
//   mirrors platform/data/hr-roster.json (the documented register of record). No
//   Graph/SharePoint call, no KV, no external fetch — nothing sensitive is touched.

import { requireArea } from '../lib/auth.js';

// The ONLY fields this endpoint will ever return. Any key not in this list is
// dropped before serialization — a structural guarantee against sensitive leaks.
const SAFE_FIELDS = [
  'id', 'name', 'title', 'department', 'location', 'startDate', 'status',
  'workEmail', 'workPhone',
];

// Curated NON-SENSITIVE HR directory roster (v1 provisional).
// Mirrors platform/data/hr-roster.json. Safe fields only. NO comp/tax/SSN/benefits.
const SAFE_ROSTER = [
  {
    id: 'PF-EMP-001', name: 'John Willis', title: 'Field Operations Manager',
    department: 'Field Operations', location: 'Wisconsin (field crew)',
    startDate: 'TBD', status: 'Active',
    workEmail: 'jwillis@pierfoundations.com', workPhone: 'TBD',
  },
  {
    id: 'PF-EMP-002', name: 'Seth Willis', title: 'Operator',
    department: 'Field Operations', location: 'Wisconsin (field crew)',
    startDate: 'TBD', status: 'Active',
    workEmail: 'swillis@pierfoundations.com', workPhone: 'TBD',
  },
  {
    id: 'PF-EMP-003', name: 'Jordan LeMay', title: 'Operator',
    department: 'Field Operations', location: 'Wisconsin (field crew)',
    startDate: 'TBD', status: 'Active',
    workEmail: 'jlemay@pierfoundations.com', workPhone: 'TBD',
  },
  {
    id: 'PF-EMP-004', name: 'Kendall Mavity', title: 'Bookkeeping / Billing',
    department: 'Accounting', location: 'Indiana',
    startDate: 'TBD', status: 'Active',
    workEmail: 'TBD', workPhone: 'TBD',
  },
  {
    id: 'PF-EMP-005', name: 'Chase Kinsey', title: 'TBD — confirm with Brad/Derek',
    department: 'TBD — confirm with Brad/Derek', location: 'TBD',
    startDate: 'TBD', status: 'Active',
    workEmail: 'TBD', workPhone: 'TBD',
  },
];

const ROSTER_META = {
  version: 'v1 provisional',
  updated: '2026-07-24',
  note: 'Directory + org view only. Curated from non-sensitive sources. Comp/tax/SSN/benefits/payment data stay document-only in SharePoint and are never returned here.',
};

// Return a NEW object containing ONLY the whitelisted safe fields. Anything else
// on the source object is dropped. This is the leak-proof serialization boundary.
function pickSafe(emp) {
  const out = {};
  for (const k of SAFE_FIELDS) {
    out[k] = Object.prototype.hasOwnProperty.call(emp, k) ? emp[k] : '';
  }
  return out;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

export async function onRequestGet(context) {
  // Defense-in-depth: admin + hr role ONLY. Fails closed on missing/invalid session.
  const denied = requireArea(context.data && context.data.session, 'hr');
  if (denied) return denied;

  const employees = SAFE_ROSTER.map(pickSafe);
  return json({ ok: true, employees, meta: ROSTER_META });
}

// Read-only endpoint. No POST/PUT/DELETE — the directory is curated in the
// register (platform/data/hr-roster.json) + this constant, not edited via the API.
export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ status: 'method_not_allowed', message: 'Only GET is supported.' }, 405);
}
