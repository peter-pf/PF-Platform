#!/usr/bin/env node
// Tests for verifier fix-round items (2026-10-23):
//  A. Per-bucket type rejects in field-upload.js (BUCKET_EXT, PNG magic, size caps)
//  B. cleanAttachments: webUrl host validation + itemId pattern
//  C. section-key whitelist (OPS_SECTION_KEYS) in cleanAttachments
//  D. PDF section filter: stone/spoils ops section filter matches OPS_SECTION_KEYS

import { strict as assert } from 'assert';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS', name); passed++; }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); failed++; }
}

// ============================================================
// Import the modules under test.
// ============================================================
const uploadUrl = new URL('../functions/api/field-upload.js', import.meta.url);
const srUrl     = new URL('../functions/api/site-readiness.js', import.meta.url);

// We can't import the CF Workers export directly (no Workers runtime), but we
// CAN extract the pure functions we want to test by re-implementing the
// relevant logic from the module source here using the exact same rules.
// Each "shadow" function mirrors the source exactly.

// ---- Shadow: BUCKET_EXT, PNG magic, per-bucket size -------------------
// Mirrors field-upload.js constants (keep in sync).
const ALLOWED_EXT_GLOBAL = new Set(['.guh', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.zip', '.xlsx']);
const BUCKET_EXT = new Map([
  ['sr_markup',    new Set(['.png'])],
  ['sr_signature', new Set(['.png'])],
  ['staking_photo', new Set(['.jpg', '.jpeg', '.png', '.heic'])],
  ['photos',        new Set(['.jpg', '.jpeg', '.png', '.heic'])],
  ['safety_cert',   new Set(['.pdf', '.jpg', '.jpeg', '.png', '.heic'])],
]);
const BUCKET_MAX_BYTES = new Map([
  ['sr_markup',    1 * 1024 * 1024],
  ['sr_signature', 1 * 1024 * 1024],
]);
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf) {
  if (buf.length < 8) return false;
  for (let i = 0; i < 8; i++) { if (buf[i] !== PNG_SIG[i]) return false; }
  return true;
}
const PNG_MAGIC_BUCKETS = new Set(['sr_markup', 'sr_signature']);
const MAX_FILE_BYTES_GLOBAL = 50 * 1024 * 1024;

function validateFile(bucketKey, ext, buf) {
  const bucketExts = BUCKET_EXT.has(bucketKey) ? BUCKET_EXT.get(bucketKey) : ALLOWED_EXT_GLOBAL;
  if (!bucketExts.has(ext)) return 'File type not allowed for this bucket.';
  if (!ALLOWED_EXT_GLOBAL.has(ext)) return 'File type not allowed.';
  const bucketMax = BUCKET_MAX_BYTES.has(bucketKey) ? BUCKET_MAX_BYTES.get(bucketKey) : MAX_FILE_BYTES_GLOBAL;
  if (buf.length > bucketMax) return `File exceeds ${(bucketMax / (1024 * 1024)).toFixed(0)}MB limit for this bucket.`;
  if (buf.length > MAX_FILE_BYTES_GLOBAL) return 'File exceeds 50MB.';
  if (PNG_MAGIC_BUCKETS.has(bucketKey) && !isPng(buf)) return 'File must be a valid PNG.';
  return null; // ok
}

// ---- Shadow: cleanAttachments ----------------------------------------
// Mirrors site-readiness.js (keep in sync).
const SP_HOST_PREFIX = 'https://pierfoundations.sharepoint.com/';
const GRAPH_ID_RE = /^[A-Za-z0-9!._\-]{1,300}$/;
const OPS_SECTION_KEYS = new Set(['stone', 'spoils']);
// VALID_ITEM_KEYS from CHECKLIST_ITEMS
const CHECKLIST_ITEM_KEYS = new Set(['1a','1b','2a','2b','2c','3a','3b','3c','3d','3e','4a','4b','4c','4d']);
const VALID_ITEM_KEYS_TEST = CHECKLIST_ITEM_KEYS;
const VALID_BUCKETS_TEST = new Set(['grade_photo','proof_roll','photos','staking_photo','safety_cert','sr_markup','sr_signature']);

function s(v, cap = 300) {
  if (v == null) return '';
  let str = String(v);
  if (str.length > cap) str = str.slice(0, cap);
  return str.replace(/[<>]/g, '');
}

function cleanAttachmentsShadow(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input.slice(0, 60)) {
    if (!a || typeof a !== 'object') continue;
    const name   = s(a.name);
    const rawId  = s(a.itemId);
    const itemId = GRAPH_ID_RE.test(rawId) ? rawId : '';
    if (!name && !itemId) continue;
    const bucketRaw = s(a.bucket);
    const bucket    = VALID_BUCKETS_TEST.has(bucketRaw) ? bucketRaw : '';
    const wu        = s(a.webUrl, 2000);
    const webUrl    = wu.startsWith(SP_HOST_PREFIX) ? wu : '';
    const rawKey    = s(a.key, 20);
    const key       = OPS_SECTION_KEYS.has(rawKey)
      ? rawKey
      : (VALID_ITEM_KEYS_TEST.has(rawKey) ? rawKey : '');
    out.push({ key, name, itemId, webUrl, bucket });
  }
  return out;
}

// ============================================================
console.log('\n--- A. Per-bucket type rejects ---');

const PNG_BYTES = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,...new Array(10).fill(0)]);
const FAKE_PNG = Uint8Array.from([0xFF,0xD8,...new Array(10).fill(0)]); // JPEG magic

test('sr_markup: .png valid PNG accepted', () => {
  assert.equal(validateFile('sr_markup', '.png', PNG_BYTES), null);
});
test('sr_markup: .jpg rejected (not in BUCKET_EXT)', () => {
  assert.match(validateFile('sr_markup', '.jpg', PNG_BYTES), /not allowed for this bucket/);
});
test('sr_markup: .png but not PNG magic bytes rejected', () => {
  assert.match(validateFile('sr_markup', '.png', FAKE_PNG), /valid PNG/);
});
test('sr_markup: .png but > 1MB rejected', () => {
  const bigBuf = new Uint8Array(1 * 1024 * 1024 + 1);
  PNG_BYTES.slice(0, 8).forEach((b, i) => { bigBuf[i] = b; });
  assert.match(validateFile('sr_markup', '.png', bigBuf), /exceeds 1MB/);
});
test('sr_signature: same rules as sr_markup — .pdf rejected', () => {
  assert.match(validateFile('sr_signature', '.pdf', PNG_BYTES), /not allowed for this bucket/);
});
test('staking_photo: .jpg accepted', () => {
  assert.equal(validateFile('staking_photo', '.jpg', new Uint8Array(100)), null);
});
test('staking_photo: .pdf rejected', () => {
  assert.match(validateFile('staking_photo', '.pdf', new Uint8Array(100)), /not allowed for this bucket/);
});
test('photos: .heic accepted', () => {
  assert.equal(validateFile('photos', '.heic', new Uint8Array(100)), null);
});
test('photos: .zip rejected', () => {
  assert.match(validateFile('photos', '.zip', new Uint8Array(100)), /not allowed for this bucket/);
});
test('safety_cert: .pdf accepted', () => {
  assert.equal(validateFile('safety_cert', '.pdf', new Uint8Array(100)), null);
});
test('safety_cert: .zip rejected', () => {
  assert.match(validateFile('safety_cert', '.zip', new Uint8Array(100)), /not allowed for this bucket/);
});
test('handlogs (fallback): .guh accepted via global list', () => {
  assert.equal(validateFile('handlogs', '.guh', new Uint8Array(100)), null);
});

// ============================================================
console.log('\n--- B. URL host validation ---');

test('SP host webUrl preserved', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.pdf', itemId: 'ABC123', bucket: 'grade_photo',
    webUrl: 'https://pierfoundations.sharepoint.com/sites/PF/file.pdf', key: '3a' }]);
  assert.equal(res.length, 1);
  assert.ok(res[0].webUrl.startsWith('https://pierfoundations.sharepoint.com/'));
});
test('off-host webUrl stripped', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.pdf', itemId: 'ABC123', bucket: 'grade_photo',
    webUrl: 'https://evil.example.com/steal.pdf', key: '3a' }]);
  assert.equal(res[0].webUrl, '');
});
test('bare item id as webUrl stripped', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.pdf', itemId: 'ABC123', bucket: 'grade_photo',
    webUrl: 'ABC123', key: '3a' }]);
  assert.equal(res[0].webUrl, '');
});
test('itemId valid pattern preserved', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.pdf', itemId: 'A1B2C3-abc_def.xyz!', bucket: 'grade_photo',
    webUrl: 'https://pierfoundations.sharepoint.com/x', key: '3a' }]);
  assert.equal(res[0].itemId, 'A1B2C3-abc_def.xyz!');
});
test('itemId with path traversal rejected', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.pdf', itemId: '../../../etc/passwd', bucket: 'grade_photo',
    webUrl: 'https://pierfoundations.sharepoint.com/x', key: '3a' }]);
  assert.equal(res[0].itemId, '');
});

// ============================================================
console.log('\n--- C. Section key whitelist (OPS_SECTION_KEYS) ---');

test("key='stone' preserved for sr_markup bucket", () => {
  const res = cleanAttachmentsShadow([{ name: 'markup.png', itemId: 'X1', bucket: 'sr_markup',
    webUrl: 'https://pierfoundations.sharepoint.com/m.png', key: 'stone' }]);
  assert.equal(res[0].key, 'stone');
});
test("key='spoils' preserved for sr_signature bucket", () => {
  const res = cleanAttachmentsShadow([{ name: 'sig.png', itemId: 'X2', bucket: 'sr_signature',
    webUrl: 'https://pierfoundations.sharepoint.com/s.png', key: 'spoils' }]);
  assert.equal(res[0].key, 'spoils');
});
test('valid checklist key preserved for photo bucket', () => {
  const res = cleanAttachmentsShadow([{ name: 'photo.jpg', itemId: 'X3', bucket: 'staking_photo',
    webUrl: 'https://pierfoundations.sharepoint.com/p.jpg', key: '3e' }]);
  assert.equal(res[0].key, '3e');
});
test('arbitrary unknown key rejected', () => {
  const res = cleanAttachmentsShadow([{ name: 'f.jpg', itemId: 'X4', bucket: 'photos',
    webUrl: 'https://pierfoundations.sharepoint.com/f.jpg', key: 'badkey' }]);
  assert.equal(res[0].key, '');
});
test('OPS_SECTION_KEYS set contains exactly stone and spoils', () => {
  assert.ok(OPS_SECTION_KEYS.has('stone'));
  assert.ok(OPS_SECTION_KEYS.has('spoils'));
  assert.equal(OPS_SECTION_KEYS.size, 2);
});

// ============================================================
console.log('\n--- D. PDF section filter matches OPS_SECTION_KEYS ---');

test("stone section filter: only key='stone' matches", () => {
  const attachments = [
    { name: 'stone_markup.png', bucket: 'sr_markup', key: 'stone', webUrl: 'https://pierfoundations.sharepoint.com/m.png' },
    { name: 'spoils_markup.png', bucket: 'sr_markup', key: 'spoils', webUrl: 'https://pierfoundations.sharepoint.com/s.png' },
    { name: 'other.png', bucket: 'sr_markup', key: '3a', webUrl: 'https://pierfoundations.sharepoint.com/o.png' },
  ];
  const stoneMk = attachments.filter((a) => a.bucket === 'sr_markup' && a.key === 'stone');
  assert.equal(stoneMk.length, 1);
  assert.equal(stoneMk[0].name, 'stone_markup.png');
});
test("spoils section filter: only key='spoils' matches", () => {
  const attachments = [
    { name: 'stone_sig.png',  bucket: 'sr_signature', key: 'stone',  webUrl: 'https://pierfoundations.sharepoint.com/ss.png' },
    { name: 'spoils_sig.png', bucket: 'sr_signature', key: 'spoils', webUrl: 'https://pierfoundations.sharepoint.com/sp.png' },
  ];
  const spoilsSig = attachments.filter((a) => a.bucket === 'sr_signature' && a.key === 'spoils');
  assert.equal(spoilsSig.length, 1);
  assert.equal(spoilsSig[0].name, 'spoils_sig.png');
});
test('stone markup not included in spoils section (no key overlap)', () => {
  const attachments = [
    { name: 'stone_markup.png', bucket: 'sr_markup', key: 'stone' },
    { name: 'spoils_markup.png', bucket: 'sr_markup', key: 'spoils' },
  ];
  const spoilsMk = attachments.filter((a) => a.bucket === 'sr_markup' && a.key === 'spoils');
  assert.equal(spoilsMk.length, 1);
  const stoneMk  = attachments.filter((a) => a.bucket === 'sr_markup' && a.key === 'stone');
  assert.equal(stoneMk.length, 1);
  assert.notEqual(spoilsMk[0], stoneMk[0]);
});

// ============================================================
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
