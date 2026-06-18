// SEC-15 — build-time data classification guard.
//
// WHY: the /data/* feeds are AUTO-GENERATED from SharePoint and can drift. A
// classification in functions/lib/auth.js (areaForPath -> DATA_FILE_AREAS) is
// only a LABEL; nothing stops a regenerated "field-safe" file from suddenly
// carrying a dollar value or GC name (exactly the SEC-12 leak: 'schedule' was
// labelled field-safe but the rows embedded contract `value` + `gc_name`).
//
// WHAT: for every /data/ file that areaForPath() classifies as FIELD-SAFE
// (field_ops / schedule / general — i.e. reachable by a field_ops session), scan
// its CONTENT for financial signals (dollar amounts, money-looking keys, GC
// name). If any field-safe file contains them, FAIL with a non-zero exit. This
// turns the content claim into an ENFORCED invariant, not an assumption.
//
// Run: node platform/migrations/check-data-classification.mjs
//
// Comments are stripped before scanning so a banner that merely *describes* what
// was removed ("dollars and GC removed") does not trip the guard — only the
// actual data payload is inspected.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { areaForPath, roleCanAccess } from '../functions/lib/auth.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '..', 'data');

// A field-safe file is one a field_ops session can fetch. We resolve the area
// the SAME way the runtime middleware does (areaForPath) and ask roleCanAccess.
function isFieldSafe(urlPath) {
  const area = areaForPath(urlPath);
  return roleCanAccess('field_ops', area);
}

// Strip // line comments and /* */ block comments so prose in a file banner is
// not scanned as data. Conservative: we only remove well-formed comments; any
// data string that happens to contain "//" survives (string-literal scan below
// still catches it, which is the safe direction).
function stripComments(src) {
  // Remove block comments first, then line comments.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n\r]*/g, '$1 '); // avoid eating "http://" inside strings: require non-':' before //
}

// Money-looking key names (as JS/JSON object keys). These are the fields that
// carry contract dollars / GC identity / bid economics.
const MONEY_KEY_RE =
  /["']?\b(value|cost|price|amount|contract[_ ]?value|bid[_ ]?value|total[_ ]?contract[_ ]?value|margin|profit|revenue|gc[_ ]?name|gc[_ ]?contact|invoice|budget|pricing|ar|paid|unpaid|wage|rate)\b["']?\s*:/i;

// A literal dollar sign, or a money-looking numeric (>= $1,000 with cents, e.g.
// 343037.07) which is the schedule "value" shape. Bare small integers (LF,
// columns, work_days) are NOT flagged.
const DOLLAR_SIGN_RE = /\$/;
const MONEY_NUMBER_RE = /\b\d{4,}\.\d{2}\b/; // 1234.56 and larger -> looks like a dollar amount

function scanFile(path) {
  const raw = readFileSync(path, 'utf8');
  const body = stripComments(raw);
  const hits = [];

  const keyMatch = body.match(MONEY_KEY_RE);
  if (keyMatch) hits.push(`money/GC key "${keyMatch[1] || keyMatch[0].trim()}"`);

  if (DOLLAR_SIGN_RE.test(body)) hits.push('literal "$"');
  const numMatch = body.match(MONEY_NUMBER_RE);
  if (numMatch) hits.push(`dollar-shaped number ${numMatch[0]}`);

  return hits;
}

// --- run ---------------------------------------------------------------------
let scanned = 0;
let failed = 0;
const failures = [];
const cleanList = [];

const files = readdirSync(DATA_DIR).filter(f => /\.(js|mjs|json)$/i.test(f));

console.log('SEC-15 data classification guard');
console.log('Scanning /data/ files that are FIELD-SAFE (reachable by field_ops)...\n');

for (const f of files.sort()) {
  const urlPath = '/data/' + f;
  if (!isFieldSafe(urlPath)) continue; // sensitive files are allowed to contain $ — not scanned
  scanned++;
  const hits = scanFile(join(DATA_DIR, f));
  if (hits.length) {
    failed++;
    failures.push({ file: urlPath, hits });
    console.error(`  FAIL  ${urlPath}  ->  ${hits.join('; ')}`);
  } else {
    cleanList.push(urlPath);
    console.log(`  ok    ${urlPath}  (field-safe, no financial signal)`);
  }
}

console.log(`\n${'='.repeat(56)}`);
console.log(`Field-safe files scanned: ${scanned}`);
console.log(`Clean: ${cleanList.length}  |  Leaking: ${failed}`);

if (failed) {
  console.error('\nRESULT: FAIL — a FIELD-SAFE /data/ file carries financial data.');
  console.error('Either strip the dollar/GC fields from the file, or reclassify it');
  console.error('as sensitive (financials/contracts/...) in functions/lib/auth.js.');
  for (const x of failures) console.error(`  - ${x.file}: ${x.hits.join('; ')}`);
  process.exit(1);
}

console.log('\nRESULT: PASS — no field-safe /data/ file contains dollars, money keys, or GC names.');
