// Cloudflare Pages Function -- /api/submittal-reminder
// GC PREREQUISITES REMINDER EMAIL (Brad 2026-08-12).
//
// The Engineering & Design > PF Design Submittal subsection carries a "GC prerequisites"
// checklist: the items PF needs from the GC before starting the full Submittal Design.
// Each item has a responsible party (name + email) and a Date Received (filled = received).
// This endpoint sends ONE reminder email to a responsible party naming the project + the
// OUTSTANDING item(s) still needed. It reuses the SAME Graph app-only sendMail path the
// daily-report uses (send AS peter@pierfoundations.com), plain text, NO attachment.
//
// SAFETY (the critical part -- the responsible party is often an EXTERNAL GC):
//   - Office-gated: requireArea(session, 'financials') = admin/partner/business_dev.
//     field_ops is BLOCKED (areaForPath maps /api/submittal-reminder -> 'financials' and
//     this handler re-checks). A read-only role can never send.
//   - The CLIENT gates the button behind a CONFIRM step (shows WHO + WHICH items before
//     sending). This endpoint is the send action; it NEVER auto-fires -- it only runs on
//     an explicit user POST. There is NO scheduled/daemon caller.
//   - The recipient address is VALIDATED (basic email shape) and the email BODY is built
//     server-side from a fixed template; the client supplies only data (project #, name,
//     recipient, item labels), all length-capped + angle-bracket stripped. No HTML.
//   - FAIL CLOSED: if Graph is not configured, returns 503 and sends nothing (never a
//     fake "sent"). A Graph send failure returns 502.
//   - CC: a copy always goes to peter@ (the sending mailbox already saves to Sent) so the
//     office has a record; no other recipients are added.
//
// BODY: { num, projectName, recipientName, recipientEmail, items: ["<label>", ...] }
// RETURNS: { ok:true, sent:true, to } on success.

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken, GRAPH } from '../lib/graph.js';

// Send AS this mailbox (identical to the daily-report MAIL_FROM). The app-only token
// carries Mail.Send APPLICATION, so /users/{upn}/sendMail is permitted.
const MAIL_FROM = 'peter@pierfoundations.com';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_LABEL = 200;
const MAX_ITEMS = 40;

// A conservative email-shape check (not full RFC): one @, a dot in the domain, no spaces
// or angle brackets. Belt-and-suspenders with the s() strip below.
const EMAIL_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function s(v, cap) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '').trim();
}
function cleanNum(v) {
  const str = String(v == null ? '' : v).trim();
  if (!/^[A-Za-z0-9-]{1,20}$/.test(str)) return '';
  return str;
}

// Build the plain-text reminder body server-side from a FIXED template. Data values are
// already sanitized by the caller. NO HTML, NO links, no attachment.
function buildReminderBody({ projectName, projectNum, recipientName, items }) {
  const lines = [];
  const who = recipientName ? recipientName : 'there';
  lines.push(`Hi ${who},`);
  lines.push('');
  const proj = [projectNum, projectName].filter(Boolean).join(' - ') || 'the project';
  lines.push(`Pier Foundations needs the following item(s) from you for ${proj} before we can begin the full Submittal Design:`);
  lines.push('');
  for (const it of items) lines.push(`  - ${it}`);
  lines.push('');
  lines.push('Please send these at your earliest convenience so we can proceed. If you have already provided any of the above, let us know and we will update our records.');
  lines.push('');
  lines.push('Thank you,');
  lines.push('Pier Foundations');
  lines.push('');
  lines.push('This is an automated reminder sent on behalf of the Pier Foundations project team.');
  return lines.join('\n');
}

async function sendReminderEmail(token, { to, subject, bodyText }) {
  const message = {
    subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients: [{ emailAddress: { address: to } }],
    // Always CC the sending mailbox so the office keeps a copy in its inbox too
    // (saveToSentItems already stores it in Sent; this makes it visible up front).
    ccRecipients: [{ emailAddress: { address: MAIL_FROM } }],
  };
  const url = `${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (resp.status !== 202) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error('sendMail failed ' + resp.status + (detail ? ' ' + detail : ''));
  }
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'financials');   // office only; field_ops blocked
  if (denied) return denied;
  try {
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ status: 'error', message: 'Payload too large.' }, 413);

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    const num = cleanNum(parsed && parsed.num);
    if (!num) return json({ status: 'error', message: 'A valid project number is required.' }, 400);

    const projectName = s(parsed && parsed.projectName, MAX_NAME);
    const recipientName = s(parsed && parsed.recipientName, MAX_NAME);
    const recipientEmail = s(parsed && parsed.recipientEmail, MAX_EMAIL);
    if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
      return json({ status: 'error', message: 'A valid responsible-party email is required to send a reminder.' }, 400);
    }

    const itemsIn = Array.isArray(parsed && parsed.items) ? parsed.items : [];
    const items = [];
    for (const raw of itemsIn.slice(0, MAX_ITEMS)) {
      const lbl = s(raw, MAX_LABEL);
      if (lbl) items.push(lbl);
    }
    if (!items.length) {
      return json({ status: 'error', message: 'At least one outstanding item is required.' }, 400);
    }

    // FAIL CLOSED: no Graph config -> we cannot send. Do NOT report success.
    if (!graphConfigured(env)) {
      return json({ status: 'error',
        message: 'Email is not configured on this deployment (Graph credentials missing). No reminder was sent.' }, 503);
    }

    const proj = [num, projectName].filter(Boolean).join(' - ');
    const subject = `Action needed: submittal design items for ${proj}`;
    const bodyText = buildReminderBody({
      projectName, projectNum: num, recipientName, items,
    });

    let token;
    try { token = await getGraphToken(env); }
    catch (e) {
      return json({ status: 'error', message: 'Could not authenticate to email service. No reminder was sent.' }, 502);
    }
    try {
      await sendReminderEmail(token, { to: recipientEmail, subject, bodyText });
    } catch (e) {
      return json({ status: 'error', message: 'The email service rejected the reminder. It was NOT sent - please retry.' }, 502);
    }

    return json({ ok: true, sent: true, to: recipientEmail, items: items.length });
  } catch (err) {
    console.error('api/submittal-reminder POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
