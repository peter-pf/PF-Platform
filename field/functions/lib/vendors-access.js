// Vendors page feature flag — supplier/parts directory for Derek's field ops.
//
// CURRENT STATE: preview mode.  Only Derek Franke may access the page.
//
// TO GO LIVE (open reads to all authenticated users, writes stay EDITORS-only):
//   Set VENDORS_GO_LIVE = true  (requires redeploy — one-line change here).
//   The page will then be accessible to any authenticated user for reading.
//   Writes (add/edit/delete) remain restricted to VENDORS_EDITORS regardless
//   of VENDORS_GO_LIVE — controlled by the second flag below.
//
// ADMIN-ONLY NOTE: During preview mode Brad, Jonathan, and other admins
// are blocked by the UID check below.  They gain access when GO_LIVE is true.

export const VENDORS_GO_LIVE = false;

// When VENDORS_GO_LIVE is false, only the UIDs in this Set may access the
// vendors page, its API endpoint, and read vendor data.
//
// Derek Franke — dfranke@pierfoundations.com
//   uid = 518075f1-ec9f-413b-bdd9-8924c4b62959, role = admin
export const VENDORS_ALLOWED_UIDS = new Set([
  '518075f1-ec9f-413b-bdd9-8924c4b62959',
]);

// VENDORS_EDITORS controls who may write (add/edit/delete) vendor records.
// Distinct from VENDORS_ALLOWED_UIDS so reads can be opened broadly while
// writes stay owner-controlled.  Set via redeploy; UID literals stay server-side.
//
// When VENDORS_GO_LIVE is true, ANY authenticated user can read; only
// VENDORS_EDITORS can write.  When false, only VENDORS_ALLOWED_UIDS can
// reach the page at all (enforced by middleware before this check fires).
export const VENDORS_EDITORS = new Set([
  '518075f1-ec9f-413b-bdd9-8924c4b62959',
]);

// Returns true if the given session is allowed to view vendor content.
// Called by _middleware.js for every vendor path.
export function vendorsAllowed(session) {
  if (VENDORS_GO_LIVE) return true;
  if (!session || !session.uid) return false;
  return VENDORS_ALLOWED_UIDS.has(session.uid);
}

// Returns true if the given session is allowed to write vendor records.
// Always checked server-side in the API handler (belt + suspenders beyond
// the middleware gate).  When VENDORS_GO_LIVE is false this is a subset of
// vendorsAllowed; when true it is the sole write gate.
export function vendorsCanEdit(session) {
  if (!session || !session.uid) return false;
  return VENDORS_EDITORS.has(session.uid);
}
