// Cloudflare Pages Function -- /api/field-companion
// ===========================================================================
// FIELD-OPS SMART SEARCH BROKER (Stage 1 -- INERT until stage 2)
// ===========================================================================
// The server-side broker behind Pier Foundations' field-crew smart-search box.
// The crew types a plain-language question ("what stone is approved for 26-002?")
// and this endpoint forwards it to Peter's LOCAL Hermes instance (MiniMax-M2.7),
// which parses + phrases the answer from field-safe records. It returns the
// answer to the browser. The AI PHRASES; it never produces a fact from thin air
// -- and this broker NEVER fabricates: on any failure it fails CLOSED with an
// honest error + an empty result.
//
// SECURITY MODEL (why the browser never holds a secret):
//   crew browser
//     -> POST /api/field-companion   (same-origin; pf_session cookie + RBAC)
//     -> [this function, server-side] fetch PF_FIELD_HERMES_URL
//          with Authorization: Bearer <PF_FIELD_HERMES_SECRET>
//          + X-PF-Timestamp + X-PF-Signature = hex(HMAC_SHA256(secret, ts + "." + body))
//     -> Hermes answers -> we return { answer, ... } to the browser.
//   The shared secret lives ONLY in the CF env (PF_FIELD_HERMES_SECRET). It is
//   NEVER sent to, or reachable by, the browser.
//
// RBAC: field_ops area. This is the CREW's operational tool -- NOT financial.
//   requireArea(session, 'field_ops') => admin/partner/business_dev/field_ops.
//   The middleware already 401s a session-less request; this is defense-in-depth.
//
// FAIL-CLOSED CONTRACT (load-bearing):
//   - PF_FIELD_HERMES_URL unset (the stage-1 state) => 503 honest error, empty
//     result, NO crash, NO fabricated answer.
//   - Hermes unreachable / non-2xx / bad-shaped body / timeout => 502/504 honest
//     error, empty result. We NEVER invent an answer to look helpful.
//   An honest "the assistant is unavailable" beats a convincing fiction. A wrong
//   answer in the field is worse than "I don't have that".
//
// STAGE 1 STATE: PF_FIELD_HERMES_URL / PF_FIELD_HERMES_SECRET are UNSET, so this
// endpoint is inert -- every call fails closed with a 503. It is committed so the
// wiring is reviewable, but it does nothing live until stage 2 sets the env +
// stands up the tunnel. See field-ops-hermes-STAGE1.md.

import { requireArea } from '../lib/auth.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

// Field-crew questions are short. Cap the inbound body hard.
const MAX_BODY_BYTES = 4 * 1024;
const MAX_QUERY_LEN = 1000;

// Hermes can take a while to think; bound it so the crew never hangs.
const HERMES_TIMEOUT_MS = 90 * 1000;

// Reject a signature/timestamp older than this (replay-window). Mirrors the
// True Bearing handshake design (see memory: phase2-field-companion).
const MAX_SKEW_MS = 5 * 60 * 1000; // 300s

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Honest fail-closed envelope. `answer` is ALWAYS empty on failure -- the caller
// must never render a fabricated answer. `ok:false` + `answer:''` is the signal.
function failClosed(message, status) {
  return json({
    ok: false,
    answer: '',
    sources: [],
    contains_financials: false,
    error: message,
  }, status);
}

function s(v, cap) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, ''); // strip angle brackets (UI also escapes)
}

// hex(HMAC-SHA256(secret, message)) -- Web Crypto only, no libraries. Same
// primitive the session signer uses in _middleware.js / lib/auth.js.
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ---- RBAC: field crew (+ office). NOT financial. --------------------------
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;

  // ---- Parse + validate the crew's question ---------------------------------
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return failClosed('Question too long.', 413);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    return failClosed('Invalid request.', 400);
  }
  const query = s(parsed && parsed.query, MAX_QUERY_LEN).trim();
  if (!query) {
    return failClosed('Please enter a question.', 400);
  }
  // Optional non-sensitive hint (e.g. a project number the crew is on).
  const projectHint = s(parsed && parsed.project_hint, 120).trim();

  // ---- FAIL CLOSED if the backend is not configured (the stage-1 state) ------
  // PF_FIELD_HERMES_URL is UNSET until stage 2 stands up the tunnel. When unset
  // we return an honest "unavailable" -- NEVER a fabricated answer.
  const hermesUrl = env && env.PF_FIELD_HERMES_URL && String(env.PF_FIELD_HERMES_URL).trim();
  const hermesSecret = env && env.PF_FIELD_HERMES_SECRET && String(env.PF_FIELD_HERMES_SECRET).trim();
  if (!hermesUrl || !hermesSecret) {
    return failClosed(
      'The field assistant is not available yet. No answer was generated.',
      503,
    );
  }

  // ---- Build the signed, authenticated request to Hermes --------------------
  // Field-safe request contract (matches the design in memory phase2-field-companion):
  //   { question, role:"field_ops", project_hint, context_scope:"field_safe" }
  const outboundBody = JSON.stringify({
    question: query,
    role: 'field_ops',
    project_hint: projectHint || undefined,
    context_scope: 'field_safe',
  });
  const ts = String(Date.now());
  let signature;
  try {
    signature = await hmacHex(hermesSecret, ts + '.' + outboundBody);
  } catch {
    // If we cannot sign, we cannot authenticate -- fail closed, never send raw.
    return failClosed('The field assistant is temporarily unavailable.', 500);
  }

  // ---- Call Hermes, timeboxed, fail closed on ANY problem -------------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HERMES_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(hermesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + hermesSecret,
        'X-PF-Timestamp': ts,
        'X-PF-Signature': signature,
      },
      body: outboundBody,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // Abort (timeout) vs connection error -- either way, honest + empty.
    const isAbort = err && err.name === 'AbortError';
    return failClosed(
      isAbort
        ? 'The field assistant took too long to respond. No answer was generated.'
        : 'The field assistant is temporarily unreachable. No answer was generated.',
      isAbort ? 504 : 502,
    );
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    return failClosed('The field assistant returned an error. No answer was generated.', 502);
  }

  // ---- Parse Hermes' response; fail closed on a bad shape -------------------
  let data;
  try {
    data = await upstream.json();
  } catch {
    return failClosed('The field assistant returned an unreadable response.', 502);
  }

  // Expected response contract:
  //   { answer, confidence?, sources?, contains_financials?:false }
  const answer = data && typeof data.answer === 'string' ? data.answer : '';
  if (!answer.trim()) {
    // No answer text => treat as "I don't have that", NOT a fabricated fill-in.
    return json({
      ok: true,
      answer: '',
      sources: Array.isArray(data && data.sources) ? data.sources : [],
      contains_financials: false,
      note: 'No matching field record was found.',
    }, 200);
  }

  // Defense-in-depth: this surface is field-safe by architecture (money is
  // stripped at ingest). If the backend ever flags financial content, DO NOT
  // relay it to the crew -- fail closed instead.
  if (data && data.contains_financials === true) {
    return failClosed('That request cannot be answered from the field tool.', 403);
  }

  return json({
    ok: true,
    answer,
    confidence: (data && data.confidence) || null,
    sources: Array.isArray(data && data.sources) ? data.sources : [],
    contains_financials: false,
  }, 200);
}

// Only POST is supported. A GET (e.g. someone hitting the URL directly) fails
// closed with a clear message rather than doing anything.
export async function onRequestGet(context) {
  const session = context.data && context.data.session;
  const denied = requireArea(session, 'field_ops');
  if (denied) return denied;
  return failClosed('Use POST with a { query } body.', 405);
}
