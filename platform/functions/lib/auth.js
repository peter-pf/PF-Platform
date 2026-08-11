// Shared authentication / authorization helpers for the PF Platform.
// Web Crypto ONLY (crypto.subtle) — no external libraries. Runs in the
// Cloudflare Pages Functions (Workers) runtime.
//
// SECURITY MODEL (for the COO security review):
//  - Passwords are stored as PBKDF2-HMAC-SHA256 hashes with a per-user random
//    salt and a high iteration count (see PBKDF2_ITERATIONS). Plaintext is
//    NEVER stored, logged, or returned. Verification is constant-time.
//  - Sessions are STATELESS signed cookies (HMAC-SHA256 with PF_TOKEN_SECRET).
//    The cookie carries {uid, role, exp}; the signature is verified and
//    constant-time compared BEFORE the payload is trusted. This reuses the
//    exact signing pattern already proven in functions/_middleware.js, so the
//    new per-user sessions are interchangeable with the existing gate.
//  - Role checks are SERVER-SIDE. A field_ops session cannot reach financial /
//    contract / preconstruction endpoints even by typing the URL directly —
//    enforcement lives in the Functions, not the UI.
//  - Fails CLOSED: a missing secret / unreadable token -> denied, never
//    "allow by default".

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h working session
export const PBKDF2_ITERATIONS = 100000;           // Cloudflare Workers Web Crypto caps PBKDF2 at 100000
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_KEYLEN_BYTES = 32;                    // 256-bit derived key
const SALT_BYTES = 16;
export const SESSION_COOKIE = 'pf_session';        // new per-user session cookie

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------
export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Constant-time comparison of two strings. Avoids timing side-channels on both
// password hashes and HMAC signatures.
export function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// PBKDF2 password hashing
// ---------------------------------------------------------------------------

// Derive a PBKDF2 hash for `password` against a given salt (Uint8Array) and
// iteration count. Returns a base64url string of the derived key bytes.
async function pbkdf2(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    PBKDF2_KEYLEN_BYTES * 8
  );
  return b64urlEncode(new Uint8Array(bits));
}

// Hash a NEW password. Generates a fresh random salt and returns the salt +
// hash (both base64url) and the iteration count so the stored record is
// self-describing and verifiable later.
export async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt = b64urlEncode(saltBytes);
  const hash = await pbkdf2(password, saltBytes, PBKDF2_ITERATIONS);
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

// Verify a candidate password against a stored {salt, hash, iterations}.
// Constant-time. Returns boolean.
export async function verifyPassword(password, storedHash, storedSalt, iterations) {
  if (!storedHash || !storedSalt) return false;
  const iters = Number(iterations) || PBKDF2_ITERATIONS;
  let saltBytes;
  try { saltBytes = b64urlDecode(storedSalt); } catch { return false; }
  const candidate = await pbkdf2(password, saltBytes, iters);
  return timingSafeEqual(candidate, storedHash);
}

// ---------------------------------------------------------------------------
// Signed stateless session tokens (HMAC-SHA256)
// ---------------------------------------------------------------------------

async function hmac(payloadB64, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return b64urlEncode(new Uint8Array(sig));
}

// Mint a per-user session token: base64url(JSON{uid,role,name,mr,exp}).signature
// `mustReset` (mr) marks a RESTRICTED session: the user authenticated correctly
// but must change a temporary password. A restricted session may ONLY reach the
// password-reset endpoint/page (enforced in the middleware), never the portal.
export async function mintSession(
  { uid, role, name, mustReset }, secret, ttlMs = SESSION_TTL_MS
) {
  const claims = {
    uid,
    role,
    name: name || '',
    exp: Date.now() + ttlMs,
  };
  if (mustReset) claims.mr = 1; // restricted: reset-only
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

// Restricted sessions get a SHORTER TTL (just long enough to change a password).
export const RESET_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Is this a restricted (must_reset) session?
export function isRestrictedSession(session) {
  return !!(session && (session.mr === 1 || session.mr === true));
}

// Verify a session token. Returns the decoded session object {uid,role,name,exp}
// on success, or null on any failure (bad signature, expired, malformed).
// The signature is verified and constant-time compared BEFORE the payload is
// parsed/trusted.
export async function verifySession(token, secret) {
  try {
    if (!token || !secret) return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const expected = await hmac(payload, secret);
    if (!timingSafeEqual(sig, expected)) return null;

    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    if (!data.uid || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------
export function getCookie(cookieString, name) {
  const match = (cookieString || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : null;
}

export function sessionCookie(token, maxAgeSec) {
  const ttl = typeof maxAgeSec === 'number' ? maxAgeSec : Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Role-based access control (server-side)
// ---------------------------------------------------------------------------
//
// Roles (per docs/portal-rebuild/ARCHITECTURE-EDITABILITY.md, Access control):
//   admin        — Brad. Full access + user management.
//   partner      — Jonathan, Derek. Full view + edit their domains.
//   business_dev — BD staff. Sees PROJECT-level financials (per-job records,
//                  budget-vs-actual for a job, awarded-project contract values,
//                  the precon pipeline, BD's own tools) but NOT company-wide /
//                  global financials (cross-job revenue/AR rollups, company P&L,
//                  the global pricing master, sync-meta, global financial
//                  dashboards). Enforced SERVER-SIDE, even by direct URL.
//   field_ops    — field crew. ONLY Field Operations. NO financials / contracts /
//                  preconstruction, even by direct URL.
//
// We model access as a set of "areas" each role may touch, and tag sensitive
// API endpoints with a required area. The default-deny posture: an endpoint
// tagged with an area that the role does NOT hold returns 403.

export const ROLES = ['admin', 'partner', 'business_dev', 'field_ops', 'hr'];

// Area -> which roles may access it. Anything not listed defaults to admin-only.
//
// FINANCIAL VISIBILITY SPLIT (item E): the single old `financials` area is split
// into TWO tiers so business_dev can see PROJECT-level financials but never
// company-wide/global financials:
//   financials        = PROJECT-level financials (per-job records,
//                       budget-vs-actual for ONE job, awarded contract values).
//                       Allowed: admin, partner, business_dev.
//   financials_global = company-wide / global financials (cross-job revenue/AR
//                       rollups, company P&L, the global pricing master,
//                       sync-meta, company insurance, the estimating template).
//                       Allowed: admin, partner ONLY (business_dev + field_ops
//                       BLOCKED). This is the "fail-safe" bucket: when unsure,
//                       classify here.
const AREA_ROLES = {
  // Field crew areas — field_ops + partner + business_dev + admin
  field_ops:        ['admin', 'partner', 'business_dev', 'field_ops'],
  schedule:         ['admin', 'partner', 'business_dev', 'field_ops'], // crew schedule (operational)
  // PROJECT-level financials — admin + partner + business_dev (field_ops BLOCKED)
  financials:       ['admin', 'partner', 'business_dev'],
  // Company-wide / GLOBAL financials — partner + admin ONLY (BD + field_ops BLOCKED)
  financials_global:['admin', 'partner'],
  // Contracts + subcontracts — BD sees these (Brad 2026-06-23). admin + partner + business_dev.
  contracts:        ['admin', 'partner', 'business_dev'],
  // Preconstruction = the bid/opportunity pipeline — BD domain. BD + partner + admin.
  preconstruction:  ['admin', 'partner', 'business_dev'],
  // Estimating: the COMPANY estimating TEMPLATE is global (financials_global).
  // The estimating AREA (if any per-job estimating page is added) is BD-domain.
  estimating:       ['admin', 'partner', 'business_dev'],
  // BD's own tools/opportunity data — admin + partner + business_dev.
  business_dev:     ['admin', 'partner', 'business_dev'],
  documents:        ['admin', 'partner', 'business_dev'], // /api/doc proxy — BD needs it to view embedded contracts/subcontracts (Brad 2026-06-23)
  general:          ['admin', 'partner', 'business_dev', 'field_ops'], // non-sensitive shared data
  // HR module — TIGHT scope (Melanie confirmed): admin + the dedicated `hr`
  // role ONLY. Partners are NOT included. Employee records, onboarding, time
  // off, performance, and compliance are HR-confidential. Default-deny: any
  // role not listed here is blocked from the /hr/ area by direct URL too.
  hr:               ['admin', 'hr'],
  // CRM module (future) — admin + partner + business_dev. Agreed target scope
  // for the upcoming CRM area. Harmless to pre-declare: no /crm/ path is mapped
  // yet, so this only takes effect once the CRM module is wired. Default-deny
  // still applies to any role not listed.
  crm:              ['admin', 'partner', 'business_dev'],
  // Admin-only
  user_admin:       ['admin'],
  // Opportunity email-bridge (the external email daemon authenticates as admin):
  // GET ?pending=1 + POST {action:'mark-emailed'} are ADMIN ONLY. business_dev
  // is DENIED these (its create/update/decide actions use the business_dev area).
  opp_email_bridge: ['admin'],
  // BD quick-send bridge (a FUTURE send daemon authenticates as admin). GET
  // ?pending=1 + POST {action:'mark-sent'} are ADMIN ONLY. business_dev is
  // DENIED these (its template/queue actions use the business_dev area). NOTE:
  // sending is intentionally OFF for now; the platform only QUEUES a record.
  bd_send_bridge:   ['admin'],
  // Password-reset endpoint: reachable by ANY authenticated role (incl. a
  // restricted must_reset session). The restriction (ONLY this endpoint) is
  // enforced separately via the `restricted` session flag in the middleware,
  // not by role — a restricted session is blocked from every other area.
  reset:            ['admin', 'partner', 'business_dev', 'field_ops'],
};

// Does `role` have access to `area`? Unknown area => admin-only (fail closed).
export function roleCanAccess(role, area) {
  if (!ROLES.includes(role)) return false;
  const allowed = AREA_ROLES[area];
  if (!allowed) return role === 'admin'; // unknown/sensitive => admin only
  return allowed.includes(role);
}

// Guard helper for Functions. Returns null if allowed, or a 403 Response if not.
// Usage in an endpoint:
//   const denied = requireArea(context.data.session, 'financials');
//   if (denied) return denied;
export function requireArea(session, area) {
  if (!session || !roleCanAccess(session.role, area)) {
    return new Response(JSON.stringify({
      status: 'forbidden',
      message: 'You do not have access to this area.',
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }
  return null;
}

// Map a request pathname to the area it touches, so the middleware can gate
// BOTH static pages (*.html) and API routes — in ADDITION to per-endpoint
// requireArea() calls (defense-in-depth).
//
// POSTURE: DEFAULT-DENY. Anything not explicitly allow-listed below resolves to
// the admin-only `user_admin` area, so an unmapped/new path is BLOCKED for
// field_ops (and partner) until it is deliberately classified. This inverts the
// old fail-OPEN 'general' default that made the static surface security theater.
//
// Static asset directories (css/js/images/fonts/etc.) are non-sensitive and are
// allow-listed as 'general' so the field crew's pages can load their styling.
// The login/reset/public pages are handled by PUBLIC_PATHS / restricted sessions
// in the middleware and never reach a normal area check.

// Static asset path prefixes that are safe for everyone (styling/scripts/media).
//
// NOTE (SEC-09 fix): '/data/' is deliberately NOT in this list. The sensitive
// pages are client-side shells that pull their payload from /data/*.{js,json}
// (bid log, project history, pricing, budgets, contracts, GC financial
// contacts). Allow-listing the whole /data/ prefix here made the page-level
// RBAC security theater: a field_ops user could just GET /data/bid-log.json
// directly. /data/ files are now classified individually by DATA_FILE_AREAS
// below, default-deny.
const STATIC_ASSET_PREFIXES = [
  '/css/', '/js/', '/images/', '/img/', '/assets/', '/fonts/', '/icons/',
  '/media/', '/vendor/', '/static/', '/design-studio/',
];

// Static asset file extensions safe for everyone (no data leakage by themselves;
// the SENSITIVE data lives in the .html pages, the /api routes, and /data/*
// files — all classified below). This lets shared CSS/JS/img load on field_ops
// pages. NOTE: .js/.mjs/.json are EXCLUDED here so that /data/*.{js,json} cannot
// fall through to 'general' by extension; they MUST be classified by
// DATA_FILE_AREAS (default-deny). Real shared scripts live under /js/ /vendor/
// /assets/ /design-studio/ which are prefix-allow-listed above.
const STATIC_ASSET_EXT_RE =
  /\.(css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|txt|webmanifest)$/i;

// ---------------------------------------------------------------------------
// /data/ payload classification (SEC-09)
// ---------------------------------------------------------------------------
// The /data/ directory holds the ACTUAL sensitive payload that the client-side
// page shells load. Every file is classified by CONTENT here. DEFAULT-DENY:
// any /data/ file NOT explicitly listed as field-safe is treated as sensitive
// (admin/partner only). This is the hard server-side boundary — gating the
// .html shell does nothing because field_ops can fetch the data file directly.
//
// Field-safe files contain ONLY operational data with NO dollar amounts, bid /
// contract values, margins, pricing, budgets, wages, or financial contacts:
//   - production / progress (cols, LF, days, % complete — no $)
//   - crew schedule (crews, equipment, job sequence — no $)
//   - timesheets (employee hours, cost-CODE labels, per-diem night COUNTS — no
//     wages/rates/dollar amounts)
const DATA_FILE_AREAS = {
  // ---- FIELD-SAFE (field_ops + business_dev + partner + admin) ----
  '/data/production-data.js':        'field_ops', // cols/LF/days — no $
  '/data/progress-data.js':          'field_ops', // GUHMA % completion — no $
  '/data/timesheets.js':             'field_ops', // hours/cost-codes/names — no $ wages
  '/data/fo-projects-field.js':      'field_ops', // SEC-09 field-safe project list (no $/GC/contract)
  '/data/fo-detail-index.js':        'field_ops', // Field Ops smart-search detail index (vendors/contacts/materials/schedule/QAQC) — money-scrubbed, no $/contract/gc_name
  '/data/schedule-field.js':         'schedule',  // SEC-12 field-safe schedule derivative (no value/gc_name)

  // ---- PROJECT-LEVEL financials (admin/partner/business_dev — field_ops BLOCKED) ----
  // Item E: per-job financial records. BD needs these to work opportunities &
  // awarded projects. NOT company-wide rollups.
  '/data/project-records.js':      'financials',      // PROJECT: per-job $ values, cost
  '/data/project-record-poet.js':  'financials',      // PROJECT: per-job contract_value (POET)
  '/data/budget-actual-poet.js':   'financials',      // PROJECT: per-job budget/cost/invoice/profit
  '/data/cost-code-template.js':   'financials',      // PROJECT: standard cost-code template (ZEROED money) — seeds per-project Budget vs Actual; office only, field_ops BLOCKED
  '/data/awarded-projects.js':     'financials',      // PROJECT: awarded-project contract values + GC
  '/data/project-master.json':     'financials',      // PROJECT: per-job contract_value/margin/profit
  '/data/project-dashboard.js':    'financials',      // PROJECT: per-project tracked items (Financials section OMITTED) - admin/partner/business_dev, field_ops BLOCKED
  '/data/pm-overlay.js':           'financials',      // PROJECT: KV-mirror placeholder (PM overlay read via /api/pm-project) - reserved
  '/data/project-history.js':      'financials',      // PROJECT: per-job ContractValue/totalContractValue
  '/data/precon-pipeline.js':      'preconstruction', // PROJECT/BD: opportunity pipeline ($ per opp) — BD domain
  '/data/feasibility-history.js':  'preconstruction', // PROJECT/BD: completed feasibility studies (verdict/drivers), no $; precon analysis, field_ops BLOCKED
  '/data/project-master.js':       'preconstruction', // PROJECT/BD: PF Project Master (number/name/diameter/true award date) — no $; precon awarded surface
  '/data/precon-dashboard.js':     'preconstruction', // PROJECT/BD: precon PERIOD KPIs (invites/bids/awarded/win rate) — BD domain, field_ops BLOCKED
  '/data/precon-historical.js':    'preconstruction', // PROJECT/BD: historical win/loss bid log by year (read-only) — BD domain, field_ops BLOCKED
  '/data/bd-master.json':          'business_dev',    // BD: EIN/tax id/credit-app, GC contacts — BD's own tool
  '/data/bd-dashboard.js':         'business_dev',    // BD: BD PERIOD KPIs (interactions/companies contacted/totals) — BD's own tool, field_ops BLOCKED
  '/data/bd-records.js':           'business_dev',    // BD CRM base: companies + linked contacts (read-only base) — BD's own tool, field_ops BLOCKED
  '/data/opportunities.js':        'business_dev',    // BD CRM: opportunities base (read-only) — BD's own tool, field_ops BLOCKED
  '/data/gc-targets.js':           'business_dev',    // BD CRM: GC target accounts by sector (read-only) — BD's own tool, field_ops BLOCKED
  '/data/bd-templates.js':         'business_dev',    // BD CRM: email-template + doc-registry seed (read-only) — BD's own tool, field_ops BLOCKED

  // ---- HR DIRECTORY (admin + hr ONLY — everyone else BLOCKED) ----
  // Curated NON-SENSITIVE HR directory roster (name/title/dept/location/startDate/
  // status/workEmail/workPhone ONLY). Contains ZERO comp/tax/SSN/benefits/payment
  // data (those stay document-only in SharePoint). Gated to the `hr` area
  // (admin + hr role) as defense-in-depth: even a direct GET of the raw file is
  // denied to non-hr roles. The portal HR module reads this through /api/hr, not
  // the raw file, but this classification ensures the file itself never leaks.
  '/data/hr-roster.json':          'hr',              // HR directory: safe fields only, admin+hr

  // ---- COMPANY-WIDE / GLOBAL financials (admin/partner ONLY — BD + field_ops BLOCKED) ----
  // Item E: cross-job rollups, company P&L, the global pricing master, company
  // insurance, sync-meta, the company estimating template. BD must NOT see these.
  '/data/projects-data.js':        'financials_global', // GLOBAL: revenue/AR/paid-unpaid across ALL jobs
  '/data/live-data.js':            'financials_global', // GLOBAL: live mirror — bid/contract/cost across jobs
  '/data/pricing-data.js':         'financials_global', // GLOBAL: company pricing master
  '/data/sync-meta.json':          'financials_global', // GLOBAL: cross-job counts + sensitive source URLs
  '/data/pf-coi.js':               'financials_global', // GLOBAL: company insurance policy/broker detail
  '/data/insurance-baseline.js':   'financials_global', // GLOBAL: company policy limits/carriers
  '/data/estimate-template.json':  'financials_global', // GLOBAL: company estimating template (cost/amount basis)
  '/data/pf-dashboard.js':         'financials_global', // GLOBAL: company-wide monthly KPI/financial dashboard (income/expenses/margins/cash) — OWNERS ONLY
  // bid-log.json: BD domain (opportunities) BUT carries per-row margins + GC
  // financial contacts across ALL bids (company-wide bid economics). Classified
  // CONSERVATIVELY as financials_global (BD BLOCKED) per the spec — BD reaches
  // opportunities through precon-pipeline.js, which is the bucketed pipeline view.
  '/data/bid-log.json':            'financials', // BD sees the FULL bid log (Brad 2026-06-23); field_ops still BLOCKED

  // ---- SCHEDULE raw feeds (admin/partner ONLY — field_ops BLOCKED) ----
  // SEC-12: the raw schedule seed/state/data files each carry per-job contract
  // `value` ($) + `gc_name`. These are PROJECT-level financial data; BD legitimately
  // works projects, so they stay 'financials' (BD allowed, field_ops blocked).
  // The crew gets schedule-field.js (above), a $/GC-stripped derivative.
  '/data/schedule-seed.js':          'financials',      // PROJECT: per-job value + gc_name
  '/data/schedule-seed-state.json':  'financials',      // PROJECT: per-job value + gc_name
  '/data/schedule-data.js':          'financials',      // PROJECT: per-job value + gc_name
};

// Sensitive HTML pages -> their area. field_ops is BLOCKED from all of these.
// Anything that surfaces financials, contracts, pricing, or preconstruction.
const PAGE_AREAS = {
  '/project-history.html':   'financials',       // PROJECT: per-job contract values / awards — BD ok
  '/pricing.html':           'financials_global',// GLOBAL: company pricing master — BD blocked
  '/subcontracts.html':      'contracts',        // contracts — partner/admin only (BD blocked)
  '/quickbooks-guide.html':  'financials_global',// GLOBAL: company QB/accounting — BD blocked
  '/next-sprint.html':       'preconstruction',  // BD: precon/opportunity sprint planning — BD ok
  '/3-day-sprint.html':      'preconstruction',  // BD: precon/opportunity sprint planning — BD ok
  '/alpha-review.html':      'financials_global',// GLOBAL: internal company financial/ops review — BD blocked
  '/coo-checklist.html':     'financials_global',// GLOBAL: COO/company oversight — BD blocked
  '/peter-cheatsheet.html':  'financials_global',// GLOBAL: internal company cheatsheet — BD blocked
  '/sop-additions.html':            'preconstruction', // BD: precon SOPs — BD ok
  '/sop-additions-standalone.html': 'preconstruction', // BD: precon SOPs — BD ok
  '/manual.html':            'general',          // platform how-to (non-sensitive)
  '/onboarding.html':        'general',          // onboarding (non-sensitive)
  '/training.html':          'general',          // role training (non-sensitive)
  '/index.html':             'general',          // portal home/landing
  '/denied.html':            'general',          // access-denied notice (any auth user)
  '/reset-password.html':    'general',          // reset UI (restricted-session gated separately)
};

// HTML pages the FIELD CREW is explicitly allowed to reach (their operational
// surface). Everything here resolves to 'field_ops' or 'general'.
const FIELD_PAGES = {
  '/daily-production.html':  'field_ops',         // daily logs / production
  '/schedule.html':          'schedule',          // crew schedule (operational)
  // Field Companion (AI field-search) standalone page. field_ops area =
  // admin/partner/business_dev/field_ops so crew, BD, partners AND admins can
  // deep-link straight to the tool. WITHOUT this it fell to the default
  // 'user_admin' (admin-only) -> partners/crew were bounced to /denied.html and
  // never reached the tool (only admins like Brad worked, masking the gap).
  // The /api/field-companion endpoint is separately gated to field_ops + carries
  // the money firewall; this only governs loading the HTML shell.
  '/field-sample.html':      'field_ops',
  '/field-sample':           'field_ops',          // CF Pages clean-URL form (308 from .html)
  // NEW canonical filename for the tool (cache-bust: browsers that cached the old
  // /field-sample.html with the pre-echo-key polling never requested this URL, so
  // they cannot serve it from cache). Same field_ops gate. Old URLs kept working.
  '/field-companion.html':   'field_ops',
  '/field-companion':        'field_ops',          // CF Pages clean-URL form
};

// Filename keywords that mark a page as financial/contract/precon even if it is
// added later without an explicit entry above. Belt-and-suspenders so a NEW
// budget/financial page does not silently fall through to a permissive default.
const SENSITIVE_NAME_RE =
  /(budget|financ|pricing|cost|invoice|contract|subcontract|quickbook|estimat|precon|sprint|margin|profit|revenue|bid)/i;

export function areaForPath(pathname) {
  // ---- API routes (explicit classification) ----
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/doc'))           return 'documents';
    if (pathname.startsWith('/api/schedule'))      return 'schedule';
    // Field Companion (AI field-search): the crew-facing tool. field_ops area =
    // admin/partner/business_dev/field_ops so actual crew members (role field_ops)
    // can use it — WITHOUT this mapping the path fell through to DEFAULT-DENY
    // (admin-only), silently 403-blocking every crew member (admins like Brad still
    // worked, which masked the bug). The endpoint ALSO calls requireArea(session,
    // 'field_ops') on GET+POST and enforces the money firewall. ZERO financials.
    if (pathname.startsWith('/api/field-companion')) return 'field_ops';
    // Field daily reports: the FIRST field_ops WRITE surface. field_ops area =
    // admin/partner/business_dev/field_ops, so the crew can read+write their
    // daily reports. This area exposes ZERO financials. The approve / send-to-hr
    // transitions are further restricted to admin/partner IN the handler.
    if (pathname.startsWith('/api/daily-report'))  return 'field_ops';
    // Field reference lists (owned equipment / personnel / foremen + the FIXED
    // rental + maintenance categories) that the daily-report FORM pulls from.
    // field_ops area so the crew can READ the lists to fill the form; EDITING a
    // list (POST) is restricted to admin/partner IN the handler. ZERO financials
    // (names + categories only).
    if (pathname.startsWith('/api/field-lists'))   return 'field_ops';
    // LIVE timesheet roll-up derived from submitted daily reports (/api/timesheets).
    // Same readership as the daily reports it summarizes: field_ops area =
    // admin/partner/business_dev/field_ops. ZERO financials (HOURS only, no wages/$).
    // Read-only GET; the handler also calls requireArea(session,'field_ops').
    if (pathname.startsWith('/api/timesheets'))    return 'field_ops';
    // Field raw-file upload to SharePoint (Hand Logs / GUHM Data) attached to a
    // daily report. field_ops so the crew can upload; the handler also calls
    // requireArea(session, 'field_ops'). ZERO financials (files only). Without
    // this line the default-deny posture would block the crew (admin-only).
    if (pathname.startsWith('/api/field-upload'))  return 'field_ops';
    // Live, READ-ONLY gallery of a project's SharePoint "02 - Project Photos"
    // folder (jobsite pictures) for the office Active-Projects detail view.
    // field_ops area = admin/partner/business_dev/field_ops so the office AND the
    // crew can view project photos. The handler ALSO calls requireArea(session,
    // 'field_ops'). ZERO financials (jobsite images only). Read-only (no writes).
    // Without this line the default-deny posture would fall through to
    // 'user_admin' (admin-only) and the office (partner/BD) could not view photos.
    if (pathname.startsWith('/api/project-photos')) return 'field_ops';
    // Maintenance completion overlay for the compiled Maintenance checklist. Same
    // readership as the daily reports it overlays (field_ops area = admin/partner/
    // business_dev/field_ops). The handler also calls requireArea(session,
    // 'field_ops') on GET + POST. ZERO financials (a boolean + timestamp + name).
    if (pathname.startsWith('/api/maintenance-status')) return 'field_ops';
    // Manual maintenance items (add/remove) for the compiled Maintenance tab.
    // Same readership as the daily reports + the maintenance-status overlay they
    // join (field_ops area = admin/partner/business_dev/field_ops). The handler
    // also calls requireArea(session, 'field_ops') on GET + POST. category is
    // validated against the 5 fixed categories. ZERO financials (category + type
    // + free-text + optional equipment/subcategory only).
    if (pathname.startsWith('/api/maintenance-manual')) return 'field_ops';
    // Bid-resolution fork + Dead Set (item A): preconstruction action.
    // admin + partner + business_dev allowed; field_ops BLOCKED by direct URL.
    if (pathname.startsWith('/api/pipeline-state')) return 'preconstruction';
    // Per-bid precon activity log (notes/changes/comms/file refs). BD domain:
    // admin + partner + business_dev; field_ops BLOCKED by direct URL too. The
    // handler also calls requireArea(session, 'preconstruction').
    if (pathname.startsWith('/api/precon-log'))     return 'preconstruction';
    // Precon action items (date-based to-dos feeding the bid calendar). BD
    // domain: admin + partner + business_dev; field_ops BLOCKED by direct URL.
    // The handler also calls requireArea(session, 'preconstruction').
    if (pathname.startsWith('/api/precon-action'))  return 'preconstruction';
    // Per-bid precon boolean flags (today: sentToGarbin). BD domain: admin +
    // partner + business_dev; field_ops BLOCKED by direct URL too. The handler
    // also calls requireArea(session, 'preconstruction').
    if (pathname.startsWith('/api/precon-flag'))    return 'preconstruction';
    // Per-bid precon metadata overlay (Actively Pricing): date overrides + bidding
    // GCs list + awarded-GC index. BD domain: admin + partner + business_dev;
    // field_ops BLOCKED by direct URL too. Handler also calls requireArea.
    if (pathname.startsWith('/api/precon-bid-meta')) return 'preconstruction';
    // Manual bid intake (Actively Pricing): add/remove a manually-entered bid that
    // is not yet in the synced feed. BD domain: admin + partner + business_dev;
    // field_ops BLOCKED by direct URL too. Handler also calls requireArea.
    if (pathname.startsWith('/api/precon-manual-bid')) return 'preconstruction';
    // Award -> PM handoff (assign next project number, create PM project carrying
    // BD/precon history). A precon action: admin + partner + business_dev;
    // field_ops BLOCKED by direct URL. Handler also calls requireArea.
    if (pathname.startsWith('/api/pm-project'))     return 'preconstruction';
    // Per-project per-section MANUAL OVERRIDES for the office project-record view
    // (a user hand-enters/edits any field in any section; stored in KV, merged on
    // top of the synced record at render). PROJECT-level financials area:
    // admin + partner + business_dev (the office); field_ops BLOCKED by direct URL
    // too. The handler ALSO calls requireArea(session, 'financials') on GET+POST.
    // Same readership as the project record it overlays (project-records.js is
    // classified 'financials'). Without this line it would fall through to the
    // default 'user_admin' (admin-only) and the office (partner/BD) could not edit.
    if (pathname.startsWith('/api/project-override')) return 'financials';
    // Project lifecycle STATUS overrides for the office summary drag-and-drop
    // (Active -> Completed / Dead, and back). PROJECT-level financials area:
    // admin + partner + business_dev (the office); field_ops BLOCKED by direct
    // URL too. The handler ALSO calls requireArea(session, 'financials') on
    // GET + POST. Same overlay-on-synced-data pattern as /api/project-override.
    // Without this line it would fall through to the default 'user_admin'
    // (admin-only) and the office (partner/BD) could not read or move projects.
    if (pathname.startsWith('/api/project-status')) return 'financials';
    // Per-project Budget vs Actual budgets (Financials Phase 1): the office
    // hand-enters a per-cost-code BUDGET for a project; stored in KV, merged on
    // top of the ZEROED standard cost-code template at render. PROJECT-level
    // financials area: admin + partner + business_dev (the office); field_ops
    // BLOCKED by direct URL too. The handler ALSO calls requireArea(session,
    // 'financials') on GET + POST. Without this line it would fall through to the
    // default 'user_admin' (admin-only) and the office (partner/BD) could not save.
    if (pathname.startsWith('/api/project-budget')) return 'financials';
    // Per-project INVOICING record (Financials Phase 1b): the office enters a
    // subcontract value + ONE retainage % + a list of pay applications; stored in
    // KV, roll-ups computed client-side at render. PROJECT-level financials area:
    // admin + partner + business_dev (the office); field_ops BLOCKED by direct URL
    // too. The handler ALSO calls requireArea(session, 'financials') on GET + POST.
    // Without this line it would fall through to the default 'user_admin'
    // (admin-only) and the office (partner/BD) could not save.
    if (pathname.startsWith('/api/project-invoicing')) return 'financials';
    // Per-(job, group, cost_code) INVOICE LEDGER for the Budget-vs-Actual Actual
    // drill-down: the list of invoices coded to a cost code + PDF links. FINANCIAL
    // data -> financials area (admin + partner + business_dev; field_ops BLOCKED by
    // direct URL too). The handler ALSO calls requireArea(session, 'financials').
    if (pathname.startsWith('/api/invoice-ledger')) return 'financials';
    // BD CRM write-back (companies/contacts overlay + interactions log). BD's
    // own tool: admin + partner + business_dev allowed; field_ops BLOCKED by
    // direct URL too. Each endpoint ALSO calls requireArea('business_dev').
    if (pathname.startsWith('/api/bd-interaction')) return 'business_dev';
    if (pathname.startsWith('/api/bd-record'))      return 'business_dev';
    // Master contact directory (read + write-back to PF Master Contact List.xlsx).
    // The portal's contact typeahead + "save to directory" surface. CRM area =
    // admin + partner + business_dev; field_ops BLOCKED by direct URL too. The
    // handler ALSO calls requireArea(session, 'crm') on GET + POST. It carries NO
    // financials (names / titles / companies / phones / emails only). Without this
    // line it would fall through to the default 'user_admin' (admin-only) and the
    // office (partner/BD) could not read or save contacts.
    if (pathname.startsWith('/api/contacts'))       return 'crm';
    // Opportunities: the MIDDLEWARE gates the path at business_dev (admin +
    // partner + business_dev pass; field_ops BLOCKED). The admin-only email
    // bridge actions (GET ?pending=1, POST mark-emailed) are enforced IN the
    // handler via requireArea('opp_email_bridge'); the normal UI actions
    // (create/update/decide) via requireArea('business_dev').
    if (pathname.startsWith('/api/opportunity'))    return 'business_dev';
    // BD quick-send: MIDDLEWARE gates the path at business_dev (admin + partner +
    // business_dev pass; field_ops BLOCKED). The admin-only bridge actions (GET
    // ?pending=1, POST mark-sent) are enforced IN the handler via
    // requireArea('bd_send_bridge'); template/queue actions via business_dev.
    if (pathname.startsWith('/api/bd-send'))        return 'business_dev';
    if (pathname.startsWith('/api/users'))         return 'user_admin';
    // /api/data proxies the live SharePoint data set (bid log + project master).
    // BD sees the full bid log (Brad 2026-06-23) -> classify as financials
    // (project/BD tier). field_ops still BLOCKED (not in the financials area).
    if (pathname.startsWith('/api/data'))          return 'financials';
    // /api/hr serves the curated NON-SENSITIVE HR directory roster (name/title/
    // dept/location/startDate/status/workEmail/workPhone ONLY). Gated to the `hr`
    // area = admin + hr role ONLY. Without this line it would fall through to the
    // default 'user_admin' (admin-only) and the `hr` role could not read it. The
    // handler ALSO calls requireArea(session,'hr') as a defense-in-depth backstop.
    // It NEVER reads or returns comp/tax/SSN/benefits/payment data.
    if (pathname.startsWith('/api/hr'))            return 'hr';
    // /api/me returns ONLY the caller's own {name, role} (no business data).
    // Reachable by any authenticated role so the SPA can tailor its UI.
    if (pathname.startsWith('/api/me'))            return 'general';
    if (pathname.startsWith('/api/reset-password')) return 'reset'; // restricted-session only
    // Any other/new API route is admin-only until deliberately classified.
    return 'user_admin';
  }

  // ---- Root / directory index -> portal home (general) ----
  if (pathname === '/' || pathname === '') return 'general';

  // ---- /data/ payload files (SEC-09): classify by CONTENT, default-deny -----
  // This MUST come BEFORE the static-asset checks so a /data/*.js or *.json
  // file can never fall through to 'general'.
  if (pathname.startsWith('/data/')) {
    if (Object.prototype.hasOwnProperty.call(DATA_FILE_AREAS, pathname)) {
      return DATA_FILE_AREAS[pathname];
    }
    // Heuristic backstop: a NEW /data/ file whose name screams "sensitive"
    // (budget/financ/pricing/contract/bid/...) -> financials_global. We FAIL SAFE
    // to the partner/admin-only tier so an unclassified sensitive file is NEVER
    // BD-visible (item E req #4). A deliberately project-level file must be added
    // to DATA_FILE_AREAS explicitly to grant BD access.
    if (SENSITIVE_NAME_RE.test(pathname)) return 'financials_global';
    // DEFAULT-DENY: any unclassified /data/ file is admin only.
    // (Field-safe / BD-safe data files must be added to DATA_FILE_AREAS explicitly.)
    return 'user_admin';
  }

  // ---- HR module (same-origin embed at /hr/) — TIGHT gate -----------------
  // The HR module is served as static files under /hr/. It carries HR-confidential
  // surfaces (employee records, onboarding, time off, performance, compliance),
  // so the ENTIRE /hr/ prefix is gated to the `hr` area (admin + hr role ONLY),
  // NOT the permissive 'general' bucket used for /design-studio/. This branch is
  // placed BEFORE the STATIC_ASSET_PREFIXES / extension checks so no /hr/ path
  // (the index, or any future /hr/ asset) can fall through to 'general' or to the
  // static-extension allow-list. A non-hr, non-admin session hitting /hr/ resolves
  // to 'hr' -> roleCanAccess() false -> middleware deny() (302 /denied for HTML,
  // 403 JSON for fetch). Fails closed.
  if (pathname === '/hr' || pathname.startsWith('/hr/')) return 'hr';

  // ---- Static assets (styling/scripts/media) safe for everyone ----
  if (STATIC_ASSET_PREFIXES.some(p => pathname.startsWith(p))) return 'general';
  if (STATIC_ASSET_EXT_RE.test(pathname) && !pathname.endsWith('.html')) return 'general';

  // ---- Field crew operational pages ----
  if (Object.prototype.hasOwnProperty.call(FIELD_PAGES, pathname)) {
    return FIELD_PAGES[pathname];
  }

  // ---- Explicitly classified HTML pages ----
  if (Object.prototype.hasOwnProperty.call(PAGE_AREAS, pathname)) {
    return PAGE_AREAS[pathname];
  }

  // ---- Heuristic: any *.html whose name screams "sensitive" -> financials_global
  // (fail safe to partner/admin-only so a NEW sensitive page is NEVER BD-visible
  // until deliberately classified — item E req #4). ----
  if (pathname.endsWith('.html') && SENSITIVE_NAME_RE.test(pathname)) {
    return 'financials_global';
  }

  // ---- DEFAULT-DENY: unmapped path => admin-only ----
  return 'user_admin';
}
