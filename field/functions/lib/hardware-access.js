// Hardware page feature flag — PRO-DIG MMS3 Mast + Vibro viewer.
//
// CURRENT STATE: preview mode.  Only Derek Franke may access the page.
//
// TO GO LIVE (open to all authenticated users):
//   Set HARDWARE_GO_LIVE = true  (requires redeploy — one-line change here).
//   The page will then be accessible to all users whose role passes the
//   normal area check (admin + field_ops reach the hardware-page area).
//
// ADMIN-ONLY NOTE: During preview mode Brad, Jonathan, and other admins
// are blocked by the UID check below.  They gain access when GO_LIVE is true.

export const HARDWARE_GO_LIVE = false;

// When HARDWARE_GO_LIVE is false, only the UIDs in this Set may access the
// hardware page, the hardware-img assets, and the /api/hardware endpoint.
//
// Derek Franke — dfranke@pierfoundations.com
//   uid = 518075f1-ec9f-413b-bdd9-8924c4b62959, role = admin
export const HARDWARE_ALLOWED_UIDS = new Set([
  '518075f1-ec9f-413b-bdd9-8924c4b62959',
]);

// Returns true if the given session is allowed to view hardware content.
// Called by _middleware.js for every hardware path.
export function hardwareAllowed(session) {
  if (HARDWARE_GO_LIVE) return true;
  if (!session || !session.uid) return false;
  return HARDWARE_ALLOWED_UIDS.has(session.uid);
}
