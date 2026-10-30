// mailing-lists.js -- D1 mailing list helpers shared across submit endpoints.
//
// DESIGN DECISION (2026-10-29):
//   Recipients are now stored in the mailing_lists D1 table (migration 0011).
//   Every submit endpoint calls resolveMailingList() to get the current list.
//   If D1 is unreachable or the list is empty, the function returns
//   { recipients: [], warning: '...' }.  The caller MUST surface the warning to
//   the user and MUST NOT fall back to any hardcoded list.
//
//   The old ACTIVE_RECIPIENTS / TEST_RECIPIENTS / PROD_RECIPIENTS constants and
//   env-var overrides have been removed from every endpoint.  There is now ONE
//   source of truth: the mailing_lists table.
//
// VALID LIST KEYS:
//   'daily_report' | 'site_readiness' | 'toolbox_talk' | 'time_off' | 'equipment_inspection'

export const VALID_LIST_KEYS = new Set([
  'daily_report',
  'site_readiness',
  'toolbox_talk',
  'time_off',
  'equipment_inspection',
]);

// Owner email allowlist. Enforced SERVER-SIDE on every mailing-list mutation.
// No role in the system is held by exactly these 3 users (Brad=admin,
// Jonathan=admin, Derek=partner on live), so we enforce by explicit email
// rather than by role.
export const OWNER_EMAILS = new Set([
  'breinking@pierfoundations.com',
  'jreinking@pierfoundations.com',
  'dfranke@pierfoundations.com',
]);

// pfpeter is a special address: it can be REMOVED from a list via the UI but
// CANNOT be re-added (it is a test/monitoring address, not a PF domain address).
export const AGENT_EMAIL = 'pfpeter@agentmail.to';

// E-mail format validation: used by both the API and tests.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only @pierfoundations.com addresses may be added via the UI,
// EXCEPT the special agent address may remain once seeded.
const PF_DOMAIN = '@pierfoundations.com';

export function validateEmail(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'Email is required.' };
  const em = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(em))  return { ok: false, error: 'Invalid email format.' };
  if (!em.endsWith(PF_DOMAIN)) {
    return { ok: false, error: 'Only @pierfoundations.com addresses may be added.' };
  }
  return { ok: true, email: em };
}

// ---- D1 read ----------------------------------------------------------------

/**
 * Resolve the current recipients for `listKey` from D1.
 * Returns { recipients: string[], warning: string|null }.
 *   warning is non-null if D1 was unreachable or the list was empty.
 *   In either case, recipients is [].
 * The caller must NOT fall back to any hardcoded list.
 */
export async function resolveMailingList(db, listKey) {
  if (!db) {
    return {
      recipients: [],
      warning: 'Email not sent: mailing list database unavailable. ' +
        'The record and PDF were saved. Please notify your supervisor.',
    };
  }
  try {
    const { results } = await db
      .prepare('SELECT email FROM mailing_lists WHERE list_key = ? ORDER BY id ASC')
      .bind(listKey)
      .all();
    const recipients = (results || []).map((r) => String(r.email).trim().toLowerCase())
      .filter((e) => EMAIL_RE.test(e));
    if (recipients.length === 0) {
      return {
        recipients: [],
        warning: 'Email not sent: the mailing list for this form is empty. ' +
          'An owner can add recipients via Settings > Mailing Lists. ' +
          'The record and PDF were saved.',
      };
    }
    return { recipients, warning: null };
  } catch (e) {
    console.error('[mailing-lists] D1 read failed:', e && e.message);
    return {
      recipients: [],
      warning: 'Email not sent: mailing list lookup failed. ' +
        'The record and PDF were saved. Please notify your supervisor.',
    };
  }
}

/**
 * Resolve the mailing list, then look up display names from the users table.
 * Returns { recipients: [{name, email}][], warning: string|null }.
 *   warning is non-null if D1 was unreachable or the list was empty.
 *   name is the users.name for that email, or the email itself if not found.
 * Never used for sending — callers extract .email when passing to email helpers.
 */
export async function resolveMailingListWithNames(db, listKey) {
  const { recipients: emails, warning } = await resolveMailingList(db, listKey);
  if (warning || !emails.length) {
    return { recipients: [], warning };
  }
  // Look up display names from the users table (best-effort; any error → fall back).
  try {
    const placeholders = emails.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT email, name FROM users WHERE lower(email) IN (${placeholders})`)
      .bind(...emails)
      .all();
    const nameMap = Object.create(null);
    for (const row of (results || [])) {
      nameMap[String(row.email).toLowerCase()] = row.name;
    }
    return {
      recipients: emails.map((email) => ({
        name: nameMap[email.toLowerCase()] || email,
        email,
      })),
      warning: null,
    };
  } catch {
    // Name lookup failure: fall back to email as display name.
    return {
      recipients: emails.map((email) => ({ name: email, email })),
      warning: null,
    };
  }
}

// ---- D1 write helpers -------------------------------------------------------

/**
 * Add an email to a mailing list.
 * Returns { ok: true } or throws.
 * Caller must have already validated the email and checked owner access.
 */
export async function addToMailingList(db, listKey, email, addedBy) {
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        'INSERT INTO mailing_lists (list_key, email, added_by, added_at) ' +
        'VALUES (?, ?, ?, ?)'
      )
      .bind(listKey, email, addedBy, now)
      .run();
    return { ok: true };
  } catch (e) {
    // UNIQUE constraint violation
    if (e && e.message && e.message.includes('UNIQUE')) {
      return { ok: false, error: 'That address is already on this list.' };
    }
    throw e;
  }
}

/**
 * Remove an email from a mailing list.
 * Returns { ok: true, removed: boolean }.
 */
export async function removeFromMailingList(db, listKey, email) {
  const result = await db
    .prepare('DELETE FROM mailing_lists WHERE list_key = ? AND email = ?')
    .bind(listKey, email)
    .run();
  return { ok: true, removed: (result.meta && result.meta.changes > 0) };
}

/**
 * Return all lists as { [listKey]: [{ email, display_name, added_by, added_at }] }.
 */
export async function getAllMailingLists(db) {
  const { results } = await db
    .prepare(
      'SELECT list_key, email, display_name, added_by, added_at ' +
      'FROM mailing_lists ORDER BY list_key, id ASC'
    )
    .all();
  const out = {};
  for (const key of VALID_LIST_KEYS) out[key] = [];
  for (const row of (results || [])) {
    if (out[row.list_key]) out[row.list_key].push(row);
  }
  return out;
}
