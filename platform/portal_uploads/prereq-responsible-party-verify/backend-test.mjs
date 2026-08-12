// Backend test for cleanPrereqs() responsible_contact_id support (Brad 2026-08-12).
// Extracts the REAL s()/PREREQ_MAX_*/cleanPrereqs from functions/api/project-override.js
// (no reimplementation) and asserts the new tied-contactId field validates + round-trips,
// while the existing fields (name/email/date/required_for) are unaffected.
// Run: node portal_uploads/prereq-responsible-party-verify/backend-test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');
const src = readFileSync(join(REPO, 'functions', 'api', 'project-override.js'), 'utf8');

function grab(name){
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}', 'm');
  const m = src.match(re);
  if (!m) throw new Error('could not extract ' + name);
  return m[0];
}
// Pull the PREREQ_MAX_* + PREREQ_KEY consts + s() + cleanPrereqs into a sandbox.
const consts = (src.match(/^const PREREQ_[A-Z_]+ = [^;]*;/gm) || []).join('\n');
const code = consts + '\n' + grab('s') + '\n' + grab('cleanPrereqs') + '\nglobalThis.cleanPrereqs = cleanPrereqs;';
const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
const cleanPrereqs = ctx.cleanPrereqs;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond){ if(cond){pass++;} else {fail++; fails.push(name); console.error('  FAIL:', name);} }

// 1. Valid tied contactId round-trips (upper-cased).
let r = cleanPrereqs({ items: { a: { responsible_contact_id:'c0009', responsible_name:'Nate', responsible_email:'n@x.com', date_received:'2026-08-01', required_for:{ submittal_design:true, staking_layout:false } } } });
ok('1 tied cid uppercased + kept', r.items.a.responsible_contact_id === 'C0009');
ok('1 name/email/date preserved', r.items.a.responsible_name==='Nate' && r.items.a.responsible_email==='n@x.com' && r.items.a.date_received==='2026-08-01');
ok('1 required_for booleans coerced', r.items.a.required_for.submittal_design===true && r.items.a.required_for.staking_layout===false);

// 2. Empty / absent cid -> '' (never rejects).
ok('2 absent cid -> empty string', cleanPrereqs({ items: { a: { responsible_name:'x' } } }).items.a.responsible_contact_id === '');
ok('2 empty cid -> empty string', cleanPrereqs({ items: { a: { responsible_contact_id:'' } } }).items.a.responsible_contact_id === '');

// 3. Malformed cid (not C#### shape) -> dropped to '', save still succeeds.
ok('3 non-C#### cid dropped', cleanPrereqs({ items: { a: { responsible_contact_id:'HACKER<>' } } }).items.a.responsible_contact_id === '');
ok('3 numeric-only cid dropped', cleanPrereqs({ items: { a: { responsible_contact_id:'12345' } } }).items.a.responsible_contact_id === '');

// 4. Angle brackets stripped (defensive) BEFORE the C#### test; a value that becomes a
//    valid contactId after stripping is kept (C0<0>9 -> C009), a garbage one drops to ''.
ok('4a cid angle brackets stripped then validated', cleanPrereqs({ items: { a: { responsible_contact_id:'C0<0>9' } } }).items.a.responsible_contact_id === 'C009');
ok('4b cid script-y payload dropped', cleanPrereqs({ items: { a: { responsible_contact_id:'<script>alert(1)' } } }).items.a.responsible_contact_id === '');

// 5. Whole-body malformed still rejects (null) as before.
ok('5 non-object input rejected', cleanPrereqs([1,2,3]) === null);
ok('5 non-object item rejected', cleanPrereqs({ items: { a: 5 } }) === null);
ok('5 absent -> empty items', JSON.stringify(cleanPrereqs(null)) === JSON.stringify({ items:{} }));

console.log('\nprereq backend-test: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.error('FAILURES:', fails.join(' | ')); process.exit(1); }
