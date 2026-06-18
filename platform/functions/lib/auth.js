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
export const PBKDF2_ITERATIONS = 210000;           // OWASP 2023 floor for PBKDF2-HMAC-SHA256
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

// Mint a per-user session token: base64url(JSON{uid,role,name,exp}).signature
export async function mintSession({ uid, role, name }, secret, ttlMs = SESSION_TTL_MS) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    uid,
    role,
    name: name || '',
    exp: Date.now() + ttlMs,
  })));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
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
//   admin     — Brad. Full access + user management.
//   partner   — Jonathan, Derek. Full view + edit their domains.
//   field_ops — field crew. ONLY Field Operations. NO financials / contracts /
//               preconstruction, even by direct URL.
//
// We model access as a set of "areas" each role may touch, and tag sensitive
// API endpoints with a required area. The default-deny posture: an endpoint
// tagged with an area that the role does NOT hold returns 403.

export const ROLES = ['admin', 'partner', 'field_ops'];

// Area -> which roles may access it. Anything not listed defaults to admin-only.
const AREA_ROLES = {
  // Field crew areas — field_ops + partner + admin
  field_ops:        ['admin', 'partner', 'field_ops'],
  schedule:         ['admin', 'partner', 'field_ops'], // crew schedule (operational)
  // Sensitive business areas — partner + admin ONLY (field_ops BLOCKED)
  financials:       ['admin', 'partner'],
  contracts:        ['admin', 'partner'],
  preconstruction:  ['admin', 'partner'],
  estimating:       ['admin', 'partner'],
  business_dev:     ['admin', 'partner'],
  documents:        ['admin', 'partner'], // /api/doc proxy (may surface contracts/financials)
  general:          ['admin', 'partner', 'field_ops'], // non-sensitive shared data
  // Admin-only
  user_admin:       ['admin'],
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

// Map a request pathname to the area it touches, so the middleware can apply a
// coarse server-side gate in ADDITION to per-endpoint requireArea() calls.
// Default-deny for unknown /api paths is the caller's choice; this returns
// 'general' for anything unmapped so the middleware doesn't over-block static
// pages — sensitive ENDPOINTS still call requireArea() themselves.
export function areaForPath(pathname) {
  // Sensitive API endpoints get an explicit area here as defense-in-depth.
  if (pathname.startsWith('/api/doc'))      return 'documents';
  if (pathname.startsWith('/api/schedule')) return 'schedule';
  if (pathname.startsWith('/api/users'))    return 'user_admin';
  // Add future financial/contract endpoints here as they are built, e.g.:
  //   if (pathname.startsWith('/api/budget')) return 'financials';
  return 'general';
}
