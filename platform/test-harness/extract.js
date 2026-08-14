// Extract testable JS from index.html + project-override.js into loadable modules.
// Frontend: pull pfSubcontractAnalysis + pfSubcontractAnalysisSub function bodies and the
//   nesting call context by regex; wire minimal globals.
// Backend: load project-override.js as a module with the `import` line stubbed, and
//   invoke onRequestPost/onRequestGet against an in-memory KV to exercise the validator +
//   reserved-key merge exactly as production runs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- window.esc (canonical escaper) — copied verbatim from index.html ----------
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Extract a named function definition (top-level `function NAME(...) { ... }`) ----
function extractFn(src, name) {
  const startRe = new RegExp('function ' + name + '\\s*\\(');
  const m = startRe.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

const pfSubcontractAnalysisSrc = extractFn(html, 'pfSubcontractAnalysis');
const pfSubcontractAnalysisSubSrc = extractFn(html, 'pfSubcontractAnalysisSub');

// ---- Build a sandbox exposing the two render functions with injectable globals ----
function buildFront(state) {
  const sandbox = {
    E: esc,
    subhead: function (t) { return '<div class="pr-subhead">' + esc(t) + '</div>'; },
    canEdit: function () { return state.canEdit; },
    _curOverrides: state._curOverrides || {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    pfSubcontractAnalysisSrc + '\n' + pfSubcontractAnalysisSubSrc +
    '\nthis.__pfSA = pfSubcontractAnalysis; this.__pfSASub = pfSubcontractAnalysisSub;',
    sandbox
  );
  return {
    read: (d) => sandbox.__pfSA(d),
    renderSub: (A) => sandbox.__pfSASub(A),
  };
}

// ---- Load the worker (ESM) with the import stubbed so we can drive the validator ----
function loadWorker() {
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/project-override.js'), 'utf8');
  // Replace the ESM import with a local no-op requireArea (auth tested separately by RBAC
  // note; here we exercise the validator + merge which is the security-critical path).
  const stubbed = src
    .replace(/import\s*\{\s*requireArea\s*\}\s*from\s*['"][^'"]+['"];?/,
      'const requireArea = (session, area) => (session && session.area === area ? null : { __denied: true, area });')
    // export -> attach to module.exports for CommonJS eval
    .replace(/export async function onRequestGet/, 'async function onRequestGet')
    .replace(/export async function onRequestPost/, 'async function onRequestPost')
    + '\nmodule.exports = { onRequestGet, onRequestPost, cleanSubcontractAnalysis, cleanContractPull, cleanChangeOrders };';
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'console', 'URL', 'Response', 'Date', stubbed);
  // Minimal Response shim capturing status + json body.
  class Resp {
    constructor(body, init) { this._body = body; this.status = (init && init.status) || 200; this.headers = (init && init.headers) || {}; }
    async json() { return JSON.parse(this._body); }
  }
  fn(mod, mod.exports, console, URL, Resp, Date);
  return mod.exports;
}

// ---- In-memory KV shim mirroring env.PF_SCHEDULE.{get,put} ----
function makeKV() {
  const store = new Map();
  return {
    _store: store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  };
}

module.exports = { esc, buildFront, loadWorker, makeKV };
