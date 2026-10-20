// Cloudflare Pages Function -- GET /api/field-projects
// Returns the field-safe project list as [{number, name}].
//
// WHY THIS ENDPOINT EXISTS:
//   The main platform portal loads fo-projects-field.js as a static data file
//   (server-gated at DATA_FILE_AREAS). The field portal is a separate Pages
//   project (pf-field) with its own deployment; it has no access to the main
//   portal's static files. This endpoint bundles the same field-safe project
//   list (from field/functions/lib/fo-projects-data.js) into the Functions
//   bundle and serves it behind the auth gate.
//
// SECURITY:
//   - requireArea(session, 'field_ops') — field crew, partners, admin all
//     receive the list. An unauthenticated request returns 401 (middleware
//     gate fires first, before this handler runs).
//   - Response contains ONLY {number, name}. ZERO financials, ZERO GC data,
//     ZERO contract values, ZERO dollar amounts.
//   - This matches the SEC-09 field-safe contract already in place for
//     fo-projects-field.js on the main portal.
//
// WIRING:
//   - field/functions/lib/auth.js areaForPath maps /api/field-projects ->
//     'field_ops' (added alongside this file).
//   - field/index.html loadProjects() calls this endpoint instead of reading
//     window.PF_FO_PROJECTS || window.PF_AWARDED (which are never set on the
//     standalone field portal).

import { requireArea } from '../lib/auth.js';
import { FO_PROJECTS } from '../lib/fo-projects-data.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

export async function onRequestGet(context) {
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;
  // Return only {number, name} — confirm no financial keys.
  const projects = FO_PROJECTS.map((p) => ({ number: p.number, name: p.name }));
  return new Response(JSON.stringify({ ok: true, projects }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
