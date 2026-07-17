// Minimal, dependency-free PDF generator for the Cloudflare Pages Functions
// (Workers) runtime. The PF Platform deploy pipeline (deploy.sh -> `npx wrangler
// pages deploy .`) has NO package.json / node_modules / build step, so Functions
// cannot bundle npm packages (pdf-lib etc.) without changing that proven pipeline.
// Rather than take that risk, we emit a valid PDF 1.4 document directly. This is
// enough for an authoritative, SERVER-GENERATED daily-report PDF: multiple pages,
// Helvetica / Helvetica-Bold text, word-wrapped paragraphs, and horizontal rules.
//
// SCOPE (intentionally small):
//  - Standard 14 fonts only (Helvetica, Helvetica-Bold) -> no font embedding.
//  - WinAnsi text. Non-Latin-1 characters are transliterated/stripped so the
//    content stream can never break the file. Field reports are ASCII in practice.
//  - Letter page (612 x 792 pt), 54pt margins, automatic page breaks.
//  - NO images, NO tables beyond simple left/right column text. That is all a
//    daily report needs and it keeps the writer auditable.
//
// PUBLIC API:  new PdfDoc(opts) -> .text() / .heading() / .rule() / .spacer() /
//              .keyVal() / .row() -> .toBytes() (Uint8Array).
//
// SECURITY: pure computation, no I/O, no eval, no network. Every string is
// sanitized to WinAnsi + PDF-string-escaped before it reaches the content stream.

const PAGE_W = 612;   // US Letter width  (8.5in * 72)
const PAGE_H = 792;   // US Letter height (11in * 72)
const MARGIN = 54;    // 0.75in margin
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---- character width tables (per 1000 units) for Helvetica / Helvetica-Bold ---
// Widths for WinAnsi code points 32..255. These are the standard AFM widths so
// our word-wrap math matches what a viewer actually renders. Any code point not
// in range falls back to 556 (a safe average) — only affects wrap estimation.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function widthOf(code, bold) {
  if (code < 32) return 0;
  const table = bold ? HELVB : HELV;
  if (code <= 126) return table[code - 32];
  // 127..160 gap -> average; 161..255 not tabled here -> average. Only affects
  // wrap estimation, never the rendered glyph (viewer uses the real font metric).
  return 556;
}

// Convert a JS string to a WinAnsi-safe string: keep printable Latin-1, map a few
// common typographic characters to ASCII, drop everything else. This guarantees
// the content stream is well-formed regardless of user input.
function toWinAnsi(str) {
  const s = String(str == null ? '' : str);
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0x2019 || c === 0x2018) { out += "'"; continue; }      // curly quotes
    if (c === 0x201C || c === 0x201D) { out += '"'; continue; }
    if (c === 0x2013 || c === 0x2014) { out += '-'; continue; }      // en/em dash
    if (c === 0x2026) { out += '...'; continue; }                    // ellipsis
    if (c === 0x00A0) { out += ' '; continue; }                      // nbsp
    if (c === 9) { out += '    '; continue; }                        // tab
    if (c === 10 || c === 13) { out += ' '; continue; }              // newlines handled by caller
    if (c >= 32 && c <= 255) { out += ch; continue; }                // Latin-1 range
    // anything else -> drop (keeps stream valid; field text is ASCII anyway)
  }
  return out;
}

// Escape a WinAnsi string for a PDF literal string: ( ) and \ must be escaped.
function escPdf(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Measure the rendered width (in points) of a WinAnsi string at a font size.
function measure(str, size, bold) {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += widthOf(str.charCodeAt(i), bold);
  return (w / 1000) * size;
}

// Word-wrap a (already WinAnsi) string to a max width, returning an array of
// lines. Handles a single over-long token by hard-splitting it.
function wrap(str, size, bold, maxW) {
  const words = str.split(/\s+/).filter((w) => w.length);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (measure(trial, size, bold) <= maxW) { line = trial; continue; }
    if (line) { lines.push(line); line = ''; }
    // the word alone may still be too wide -> hard split
    if (measure(word, size, bold) <= maxW) { line = word; continue; }
    let chunk = '';
    for (const ch of word) {
      if (measure(chunk + ch, size, bold) <= maxW) { chunk += ch; }
      else { if (chunk) lines.push(chunk); chunk = ch; }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export class PdfDoc {
  constructor() {
    this.pages = [];       // each page: array of content-stream fragments
    this.cur = null;       // current page fragments
    this.y = 0;            // current baseline cursor (top-down; we track from top)
    this._newPage();
  }

  _newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = PAGE_H - MARGIN;   // start at top margin
  }

  // Ensure `need` points of vertical space remain; else start a new page.
  _ensure(need) {
    if (this.y - need < MARGIN) this._newPage();
  }

  // Draw one line of text at the current cursor, then advance.
  _drawLine(text, size, bold, x, leading) {
    const t = escPdf(text);
    const font = bold ? '/F2' : '/F1';
    // BT set font, position, show, ET. y is the baseline.
    this.cur.push(
      `BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(this.y).toFixed(2)} Tm (${t}) Tj ET`
    );
    this.y -= leading;
  }

  // Multi-line body text (word-wrapped). size default 10.
  text(str, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const bold = !!opts.bold;
    const leading = opts.leading || size * 1.35;
    const indent = opts.indent || 0;
    const x = MARGIN + indent;
    const maxW = CONTENT_W - indent;
    const clean = toWinAnsi(str);
    // Respect explicit newlines the caller embedded, then wrap each segment.
    const segments = String(str == null ? '' : str).split(/\r?\n/);
    for (const seg of segments) {
      const lines = wrap(toWinAnsi(seg), size, bold, maxW);
      for (const ln of lines) {
        this._ensure(leading);
        this._drawLine(ln, size, bold, x, leading);
      }
    }
    return this;
  }

  // A section heading: bold, slightly larger, with a thin rule under it.
  heading(str, opts) {
    opts = opts || {};
    const size = opts.size || 12;
    this.spacer(opts.top == null ? 6 : opts.top);
    this._ensure(size * 1.4 + 4);
    this._drawLine(toWinAnsi(str), size, true, MARGIN, size * 1.4);
    this.rule(0.5);
    this.spacer(3);
    return this;
  }

  // Document title (top of page 1): large bold, centered.
  title(str, subtitle) {
    const size = 18;
    const clean = toWinAnsi(str);
    const w = measure(clean, size, true);
    const x = MARGIN + Math.max(0, (CONTENT_W - w) / 2);
    this._ensure(size * 1.5);
    const t = escPdf(clean);
    this.cur.push(`BT /F2 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm (${t}) Tj ET`);
    this.y -= size * 1.4;
    if (subtitle) {
      const ss = 10; const cs = toWinAnsi(subtitle);
      const sw = measure(cs, ss, false);
      const sx = MARGIN + Math.max(0, (CONTENT_W - sw) / 2);
      this._drawLine(cs, ss, false, sx, ss * 1.4);
    }
    this.spacer(4);
    this.rule(1);
    this.spacer(6);
    return this;
  }

  // Key : value on one line (bold key, normal value, wrapped value continues
  // under the value column). Good for the header facts block.
  keyVal(key, value, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const leading = size * 1.4;
    const keyStr = toWinAnsi((key || '') + ':');
    const keyW = measure(keyStr, size, true);
    const gap = 6;
    const valX = MARGIN + keyW + gap;
    const valMaxW = PAGE_W - MARGIN - valX;
    const valLines = wrap(toWinAnsi(value == null || value === '' ? '-' : value), size, false, valMaxW);
    this._ensure(leading * valLines.length);
    // key on first line
    const yStart = this.y;
    this.cur.push(`BT /F2 ${size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${yStart.toFixed(2)} Tm (${escPdf(keyStr)}) Tj ET`);
    // value lines
    for (let i = 0; i < valLines.length; i++) {
      const ly = yStart - i * leading;
      this.cur.push(`BT /F1 ${size} Tf 1 0 0 1 ${valX.toFixed(2)} ${ly.toFixed(2)} Tm (${escPdf(valLines[i])}) Tj ET`);
    }
    this.y = yStart - leading * valLines.length;
    return this;
  }

  // A two-column row (left label wide, right value). Used for crew / equipment
  // list rows so hours line up on the right. Both columns wrap independently.
  row(left, right, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const leading = size * 1.35;
    const rightW = opts.rightW || 90;
    const gap = 8;
    const leftMaxW = CONTENT_W - rightW - gap;
    const leftLines = wrap(toWinAnsi(left), size, false, leftMaxW);
    const rightStr = toWinAnsi(right == null ? '' : right);
    const rightX = PAGE_W - MARGIN - rightW;
    const n = leftLines.length;
    this._ensure(leading * n);
    const yStart = this.y;
    for (let i = 0; i < n; i++) {
      const ly = yStart - i * leading;
      this.cur.push(`BT /F1 ${size} Tf 1 0 0 1 ${MARGIN.toFixed(2)} ${ly.toFixed(2)} Tm (${escPdf(leftLines[i])}) Tj ET`);
    }
    if (rightStr) {
      // right value on the first line, right-column left-aligned within its box
      this.cur.push(`BT /F1 ${size} Tf 1 0 0 1 ${rightX.toFixed(2)} ${yStart.toFixed(2)} Tm (${escPdf(rightStr)}) Tj ET`);
    }
    this.y = yStart - leading * n;
    return this;
  }

  // Horizontal rule across the content width.
  rule(weight) {
    const w = weight || 0.5;
    this._ensure(w + 4);
    const yy = this.y + 2;
    this.cur.push(`${w} w ${MARGIN.toFixed(2)} ${yy.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${yy.toFixed(2)} l S`);
    this.y -= (w + 4);
    return this;
  }

  spacer(pts) { this.y -= (pts || 6); if (this.y < MARGIN) this._newPage(); return this; }

  // Serialize the whole document to a Uint8Array (a valid PDF 1.4 file).
  toBytes() {
    const enc = new TextEncoder();
    const objects = [];   // objects[i] = string body of object (i+1)
    const push = (body) => { objects.push(body); return objects.length; }; // returns obj number

    // Fonts (Helvetica + Helvetica-Bold), shared across pages.
    const fontRegular = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold    = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    // Reserve the Pages (catalog kids) object number.
    const pagesObjNum = objects.length + 1;
    push('');  // placeholder, filled after we know all page obj numbers

    const pageObjNums = [];
    for (const frags of this.pages) {
      const stream = frags.join('\n');
      const streamObjNum = push(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const pageObjNum = push(
        `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
        `/Contents ${streamObjNum} 0 R >>`
      );
      pageObjNums.push(pageObjNum);
    }

    // Fill the Pages tree object.
    objects[pagesObjNum - 1] =
      `<< /Type /Pages /Count ${pageObjNums.length} /Kids [${pageObjNums.map((n) => n + ' 0 R').join(' ')}] >>`;

    // Catalog.
    const catalogNum = push(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`);

    // ---- assemble the file with a correct xref table ----
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets[i] = out.length;
      out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefStart = out.length;
    out += `xref\n0 ${objects.length + 1}\n`;
    out += '0000000000 65535 f \n';
    for (let i = 0; i < objects.length; i++) {
      out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\n`;
    out += `startxref\n${xrefStart}\n%%EOF`;

    // Encode as Latin-1 bytes (the header + any WinAnsi content must be byte-exact).
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

// Convenience: base64 (standard, NOT url-safe) for a byte array — needed for the
// Graph sendMail contentBytes field.
export function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
