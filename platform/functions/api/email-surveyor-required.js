// Cloudflare Pages Function -- /api/email-surveyor-required
// STAKING & LAYOUT "required info" email (Brad 2026-09-03).
//
// The Project Management > Site Readiness > "3. Staking & Layout" subsection carries a
// document-tracking checklist. When PF is responsible for staking (the "Staking & Layout
// PF's responsibility?" toggle = Yes), PF sends a set of documents to the SURVEYOR; when
// the GC is responsible (toggle = No), PF sends ONE document (Approved AP Shop Dwgs CAD)
// to the GC. This endpoint sends ONE email to the selected recipient(s) listing the
// required item(s) and their file links. It reuses the SAME Graph app-only sendMail path
// as /api/submittal-reminder + /api/daily-report (send AS peter@pierfoundations.com),
// plain text, NO attachment.
//
// SAFETY (the recipient is an EXTERNAL surveyor or GC):
//   - Office-gated: requireArea(session, 'financials') = admin/partner/business_dev.
//     field_ops is BLOCKED (areaForPath maps this path -> 'financials'; this handler
//     re-checks). A read-only role can never send.
//   - The CLIENT gates the button behind a CONFIRM step (shows WHO + WHICH items before
//     sending). This endpoint is the send action; it NEVER auto-fires -- only on an
//     explicit user POST. There is NO scheduled/daemon caller.
//   - Recipient addresses are VALIDATED (basic email shape); the body is built SERVER-SIDE
//     from a fixed template. The client supplies only data (project #, name, recipients,
//     item names + dates + links), all length-capped + angle-bracket stripped. NO HTML.
//     File links are validated to http(s) only (a bad/relative link is dropped, not sent
//     as a clickable) so the email never carries an attacker-supplied scheme.
//   - FAIL CLOSED: if Graph is not configured, returns 503 and sends nothing (never a
//     fake "sent"). A Graph auth failure -> 502; a send failure -> 502.
//   - CC: a copy always goes to peter@ (the sending mailbox) so the office has a record.
//
// BODY: {
//   num, projectName, recipientRole: 'surveyor'|'gc',
//   recipients: [ { name, email }, ... ],
//   items: [ { name, dateSent, link }, ... ]
// }
// RETURNS: { ok:true, sent:true, to, items } on success.

import { requireArea } from '../lib/auth.js';
import { graphConfigured, getGraphToken, GRAPH } from '../lib/graph.js';

const MAIL_FROM = 'peter@pierfoundations.com';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_LABEL = 200;
const MAX_LINK = 1000;
const MAX_DATE = 40;
const MAX_ITEMS = 12;
const MAX_RECIPS = 20;

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
// A file link is only included if it is an absolute http(s) URL (after strip). Anything
// else (relative path, javascript:, data:, blank) is dropped -> the item still lists but
// with "(no link provided)". Never emit an attacker-controlled scheme.
function cleanLink(v) {
  const str = s(v, MAX_LINK);
  if (!str) return '';
  return /^https?:\/\/\S+$/i.test(str) ? str : '';
}

// Build the plain-text required-info body server-side from a FIXED template. All values
// already sanitized by the caller. NO HTML; links appear as plain (safe) http(s) URLs.
function buildBody({ projectName, projectNum, role, items }) {
  const lines = [];
  const proj = [projectNum, projectName].filter(Boolean).join(' - ') || 'the project';
  const who = role === 'gc' ? 'the General Contractor' : 'our surveyor';
  lines.push('Hello,');
  lines.push('');
  lines.push(`Pier Foundations is sending the following document(s) for ${proj} for staking & layout. Please find the file link(s) below:`);
  lines.push('');
  for (const it of items) {
    lines.push(`  - ${it.name}`);
    if (it.dateSent) lines.push(`      Date sent: ${it.dateSent}`);
    lines.push(`      File: ${it.link ? it.link : '(no link provided — will follow up)'}`);
  }
  lines.push('');
  lines.push('Please confirm receipt and let us know if anything is missing or unreadable so we can re-send.');
  lines.push('');
  lines.push('Thank you,');
  lines.push('Pier Foundations');
  lines.push('');
  lines.push('This message was sent on behalf of the Pier Foundations project team.');
  return lines.join('\n');
}

async function sendEmail(token, { toList, subject, bodyText }) {
  const message = {
    subject,
    body: { contentType: 'Text', content: bodyText },
    toRecipients: toList.map((a) => ({ emailAddress: { address: a } })),
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
    const role = (parsed && parsed.recipientRole === 'gc') ? 'gc' : 'surveyor';

    // Recipients: validate + dedupe email addresses (a name is optional).
    const recipsIn = Array.isArray(parsed && parsed.recipients) ? parsed.recipients : [];
    const toSet = [];
    const seen = {};
    for (const r of recipsIn.slice(0, MAX_RECIPS)) {
      const em = s(r && r.email, MAX_EMAIL).toLowerCase();
      if (!em || !EMAIL_RE.test(em)) continue;
      if (seen[em]) continue;
      seen[em] = true;
      toSet.push(em);
    }
    if (!toSet.length) {
      return json({ status: 'error',
        message: 'A valid recipient email is required. Select a contact (with an email) first.' }, 400);
    }

    // Items: name required; date + link optional (link validated http(s) or dropped).
    const itemsIn = Array.isArray(parsed && parsed.items) ? parsed.items : [];
    const items = [];
    for (const raw of itemsIn.slice(0, MAX_ITEMS)) {
      const name = s(raw && raw.name, MAX_LABEL);
      if (!name) continue;
      items.push({
        name,
        dateSent: s(raw && raw.dateSent, MAX_DATE),
        link: cleanLink(raw && raw.link),
      });
    }
    if (!items.length) {
      return json({ status: 'error', message: 'At least one item is required to send.' }, 400);
    }

    // FAIL CLOSED: no Graph config -> we cannot send. Do NOT report success.
    if (!graphConfigured(env)) {
      return json({ status: 'error',
        message: 'Email is not configured on this deployment (Graph credentials missing). Nothing was sent.' }, 503);
    }

    const proj = [num, projectName].filter(Boolean).join(' - ');
    const subject = role === 'gc'
      ? `Staking & layout document for ${proj}`
      : `Staking & layout documents for ${proj}`;
    const bodyText = buildBody({ projectName, projectNum: num, role, items });

    let token;
    try { token = await getGraphToken(env); }
    catch (e) {
      return json({ status: 'error', message: 'Could not authenticate to email service. Nothing was sent.' }, 502);
    }
    try {
      await sendEmail(token, { toList: toSet, subject, bodyText });
    } catch (e) {
      return json({ status: 'error', message: 'The email service rejected the message. It was NOT sent - please retry.' }, 502);
    }

    return json({ ok: true, sent: true, to: toSet.join(', '), items: items.length });
  } catch (err) {
    console.error('api/email-surveyor-required POST error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}
