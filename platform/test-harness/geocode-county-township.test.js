// Harness: Feature 1 — County + Township auto-fill from address (Brad 2026-08-13).
// Proves:
//   (a) the geocode endpoint parses a REAL-SHAPE US Census Geocoder response into
//       {matched:true, county, township} — civil township pulled from the
//       "County Subdivisions" layer;
//   (b) an incorporated place (subdivision NAME is a city, not "... township")
//       fills County and leaves Township BLANK with a note (never guesses);
//   (c) FAIL CLOSED: no addressMatches -> matched:false + empty values;
//   (d) FAIL CLOSED: unreadable/garbage body -> matched:false + empty values;
//   (e) FAIL CLOSED: ambiguous (>1 distinct county) -> matched:false + empty values;
//   (f) a match with NO county returned -> matched:false;
//   (g) the endpoint is loadable as a module (import stubbed) and never fabricates.
//
// The endpoint's network fetch is NOT exercised here (a harness must not call the
// live government API); we drive the PURE parsers (parseCensusResponse /
// parseGeographies) that turn the Census payload into our result shape — the exact
// logic the GET handler runs on the response text.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL: ' + name); } }

// ---- Load geocode.js with the ESM import stubbed + exports captured (CommonJS) ----
function loadGeocode() {
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/geocode.js'), 'utf8');
  const stubbed = src
    .replace(/import\s*\{\s*requireArea\s*\}\s*from\s*['"][^'"]+['"];?/,
      'const requireArea = () => null;')
    .replace(/export function parseGeographies/, 'function parseGeographies')
    .replace(/export function parseCensusResponse/, 'function parseCensusResponse')
    .replace(/export async function onRequestGet/, 'async function onRequestGet')
    .replace(/export async function onRequestPost/, 'async function onRequestPost')
    + '\nmodule.exports = { parseGeographies, parseCensusResponse };';
  const mod = { exports: {} };
  class Resp {
    constructor(body, init) { this._body = body; this.status = (init && init.status) || 200; }
    async json() { return JSON.parse(this._body); }
  }
  const fn = new Function('module', 'exports', 'console', 'URL', 'Response', 'Date', 'fetch', 'AbortController', 'setTimeout', 'clearTimeout', stubbed);
  fn(mod, mod.exports, console, URL, Resp, Date, () => { throw new Error('no network in harness'); }, function(){ this.abort = () => {}; this.signal = {}; }, () => 0, () => {});
  return mod.exports;
}

const G = loadGeocode();

// ---- Sample: real-SHAPE Census response for a township address ------------------
// Mirrors geocoding.geo.census.gov/geocoder/geographies/onelineaddress for an
// address that resolves to a civil township (Allen County / Wayne township, IN).
const townshipSample = JSON.stringify({
  result: {
    addressMatches: [
      {
        matchedAddress: '1234 EXAMPLE ST, FORT WAYNE, IN, 46802',
        geographies: {
          'Counties': [{ NAME: 'Allen County', STATE: '18', COUNTY: '003' }],
          'County Subdivisions': [{ NAME: 'Wayne township', STATE: '18' }],
          'States': [{ NAME: 'Indiana' }],
        },
      },
    ],
  },
});

// (a) township address -> matched, county + township
{
  const r = G.parseCensusResponse(townshipSample);
  ok('(a) matched true', r.matched === true);
  ok('(a) county = Allen County', r.county === 'Allen County');
  ok('(a) township = Wayne township', r.township === 'Wayne township');
  ok('(a) source label', r.source === 'US Census Geocoder');
  ok('(a) no note on clean township', !r.note);
}

// (a2) parseGeographies directly
{
  const g = G.parseGeographies({
    'Counties': [{ NAME: 'DeKalb County' }],
    'County Subdivisions': [{ NAME: 'Butler township' }],
  });
  ok('(a2) county', g.county === 'DeKalb County');
  ok('(a2) township', g.township === 'Butler township');
  ok('(a2) no townshipNote', !g.townshipNote);
}

// (b) incorporated place: subdivision NAME is a city (not "... township")
{
  const incSample = JSON.stringify({
    result: { addressMatches: [{
      geographies: {
        'Counties': [{ NAME: 'Marion County' }],
        'County Subdivisions': [{ NAME: 'Indianapolis city (balance)' }],
      },
    }] },
  });
  const r = G.parseCensusResponse(incSample);
  ok('(b) matched true (county still resolved)', r.matched === true);
  ok('(b) county filled', r.county === 'Marion County');
  ok('(b) township BLANK for incorporated place', r.township === '');
  ok('(b) note explains incorporated (no guess)', /no civil township/i.test(r.note) && /Indianapolis/.test(r.note));
}

// (c) FAIL CLOSED: no addressMatches
{
  const r = G.parseCensusResponse(JSON.stringify({ result: { addressMatches: [] } }));
  ok('(c) matched false', r.matched === false);
  ok('(c) county empty', r.county === '');
  ok('(c) township empty', r.township === '');
  ok('(c) has explanatory note', !!r.note);
}

// (d) FAIL CLOSED: garbage body
{
  const r = G.parseCensusResponse('<html>502 Bad Gateway</html>');
  ok('(d) matched false on garbage', r.matched === false);
  ok('(d) empty values on garbage', r.county === '' && r.township === '');
}

// (d2) FAIL CLOSED: empty string
{
  const r = G.parseCensusResponse('');
  ok('(d2) matched false on empty', r.matched === false && r.county === '');
}

// (e) FAIL CLOSED: ambiguous (two matches, different counties)
{
  const ambig = JSON.stringify({
    result: { addressMatches: [
      { geographies: { 'Counties': [{ NAME: 'Allen County' }], 'County Subdivisions': [{ NAME: 'Wayne township' }] } },
      { geographies: { 'Counties': [{ NAME: 'Whitley County' }], 'County Subdivisions': [{ NAME: 'Columbia township' }] } },
    ] },
  });
  const r = G.parseCensusResponse(ambig);
  ok('(e) matched false on ambiguous', r.matched === false);
  ok('(e) empty on ambiguous', r.county === '' && r.township === '');
  ok('(e) note mentions ambiguous', /ambiguous/i.test(r.note));
}

// (e2) Multiple matches but SAME county -> NOT ambiguous (use first)
{
  const same = JSON.stringify({
    result: { addressMatches: [
      { geographies: { 'Counties': [{ NAME: 'Allen County' }], 'County Subdivisions': [{ NAME: 'Wayne township' }] } },
      { geographies: { 'Counties': [{ NAME: 'Allen County' }], 'County Subdivisions': [{ NAME: 'Wayne township' }] } },
    ] },
  });
  const r = G.parseCensusResponse(same);
  ok('(e2) matched true when same county', r.matched === true && r.county === 'Allen County');
}

// (f) match with NO county returned -> matched false
{
  const noCounty = JSON.stringify({
    result: { addressMatches: [{ geographies: { 'County Subdivisions': [{ NAME: 'Wayne township' }] } }] },
  });
  const r = G.parseCensusResponse(noCounty);
  ok('(f) matched false when no county', r.matched === false);
  ok('(f) empty when no county', r.county === '' && r.township === '');
}

// (g) never fabricates: on every failure path county/township are empty strings
{
  const paths = ['', 'not json', JSON.stringify({}), JSON.stringify({ result: {} })];
  let allSafe = true;
  paths.forEach((p) => { const r = G.parseCensusResponse(p); if (r.matched !== false || r.county !== '' || r.township !== '') allSafe = false; });
  ok('(g) all failure paths fail closed (empty, matched:false)', allSafe);
}

console.log('\nFeature 1 (geocode county/township): ' + pass + ' passed, ' + fail + ' failed'
  + (fail ? ('\nFAILURES: ' + fails.join(', ')) : ''));
process.exit(fail ? 1 : 0);
