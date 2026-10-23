// Cloudflare Pages Function -- GET /api/field-projects
// Returns the field-safe project list as [{number, name, spFolder}].
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
//   - Response contains ONLY {number, name, spFolder}. ZERO financials, ZERO GC
//     data, ZERO contract values, ZERO dollar amounts.
//   - This matches the SEC-09 field-safe contract already in place for
//     fo-projects-field.js on the main portal.
//
// spFolder RESOLUTION:
//   Each project's real SharePoint folder name (e.g. "26-012 - Warrick Place")
//   is resolved via Graph in batch and cached in KV (PF_SCHEDULE) under
//   "spfolder:<number>" with a 6-hour TTL. On a cold cache ALL numbers are
//   resolved in one active-listing Graph call (resolveAllProjectFolderNames).
//   On failure or missing folder, spFolder is null and the client shows a clear
//   fallback ("Project <num> folder (created on first upload) / ...").

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken } from '../lib/graph.js';
import { FO_PROJECTS } from '../lib/fo-projects-data.js';
import { resolveAllProjectFolderNames } from '../lib/sp-project-folders.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

// KV sentinel for a confirmed "not found" result (avoids cache miss on null).
const NULL_SENTINEL = '__null__';
// 6-hour TTL for resolved folder names.
const SPFOLDER_TTL = 6 * 3600;

// Read all project numbers from KV. Returns { hits: {num:name}, misses: [num] }.
async function kvRead(kv, numbers) {
  const hits = {};
  const misses = [];
  for (const num of numbers) {
    let val;
    try { val = await kv.get(`spfolder:${num}`); } catch (_) { val = null; }
    if (val !== null) {
      hits[num] = val === NULL_SENTINEL ? null : val;
    } else {
      misses.push(num);
    }
  }
  return { hits, misses };
}

// Write resolved folder names back to KV.
async function kvWrite(kv, resolved) {
  for (const [num, name] of Object.entries(resolved)) {
    try {
      await kv.put(`spfolder:${num}`, name === null ? NULL_SENTINEL : name, {
        expirationTtl: SPFOLDER_TTL,
      });
    } catch (_) { /* non-fatal — next request will resolve again */ }
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  const denied = requireArea(context.data && context.data.session, 'field_ops');
  if (denied) return denied;

  const numbers = FO_PROJECTS.map((p) => p.number);
  const spFolders = {};

  // ---- KV cache read --------------------------------------------------------
  const kv = env.PF_SCHEDULE || null;
  let misses = numbers;

  if (kv) {
    const { hits, misses: m } = await kvRead(kv, numbers);
    Object.assign(spFolders, hits);
    misses = m;
  }

  // ---- Batch SP resolution for cache misses ---------------------------------
  if (misses.length > 0 && graphConfigured(env)) {
    let token;
    try { token = await getGraphToken(env); } catch (_) { token = null; }
    if (token) {
      let resolved = {};
      try {
        resolved = await resolveAllProjectFolderNames(env, token, misses);
      } catch (_) {
        for (const num of misses) resolved[num] = null;
      }
      Object.assign(spFolders, resolved);
      if (kv) await kvWrite(kv, resolved);
    }
  }

  // ---- Build response -------------------------------------------------------
  // spFolder: real SP folder name or null (client shows safe fallback when null).
  const projects = FO_PROJECTS.map((p) => ({
    number:   p.number,
    name:     p.name,
    spFolder: spFolders[p.number] !== undefined ? spFolders[p.number] : null,
  }));

  return new Response(JSON.stringify({ ok: true, projects }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
