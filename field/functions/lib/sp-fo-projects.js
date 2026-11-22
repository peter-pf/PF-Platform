// field/functions/lib/sp-fo-projects.js
//
// Live project list sourced from SharePoint "05 - Field Operations/01 - Projects".
// This replaces the static FO_PROJECTS as the ACTIVE project source for the
// /api/field-projects dropdown.  FO_PROJECTS (fo-projects-data.js) is now the
// last-resort static fallback only.
//
// DESIGN — four-level fallback chain (fail-closed, never returns empty):
//   1. KV key "sp_fo_projects"      (15-min TTL) — short-lived warm cache.
//   2. Live Graph listing of the SP folder → filter + map → write both KV keys.
//   3. KV key "sp_fo_projects_last_good" (30-day TTL) — survives Graph outages.
//   4. Static FO_PROJECTS filtered to real (non-NJ) jobs with spFolder: null.
//
// A new folder Derek creates in SP appears in the dropdown within 15 minutes;
// no manual step, no deployment.
//
// PROJECT FOLDER FILTER:
//   Only folders whose names begin with /^\d{2}-\d{3,4} - / are real projects.
//   This excludes the following from "05 - Field Operations/01 - Projects":
//     "001 - Completed Jobs"              (starts with 3 raw digits + space)
//     "26-XXX - Project Name - Location"  (XXX contains letters)
//     "John Receipts - Non Job Related"   (no numeric prefix at all)
//     Loose files (listFolderChildrenByPath returns folder items only)
//
// SHAPE returned by getSpFoProjects():
//   { number: "26-028", name: "The Hangar", spFolder: "26-028 - The Hangar - Elford - Columbus, OH" }
//
// NJ entries (NJ-1, NJ-2) are NEVER included here.  field-projects.js appends
// them separately when the caller passes ?includeNonJob=1.

import { getGraphToken, graphConfigured } from './graph.js';
import { listFolderChildrenByPath } from './sp-project-folders.js';
import { FO_PROJECTS } from './fo-projects-data.js';

// The SP folder Derek maintains for active field projects.
export const FO_PROJECTS_SP_PATH = '05 - Field Operations/01 - Projects';

// A folder is a real project if its name starts with dd-ddd(d) followed by " - ".
// e.g. "26-028 - The Hangar - Elford - Columbus, OH" ✓
// e.g. "001 - Completed Jobs"              ✗ (no dd- prefix)
// e.g. "26-XXX - Project Name - Location"  ✗ (letters, not digits)
// e.g. "John Receipts - Non Job Related"   ✗ (no numeric prefix)
export const PROJECT_FOLDER_RE = /^\d{2}-\d{3,4} - /;

// KV keys used for the project list cache.
export const KV_KEY_LIVE      = 'sp_fo_projects';
export const KV_KEY_LAST_GOOD = 'sp_fo_projects_last_good';

// 15 min — new SP folder Derek creates shows up within this window.
export const KV_TTL_LIVE      = 900;
// 30 days — last-good survives an extended Graph outage.
export const KV_TTL_LAST_GOOD = 2592000;

// ---------------------------------------------------------------------------
// Pure helper functions — no I/O, easy to unit-test.
// ---------------------------------------------------------------------------

// Extract the job number from a folder name.
// "26-028 - The Hangar - Elford - Columbus, OH"  →  "26-028"
// "25-026 - The Granary - Noblesville, IN - FL & Co"  →  "25-026"
// Returns null for names that don't match the pattern.
export function extractProjectNumber(folderName) {
  if (typeof folderName !== 'string') return null;
  const m = folderName.match(/^(\d{2}-\d{3,4}) - /);
  return m ? m[1] : null;
}

// Extract the short project name from a folder name.
// Takes the first " - " delimited segment after the number prefix.
// "26-028 - The Hangar - Elford - Columbus, OH"  →  "The Hangar"
// "26-026 - POET - North Manchester, IN"          →  "POET"
// "26-029 - Anderson Twnship PW Facility - Cincy" →  "Anderson Twnship PW Facility"
// Returns null if the folder name does not contain a valid project number.
export function extractProjectName(folderName) {
  const num = extractProjectNumber(folderName);
  if (!num) return null;
  // Slice past "<number> - " (number.length + 3 chars for " - ")
  const rest = folderName.slice(num.length + 3);
  // First " - " delimited segment is the project name; fall back to full rest.
  return rest.split(' - ')[0].trim() || rest;
}

// Map one SP folder name to a project record.
// Returns { number, name, spFolder } or null for non-project folders.
export function folderToProject(folderName) {
  const number = extractProjectNumber(folderName);
  if (!number) return null;
  const name = extractProjectName(folderName);
  return { number, name, spFolder: folderName };
}

// ---------------------------------------------------------------------------
// I/O functions
// ---------------------------------------------------------------------------

// Fetch and filter the live SP folder listing.
// Returns array of { number, name, spFolder }, sorted by project number asc.
// Throws on Graph / network failure (caller handles fallback).
export async function fetchLiveSpFoProjects(env, token) {
  const folders = await listFolderChildrenByPath(env, token, FO_PROJECTS_SP_PATH);
  const projects = [];
  for (const f of folders) {
    if (PROJECT_FOLDER_RE.test(f.name)) {
      const p = folderToProject(f.name);
      if (p) projects.push(p);
    }
  }
  // Sort ascending by project number (string sort works for NN-NNN format).
  projects.sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
  return projects;
}

// Full fallback chain — the main entry point called by /api/field-projects.
// Never returns an empty array due to a transient error.
// NJ entries are NOT included; field-projects.js adds them when appropriate.
export async function getSpFoProjects(env) {
  const kv = (env && env.PF_SCHEDULE) || null;

  // 1. Short-lived KV cache (15-min TTL).
  if (kv) {
    try {
      const cached = await kv.get(KV_KEY_LIVE, { type: 'json' });
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch (_) { /* ignore KV read failure, fall through */ }
  }

  // 2. Live Graph fetch — updates both cache keys on success.
  if (graphConfigured(env)) {
    let token = null;
    try { token = await getGraphToken(env); } catch (_) { /* handled below */ }
    if (token) {
      try {
        const projects = await fetchLiveSpFoProjects(env, token);
        if (projects.length > 0) {
          if (kv) {
            // Non-fatal: a cache write failure does not block the response.
            try {
              await kv.put(KV_KEY_LIVE,      JSON.stringify(projects), { expirationTtl: KV_TTL_LIVE });
              await kv.put(KV_KEY_LAST_GOOD, JSON.stringify(projects), { expirationTtl: KV_TTL_LAST_GOOD });
            } catch (_) { /* ignore */ }
          }
          return projects;
        }
      } catch (err) {
        console.error('[sp-fo-projects] Graph fetch failed:', err && err.message);
      }
    }
  }

  // 3. Last-good KV fallback (survives transient Graph outages for up to 30 days).
  if (kv) {
    try {
      const lastGood = await kv.get(KV_KEY_LAST_GOOD, { type: 'json' });
      if (Array.isArray(lastGood) && lastGood.length > 0) {
        console.error('[sp-fo-projects] Graph unavailable — serving last-good KV fallback.');
        return lastGood;
      }
    } catch (_) { /* ignore */ }
  }

  // 4. Static FO_PROJECTS (last resort — real jobs only, spFolder: null).
  // The dropdown still works; upload path shows "Project X folder (created on first upload)".
  console.error('[sp-fo-projects] Falling back to static FO_PROJECTS (spFolder: null for all).');
  const NJ_RE = /^NJ-/;
  return FO_PROJECTS
    .filter(p => !NJ_RE.test(p.number))
    .map(p => ({ number: p.number, name: p.name, spFolder: null }));
}
