// Cloudflare Pages Function -- GET /api/field-projects
// Returns the field-safe project list as [{number, name, spFolder}].
//
// WHY THIS ENDPOINT EXISTS:
//   The main platform portal loads fo-projects-field.js as a static data file
//   (server-gated at DATA_FILE_AREAS). The field portal is a separate Pages
//   project (pf-field) with its own deployment; it has no access to the main
//   portal's static files. This endpoint serves the live SP-driven project list
//   behind the auth gate.
//
// SECURITY:
//   - requireArea(session, 'field_ops') — field crew, partners, admin all
//     receive the list. An unauthenticated request returns 401 (middleware
//     gate fires first, before this handler runs).
//   - Response contains ONLY {number, name, spFolder}. ZERO financials, ZERO GC
//     data, ZERO contract values, ZERO dollar amounts.
//   - This matches the SEC-09 field-safe contract already in place for
//     fo-projects-field.js on the main portal.
//
// PROJECT LIST SOURCE (as of 2026-11-22):
//   Real projects are sourced LIVE from SP "05 - Field Operations/01 - Projects"
//   with a 15-minute KV cache (key "sp_fo_projects").  A new folder Derek creates
//   appears in the dropdown within 15 minutes — no deployment required.
//   On Graph failure: falls back to "sp_fo_projects_last_good" (30-day KV key),
//   then to the static FO_PROJECTS list.  Never returns an empty dropdown.
//   See field/functions/lib/sp-fo-projects.js for the full fallback chain.
//
// NON-JOB ENTRIES (NJ-*):
//   NJ entries come from the STATIC FO_PROJECTS (fo-projects-data.js) and are
//   appended ONLY when the caller passes ?includeNonJob=1.
//   - daily-report.html, equipment-inspection.html, toolbox-talk.html: pass the flag.
//   - site-readiness.html, index.html: do NOT pass the flag.
//   site-readiness.html emails BEFORE uploading; an NJ project would cause the SP
//   upload to fail and generate duplicate emails on retry.  EI and TT upload BEFORE
//   emailing (safe), and their SP paths are fixed (not project-routed).

import { requireArea } from '../lib/auth.js';
import { FO_PROJECTS } from '../lib/fo-projects-data.js';
import { getSpFoProjects } from '../lib/sp-fo-projects.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;

  // NJ entries only returned when caller passes ?includeNonJob=1.
  // daily-report.html, equipment-inspection.html and toolbox-talk.html pass this flag.
  // site-readiness.html and index.html must NOT get NJ entries.
  const url = new URL(request.url);
  const includeNonJob = url.searchParams.get('includeNonJob') === '1';
  const NJ_RE = /^NJ-/;

  // Real projects: sourced live from SharePoint "05 - Field Operations/01 - Projects"
  // via getSpFoProjects(), with 15-min KV cache and multi-level fallback.
  const realProjects = await getSpFoProjects(env);

  // NJ (non-job) entries come from the static FO_PROJECTS.
  // They are only appended when ?includeNonJob=1.
  const njProjects = FO_PROJECTS.filter(p => NJ_RE.test(p.number))
    .map(p => ({ number: p.number, name: p.name, spFolder: null }));

  // Build response — only {number, name, spFolder}. ZERO financials, ZERO GC data.
  const projects = includeNonJob ? [...realProjects, ...njProjects] : realProjects;

  return new Response(JSON.stringify({ ok: true, projects }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
