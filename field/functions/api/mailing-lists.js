// Cloudflare Pages Function -- /api/mailing-lists
// Owner-only endpoint for managing per-form email recipient lists.
//
// WHO MAY ACCESS:
//   Only Brad Reinking (breinking@), Jonathan Reinking (jreinking@), and
//   Derek Franke (dfranke@) may call any method.  Access is enforced
//   SERVER-SIDE via an explicit email allowlist (OWNER_EMAILS) checked on
//   every request.  No role in the D1 users table is held by exactly those
//   three users, so role-based gating cannot be used.
//
//   The areaForPath gate in auth.js assigns this path to 'field_ops' so the
//   middleware passes authenticated requests through; the owner check here is
//   the real gate.  Unauthenticated requests are blocked by the middleware
//   (401) before this handler runs.
//
// ROUTES:
//   GET  /api/mailing-lists          -- return all lists
//   POST /api/mailing-lists          -- add an email  { listKey, email }
//   DELETE /api/mailing-lists        -- remove an email { listKey, email }
//
// VALIDATION:
//   - email must be @pierfoundations.com
//   - pfpeter@agentmail.to may NOT be re-added via the UI (only via SQL seed)
//   - No duplicates (UNIQUE constraint in D1)
//   - list_key must be one of the 5 valid keys
//
// AUDIT:
//   Every add and remove is written to the audit_log table.
//
// SECURITY:
//   - Owner check on EVERY method (GET, POST, DELETE).
//   - D1 failures return 503 (fail-closed).
//   - listKey validated against VALID_LIST_KEYS before any D1 call.
//   - email normalised to lowercase before store or comparison.

import { requireArea } from '../lib/auth.js';
import {
  OWNER_EMAILS, VALID_LIST_KEYS, AGENT_EMAIL,
  validateEmail, getAllMailingLists, addToMailingList, removeFromMailingList,
} from '../lib/mailing-lists.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function jsonErr(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

// ---------------------------------------------------------------------------
// Owner check: look up the requesting user's email in D1 users table by uid.
// Returns the email string (lowercase) or null if not found / DB unavailable.
// ---------------------------------------------------------------------------
async function getCallerEmail(db, session) {
  if (!db || !session || !session.uid) return null;
  try {
    const row = await db
      .prepare('SELECT email FROM users WHERE id = ?')
      .bind(session.uid)
      .first();
    return row ? String(row.email).trim().toLowerCase() : null;
  } catch (e) {
    console.error('[mailing-lists] email lookup failed:', e && e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Write an audit row.
// ---------------------------------------------------------------------------
async function writeAudit(db, session, action, detail) {
  if (!db) return;
  try {
    await db
      .prepare(
        'INSERT INTO audit_log (user_id, action, detail, ts) VALUES (?, ?, ?, ?)'
      )
      .bind(session.uid || null, action, detail, new Date().toISOString())
      .run();
  } catch (e) {
    // Audit failure must NOT block the main operation.
    console.error('[mailing-lists] audit write failed:', e && e.message);
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
async function handle(context) {
  const { request, env } = context;

  // Auth gate: middleware already verified session.
  // requireArea returns a 403 Response if the role lacks field_ops access.
  const areaErr = requireArea(context.data && context.data.session, 'field_ops');
  if (areaErr) return areaErr;

  const session = context.data.session;

  // Owner gate: check the caller's email against the allowlist.
  if (!env.DB) return jsonErr('Database unavailable.', 503);

  const callerEmail = await getCallerEmail(env.DB, session);
  if (!callerEmail || !OWNER_EMAILS.has(callerEmail)) {
    return jsonErr('You do not have access to this feature.', 403);
  }

  const method = request.method.toUpperCase();

  // ---- GET: return all lists -----------------------------------------------
  if (method === 'GET') {
    try {
      const lists = await getAllMailingLists(env.DB);
      return json({ ok: true, lists });
    } catch (e) {
      console.error('[mailing-lists] GET failed:', e && e.message);
      return jsonErr('Database error.', 503);
    }
  }

  // ---- POST: add an email to a list ----------------------------------------
  if (method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonErr('Invalid JSON body.');
    }

    const listKey = body && typeof body.listKey === 'string' ? body.listKey.trim() : '';
    if (!VALID_LIST_KEYS.has(listKey)) {
      return jsonErr('Invalid list key. Must be one of: ' + [...VALID_LIST_KEYS].join(', ') + '.');
    }

    const emailRaw = body && typeof body.email === 'string' ? body.email.trim() : '';
    const validation = validateEmail(emailRaw);
    if (!validation.ok) return jsonErr(validation.error);

    const email = validation.email; // already lowercased by validateEmail

    // The agent address may not be re-added via the UI.
    if (email === AGENT_EMAIL) {
      return jsonErr(
        'pfpeter@agentmail.to is a monitoring address and cannot be re-added via the UI. ' +
        'Contact the system administrator.'
      );
    }

    let result;
    try {
      result = await addToMailingList(env.DB, listKey, email, session.uid);
    } catch (e) {
      console.error('[mailing-lists] add failed:', e && e.message);
      return jsonErr('Database error adding address.', 503);
    }

    if (!result.ok) return jsonErr(result.error);

    await writeAudit(
      env.DB, session,
      'mailing_list_add',
      `list=${listKey} email=${email} by=${callerEmail}`
    );

    return json({ ok: true, listKey, email });
  }

  // ---- DELETE: remove an email from a list ----------------------------------
  if (method === 'DELETE') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonErr('Invalid JSON body.');
    }

    const listKey = body && typeof body.listKey === 'string' ? body.listKey.trim() : '';
    if (!VALID_LIST_KEYS.has(listKey)) {
      return jsonErr('Invalid list key.');
    }

    const emailRaw = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!emailRaw) return jsonErr('Email is required.');

    let result;
    try {
      result = await removeFromMailingList(env.DB, listKey, emailRaw);
    } catch (e) {
      console.error('[mailing-lists] remove failed:', e && e.message);
      return jsonErr('Database error removing address.', 503);
    }

    await writeAudit(
      env.DB, session,
      'mailing_list_remove',
      `list=${listKey} email=${emailRaw} by=${callerEmail} removed=${result.removed}`
    );

    return json({ ok: true, listKey, email: emailRaw, removed: result.removed });
  }

  return jsonErr('Method not allowed.', 405);
}

export const onRequest = handle;
export const onRequestGet    = handle;
export const onRequestPost   = handle;
export const onRequestDelete = handle;
