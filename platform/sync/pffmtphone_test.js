// Standalone self-test for pfFmtPhone (mirrors the index.html helper exactly).
// Run: node sync/pffmtphone_test.js
function pfFmtPhone(v){
  if (v === undefined || v === null) return v;
  var s = String(v).trim();
  if (!s) return s;
  // Split off an extension (x45 / ext 45 / extension 45 / #45) if present, keep it.
  var ext = '';
  var em = /(?:\s*(?:x|ext\.?|extension|#)\s*)(\d{1,7})\s*$/i.exec(s);
  var core = s;
  if (em) { ext = ' x' + em[1]; core = s.slice(0, em.index); }
  // Extract digits from the core (the number part before any extension).
  var digits = core.replace(/\D/g, '');
  // Leading US country code 1 on an 11-digit string -> drop it.
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  // Only format a clean 10-digit US number; otherwise return the ORIGINAL unchanged.
  if (digits.length !== 10) return s;
  return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6) + ext;
}

var cases = [
  ['1112223333',            '(111) 222-3333'],
  ['111-222-3333',          '(111) 222-3333'],
  ['111.222.3333',          '(111) 222-3333'],
  ['(111) 222-3333',        '(111) 222-3333'],
  ['111 222 3333',          '(111) 222-3333'],
  ['+1 111 222 3333',       '(111) 222-3333'],
  ['11112223333',           '(111) 222-3333'],
  ['111-222-3333 x45',      '(111) 222-3333 x45'],
  ['111-222-3333 ext 45',   '(111) 222-3333 x45'],
  ['1 (111) 222-3333 ext. 9','(111) 222-3333 x9'],
  // honest fallbacks (return original unchanged):
  ['12345',                 '12345'],            // too few digits
  ['111222333344',          '111222333344'],     // too many digits
  ['+44 20 7946 0958',      '+44 20 7946 0958'], // international (non-1, 11 digits)
  ['',                      ''],                  // empty
  ['N/A',                   'N/A'],               // text
  ['See email',             'See email'],         // text
];

var pass = 0, fail = 0;
console.log('input'.padEnd(26) + '| expected'.padEnd(20) + '| got'.padEnd(20) + '| ok');
console.log('-'.repeat(76));
cases.forEach(function(c){
  var got = pfFmtPhone(c[0]);
  var ok = got === c[1];
  if (ok) pass++; else fail++;
  console.log(
    ("'"+c[0]+"'").padEnd(26) + '| ' +
    ("'"+c[1]+"'").padEnd(18) + '| ' +
    ("'"+got+"'").padEnd(18) + '| ' + (ok ? 'PASS' : 'FAIL <<<')
  );
});
// undefined / null pass-through (not string-quotable in the table)
var un = pfFmtPhone(undefined), nu = pfFmtPhone(null);
var edgeOk = (un === undefined) && (nu === null);
console.log('undefined -> ' + un + ', null -> ' + nu + '  | ' + (edgeOk ? 'PASS' : 'FAIL <<<'));
if (edgeOk) pass++; else fail++;
console.log('-'.repeat(76));
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
