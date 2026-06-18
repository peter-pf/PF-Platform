// Cloudflare Pages Function -- /api/schedule
// Persistence layer for the crew scheduler. This is the SOURCE OF TRUTH for the
// schedule once seeded: the front-end GETs state on load and PUTs it on save.
//
// SECURITY MODEL (for the COO security review):
//  - This endpoint is ALREADY behind the server-side auth gate in
//    functions/_middleware.js. Every request -- GET, PUT, POST -- must carry a
//    valid signed pf_auth_token cookie (or Basic Auth). External/unauthenticated
//    callers are rejected with 401 before they ever reach this code. We do NOT
//    weaken or bypass that gate here.
//  - This is a WRITE endpoint, so it is defense-in-depth hardened:
//      * Payload size cap (MAX_BODY_BYTES) -- reject oversized bodies.
//      * Strict JSON parse in a try/catch -- malformed body -> 400, never crash.
//      * Schema validation + sanitization (validateState) -- we rebuild a clean
//        object field-by-field with type coercion and caps. We never persist
//        arbitrary client-supplied keys, and never store more than MAX_JOBS jobs
//        / MAX_MOBS mobilizations. This bounds storage and blast radius.
//      * NO eval, NO Function(), NO dynamic code. Data is data.
//      * Stored values are plain JSON. The front-end esc()-escapes every value
//        on render, so stored strings cannot become active markup (stored-XSS is
//        neutralized at the render layer; this endpoint also strips angle
//        brackets from free-text label/name fields as belt-and-suspenders).
//      * Responses are private, no-store (consistent with api/data.js).
//  - KV binding: env.PF_SCHEDULE (KV namespace). If the binding is missing
//    (e.g. a deploy before the binding propagates), we FALL BACK to read-only:
//    GET returns {seeded:false, fallback:true, state:null} so the front-end uses
//    its embedded seed, and PUT returns 503 with a clear message rather than
//    silently dropping the save. This makes a misconfigured deploy obvious.

const KV_KEY = 'schedule:state:v1';
const MAX_BODY_BYTES = 256 * 1024; // 256 KB cap -- the schedule is tiny; this is generous.
const MAX_JOBS = 500;
const MAX_MOBS = 40;
const MAX_STR = 200; // cap on any single string field

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- sanitizers -------------------------------------------------------------

function s(v) {
  // Coerce to a bounded string and strip angle brackets from free text so
  // stored values can never carry raw tags (front-end also escapes on render).
  if (v == null) return '';
  let str = String(v);
  if (str.length > MAX_STR) str = str.slice(0, MAX_STR);
  return str.replace(/[<>]/g, '');
}

function num(v, def = null) {
  if (v === '' || v == null) return def;
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

function bool(v) {
  return v === true || v === 'true' || v === 1;
}

// YYYY-MM-DD only, AND a real calendar date. Rejects impossible dates like
// 2026-13-99 by round-tripping through Date (M3). Returns null on any failure.
function dateStr(v) {
  if (v == null) return null;
  const str = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const dt = new Date(str + 'T00:00:00');
  if (Number.isNaN(dt.getTime())) return null;
  // Guard against JS Date roll-over (e.g. 2026-02-31 -> Mar 3): re-serialize and
  // compare so only true calendar dates survive.
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return (`${y}-${mo}-${da}` === str) ? str : null;
}

function sanitizeMob(m) {
  if (!m || typeof m !== 'object') return null;
  // C2: a stored mobilization is always >=1 working day, matching the modal's
  // Math.max(1,...) and the client's segments() ||1. Bar length, capacity and
  // KPI demand all read this same value -> no 0-vs-1 disagreement.
  return {
    start: dateStr(m.start),
    work_days: Math.max(1, Math.min(365, num(m.work_days, 1) | 0)),
    columns: Math.max(0, num(m.columns, 0) | 0),
    label: s(m.label),
    done: bool(m.done),
  };
}

function sanitizeJob(j) {
  if (!j || typeof j !== 'object') return null;
  let mobs = Array.isArray(j.mobilizations) ? j.mobilizations : [];
  mobs = mobs.slice(0, MAX_MOBS).map(sanitizeMob).filter(Boolean);
  return {
    id: s(j.id),
    number: s(j.number),
    name: s(j.name),
    crew: s(j.crew),
    bucket: s(j.bucket),
    status_raw: s(j.status_raw),
    city_state: s(j.city_state),
    gc_name: s(j.gc_name),
    lf: num(j.lf, null),
    columns: num(j.columns, null),
    feed: s(j.feed),
    value: num(j.value, null),
    mobilizations: mobs,
    done: bool(j.done),
  };
}

function sanitizeCrew(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    id: s(c.id),
    lead: s(c.lead),
    equipmentSet: s(c.equipmentSet),
    men: Math.max(0, Math.min(99, num(c.men, 4) | 0)),
    activeFrom: dateStr(c.activeFrom) || '2026-01-01',
    active: bool(c.active),
  };
}

// Rebuild a clean state object. Unknown top-level keys are dropped.
// `updatedStamp` is the meta.updated to write (caller controls it so the
// concurrency stamp is generated once and echoed back to the client).
function validateState(input, updatedStamp) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'State must be a JSON object.' };
  }
  const jobsIn = Array.isArray(input.jobs) ? input.jobs : null;
  if (!jobsIn) return { ok: false, error: 'State.jobs must be an array.' };
  if (jobsIn.length > MAX_JOBS) {
    return { ok: false, error: 'Too many jobs (max ' + MAX_JOBS + ').' };
  }
  const jobs = jobsIn.map(sanitizeJob).filter(Boolean);

  let crews = Array.isArray(input.crews) ? input.crews.map(sanitizeCrew).filter(Boolean) : [];
  if (crews.length > 20) crews = crews.slice(0, 20);

  const meta = (input.meta && typeof input.meta === 'object') ? input.meta : {};

  return {
    ok: true,
    state: {
      version: 1,
      jobs,
      crews,
      meta: {
        source: s(meta.source) || 'Edited in scheduler (KV source of truth)',
        work_week: s(meta.work_week) || 'Mon-Sat (Sunday off)',
        buckets: Array.isArray(meta.buckets) ? meta.buckets.slice(0, 20).map(b => ({
          id: s(b && b.id),
          label: s(b && b.label),
          awarded: bool(b && b.awarded),
        })) : [],
        // LOW-1 optimistic concurrency: meta.updated is the version stamp. The
        // client sends back the stamp it loaded (input.meta.updated). The write
        // handler compares it against KV's current stamp before overwriting.
        updated: updatedStamp,
      },
    },
  };
}

// Read the version stamp the client claims it loaded (for concurrency check).
function clientBaseVersion(input) {
  const meta = (input && input.meta && typeof input.meta === 'object') ? input.meta : {};
  return (typeof meta.updated === 'string') ? meta.updated : null;
}

// ---- handlers ---------------------------------------------------------------

// SEC-12: a stored schedule row persists per-job contract `value` ($) and
// `gc_name`. The crew (field_ops) needs the schedule (their assignments) but
// MUST NOT see job dollar values or GC names. This is the SERVER-SIDE boundary:
// on READ, strip those two fields from every job when the caller is a field_ops
// session. admin / partner (and the shared-auth admin fallback, whose role is
// 'admin') get the full state unchanged. Writes still PERSIST value/gc_name
// (sanitizeJob), so partner/admin edits round-trip — we only redact on read for
// field_ops. Fails CLOSED: if the role is unknown/missing we DROP the sensitive
// fields rather than leak them.
function stripScheduleForFieldOps(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.jobs)) return state;
  return {
    ...state,
    jobs: state.jobs.map((j) => {
      if (!j || typeof j !== 'object') return j;
      const { value, gc_name, ...safe } = j; // drop dollar value + GC name
      return safe;
    }),
  };
}

export async function onRequestGet(context) {
  const { env } = context;
  // Default-deny posture: anything that is NOT explicitly admin/partner is
  // treated as field_ops and gets the redacted view.
  const role = context.data && context.data.session ? context.data.session.role : null;
  const isPrivileged = role === 'admin' || role === 'partner';
  const view = (state) => (isPrivileged ? state : stripScheduleForFieldOps(state));
  try {
    if (!env.PF_SCHEDULE) {
      // Binding not present yet -> tell the client to use its embedded seed.
      return json({ seeded: false, fallback: true, state: null,
        note: 'KV binding PF_SCHEDULE not available; front-end uses embedded seed.' });
    }
    const raw = await env.PF_SCHEDULE.get(KV_KEY);
    if (!raw) {
      return json({ seeded: false, fallback: false, state: null });
    }
    let state;
    try { state = JSON.parse(raw); }
    catch { return json({ seeded: false, fallback: false, state: null,
      note: 'Stored state was unreadable; front-end falls back to seed.' }); }
    return json({ seeded: true, fallback: false, state: view(state) });
  } catch (err) {
    console.error('api/schedule GET error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

async function handleWrite(context) {
  const { request, env } = context;
  // SEC-12: same read-side redaction applies to anything we ECHO back from a
  // write (the 409 conflict body and the normalized save echo both carry the
  // full stored state, which includes value/gc_name). Privileged roles get the
  // full echo; everyone else (default-deny) gets the redacted view. Persistence
  // itself is unchanged — sanitizeJob still stores value/gc_name in KV.
  const role = context.data && context.data.session ? context.data.session.role : null;
  const isPrivileged = role === 'admin' || role === 'partner';
  const echo = (state) => (isPrivileged ? state : stripScheduleForFieldOps(state));
  // SEC-12 data-integrity: a field_ops session reads the schedule with value /
  // gc_name STRIPPED. If it were allowed to write that redacted state back, the
  // dollar values + GC names would be WIPED from KV (sanitizeJob would persist
  // null). The scheduler is admin/partner-edited; field_ops is READ-ONLY. Reject
  // writes from any non-privileged session, fail closed.
  if (!isPrivileged) {
    return json({ status: 'forbidden',
      message: 'You do not have permission to edit the schedule.' }, 403);
  }
  try {
    // Size cap: reject oversized bodies before parsing.
    const len = Number(request.headers.get('Content-Length') || '0');
    if (len > MAX_BODY_BYTES) {
      return json({ status: 'error', message: 'Payload too large.' }, 413);
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return json({ status: 'error', message: 'Payload too large.' }, 413);
    }

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return json({ status: 'error', message: 'Invalid JSON.' }, 400); }

    if (!env.PF_SCHEDULE) {
      // Fail loud, not silent: the caller must know the save did not persist.
      return json({ status: 'error',
        message: 'Persistence unavailable: KV binding PF_SCHEDULE is not configured on this deployment.' }, 503);
    }

    // LOW-1 optimistic concurrency: if KV already holds a state whose version
    // stamp is NEWER than what this client loaded, another editor saved in the
    // meantime. Reject with 409 so the client can reload instead of clobbering.
    const clientVersion = clientBaseVersion(parsed);
    const existingRaw = await env.PF_SCHEDULE.get(KV_KEY);
    if (existingRaw) {
      let existing = null;
      try { existing = JSON.parse(existingRaw); } catch { existing = null; }
      const currentVersion = existing && existing.meta ? existing.meta.updated : null;
      if (currentVersion && currentVersion !== clientVersion) {
        return json({ status: 'conflict',
          message: 'The schedule changed since you loaded it. Reload before saving.',
          currentVersion, yourVersion: clientVersion, state: echo(existing) }, 409);
      }
    }

    // Generate one stamp, validate+normalize with it, store, echo it back.
    const stamp = new Date().toISOString();
    const result = validateState(parsed, stamp);
    if (!result.ok) {
      return json({ status: 'error', message: result.error }, 400);
    }

    await env.PF_SCHEDULE.put(KV_KEY, JSON.stringify(result.state));
    // H1/M1: return the NORMALIZED state so the client re-applies exactly what
    // was stored (no UI/KV drift). updated == the new version stamp. SEC-12: the
    // echo is redacted for non-privileged callers (value/gc_name stripped).
    return json({ status: 'ok', saved: true, updated: stamp,
      jobs: result.state.jobs.length, state: echo(result.state) });
  } catch (err) {
    console.error('api/schedule write error:', err);
    return json({ status: 'error', message: 'An internal error occurred.' }, 500);
  }
}

export async function onRequestPut(context) {
  return handleWrite(context);
}

export async function onRequestPost(context) {
  return handleWrite(context);
}
