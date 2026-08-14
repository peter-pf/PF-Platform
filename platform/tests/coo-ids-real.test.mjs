// Verify the REAL 87 items in coo-checklist.html produce unique, valid stable ids.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../coo-checklist.html', import.meta.url), 'utf8');

// Pull the `var DATA = [ ... ];` array out of the page and eval it (our own file).
const m = /var DATA\s*=\s*(\[[\s\S]*?\]);/.exec(html);
if (!m) { console.error('FAIL could not find DATA array'); process.exit(1); }
const DATA = eval(m[1]);

function slug(str){ return String(str||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function stableId(cat, item){ const s=slug(cat), i=slug(item); return i ? s+'.'+i : s; }
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

let total=0; const ids=[]; const seen=new Map(); const collisions=[]; const badShape=[];
for (const cat of DATA) for (const it of cat.items) {
  total++;
  const id = stableId(cat.cat, it.t);
  ids.push(id);
  if (seen.has(id)) collisions.push({ id, a: seen.get(id), b: cat.cat+' :: '+it.t });
  else seen.set(id, cat.cat+' :: '+it.t);
  if (!ID_RE.test(id)) badShape.push({ id, item: it.t });
}
console.log('sections:', DATA.length, 'items:', total);
console.log('unique ids:', new Set(ids).size);
console.log('collisions:', collisions.length);
if (collisions.length) console.log(JSON.stringify(collisions, null, 2));
console.log('bad-shape ids:', badShape.length);
if (badShape.length) console.log(JSON.stringify(badShape, null, 2));
const okAll = collisions.length===0 && badShape.length===0 && total===87 && DATA.length===15;
console.log(okAll ? 'PASS all 87 items -> unique valid stable ids' : 'FAIL');
process.exit(okAll ? 0 : 1);
