// functions/lib/sp-project-folders.js
// Shared SharePoint project-folder resolution logic.
// Used by:
//   - /api/field-upload  (single-project resolution for upload routing)
//   - /api/field-projects (batch resolution with KV caching for display)
//
// DESIGN: list the Projects folder ONCE per cold request and prefix-match all
// project numbers against it.  Completed-project year folders are traversed
// only for numbers that do not match the active tree, keeping Graph calls minimal.

import { GRAPH } from './graph.js';

export const PROJECTS_PATH = '04 - Project Management/02 - Projects';
export const COMPLETED_FOLDER_NAME = '001 - Completed Projects';

// Does this folder name belong to the given project number?
//   "26-002"  OR  "26-002 - ..."  OR  "26-002-..."
export function nameMatchesProject(name, projectNumber) {
  if (typeof name !== 'string') return false;
  return name === projectNumber
    || name.startsWith(projectNumber + ' ')
    || name.startsWith(projectNumber + '-');
}

// Encode a Graph path: encode each SEGMENT but keep "/" literal.
function encGraphPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

// List FOLDER children of a drive item by PATH. Follows nextLink.
export async function listFolderChildrenByPath(env, token, path) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  const encPath = encGraphPath(path);
  let url = `${GRAPH}/drives/${driveId}/root:/${encPath}:/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name, folder: it.folder });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// List FOLDER children of a drive item by ITEM ID. Follows nextLink.
export async function listFolderChildrenById(env, token, itemId) {
  const driveId = encodeURIComponent(env.SP_DRIVE_ID);
  let url = `${GRAPH}/drives/${driveId}/items/${encodeURIComponent(itemId)}/children?$select=name,id,folder&$top=200`;
  const out = [];
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) return out;
    if (!resp.ok) throw new Error('list children failed ' + resp.status);
    const data = await resp.json();
    (Array.isArray(data && data.value) ? data.value : []).forEach((it) => {
      if (it && it.folder) out.push({ id: it.id, name: it.name, folder: it.folder });
    });
    url = data['@odata.nextLink'] || null;
  }
  return out;
}

// Resolve a SINGLE project folder (used by field-upload.js).
// Returns { id, name } or null.
export async function resolveProjectFolder(env, token, projectNumber) {
  const active = await listFolderChildrenByPath(env, token, PROJECTS_PATH);
  const activeMatch = active.find((f) => nameMatchesProject(f.name, projectNumber));
  if (activeMatch) return { id: activeMatch.id, name: activeMatch.name };

  const completedPath = `${PROJECTS_PATH}/${COMPLETED_FOLDER_NAME}`;
  const yearFolders = await listFolderChildrenByPath(env, token, completedPath);
  for (const year of yearFolders) {
    const inYear = await listFolderChildrenById(env, token, year.id);
    const match = inYear.find((f) => nameMatchesProject(f.name, projectNumber));
    if (match) return { id: match.id, name: match.name };
  }
  return null;
}

// Resolve MULTIPLE project folder names in batch (used by field-projects.js).
// Makes ONE active-projects listing call; checks Completed only for unmatched numbers.
// Returns { [projectNumber]: folderName|null }.
export async function resolveAllProjectFolderNames(env, token, projectNumbers) {
  const results = {};
  const unmatched = [...projectNumbers];

  // One call: list the active Projects folder.
  const active = await listFolderChildrenByPath(env, token, PROJECTS_PATH);
  for (let i = unmatched.length - 1; i >= 0; i--) {
    const num = unmatched[i];
    const match = active.find((f) => nameMatchesProject(f.name, num));
    if (match) {
      results[num] = match.name;
      unmatched.splice(i, 1);
    }
  }

  // Extra calls only for projects not found in active tree.
  if (unmatched.length > 0) {
    const completedPath = `${PROJECTS_PATH}/${COMPLETED_FOLDER_NAME}`;
    const yearFolders = await listFolderChildrenByPath(env, token, completedPath).catch(() => []);
    for (const year of yearFolders) {
      if (unmatched.length === 0) break;
      const inYear = await listFolderChildrenById(env, token, year.id).catch(() => []);
      for (const f of inYear) {
        const idx = unmatched.findIndex((num) => nameMatchesProject(f.name, num));
        if (idx >= 0) {
          results[unmatched[idx]] = f.name;
          unmatched.splice(idx, 1);
        }
      }
    }
  }

  // Projects with no SP folder yet get null.
  for (const num of unmatched) results[num] = null;
  return results;
}
