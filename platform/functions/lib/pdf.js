// Dependency-free PDF generator for the Cloudflare Pages Functions (Workers)
// runtime. The PF Platform deploy pipeline (deploy.sh -> `npx wrangler pages
// deploy .`) has NO package.json / node_modules / build step, so Functions cannot
// bundle npm packages (pdf-lib etc.) without changing that proven pipeline.
// Rather than take that risk, we emit a valid PDF 1.4 document directly.
//
// v2 (2026-07): BRANDED for Pier Foundations. Adds:
//   - RGB fill/stroke colour (so we can paint the azure header band, section
//     chips, and alternating section backgrounds in the PF palette).
//   - Filled rectangles.
//   - An EMBEDDED TrueType display font (Eurostile Extended, the PF wordmark /
//     heading font) as a Type0 / CIDFontType2 with Identity-H encoding. Text set
//     in the display font is encoded to 2-byte glyph IDs at write time -- the most
//     robust TrueType embedding path (no WinAnsi limits, no glyph re-mapping).
//     If the embed data is unavailable, display text falls back to Helvetica-Bold
//     so the file is NEVER broken by the branding.
//
// FONTS:
//   /F1 Helvetica            (body text)
//   /F2 Helvetica-Bold       (labels / bold body)
//   /F3 Eurostile Extended   (embedded display: wordmark + section titles)
//
// SECURITY: pure computation, no I/O, no eval, no network. Every Helvetica string
// is sanitized to WinAnsi + PDF-string-escaped. Display strings are emitted as hex
// GID strings, so they cannot break the content stream either.

import { EURO, EURO_TTF_B64 } from './eurostile-font.js';

const PAGE_W = 612;   // US Letter width  (8.5in * 72)
const PAGE_H = 792;   // US Letter height (11in * 72)
const MARGIN = 54;    // 0.75in margin
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---- PF brand palette (RGB 0..1) ------------------------------------------
export const PF = {
  azure:      rgb(0x00, 0x6D, 0xB0),
  azureDark:  rgb(0x00, 0x5A, 0x91),
  azureLight: rgb(0xE0, 0xF0, 0xFF),
  white:      rgb(0xFF, 0xFF, 0xFF),
  bg1:        rgb(0xF9, 0xFA, 0xFD),
  bg2:        rgb(0xF3, 0xF5, 0xF8),
  bg3:        rgb(0xE8, 0xEE, 0xF2),
  border:     rgb(0xC8, 0xD5, 0xDC),
  borderLt:   rgb(0xE2, 0xEA, 0xF0),
  heading:    rgb(0x00, 0x00, 0x00),
  body:       rgb(0x2B, 0x2F, 0x36),
  secondary:  rgb(0x5A, 0x63, 0x70),
  muted:      rgb(0x8A, 0x9A, 0xAB),
};
function rgb(r, g, b) { return [r / 255, g / 255, b / 255]; }
function col(c) { return `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`; }

// ---- Helvetica width tables (per 1000 units), WinAnsi 32..126 --------------
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function helvWidth(code, bold) {
  if (code < 32) return 0;
  const table = bold ? HELVB : HELV;
  if (code <= 126) return table[code - 32];
  return 556; // 127..255 fallback (wrap estimate only)
}

// Whether the embedded display font is usable this run.
const EURO_OK = !!(EURO && EURO.uni2gid && EURO_TTF_B64 && EURO_TTF_B64.length > 100);

// Display-font advance width (per 1000) for a code point, or a fallback.
function euroWidth(code) {
  if (!EURO_OK) return helvWidth(code, true);
  const gid = EURO.uni2gid[code];
  if (gid == null) return 600;
  const w = EURO.widths[gid];
  return (w == null) ? 600 : w;
}

// Measure a string at a size for a given font kind ('helv' | 'helvb' | 'euro').
function measure(str, size, kind) {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (kind === 'euro') w += euroWidth(c);
    else w += helvWidth(c, kind === 'helvb');
  }
  return (w / 1000) * size;
}

function toWinAnsi(str) {
  const s = String(str == null ? '' : str);
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0x2019 || c === 0x2018) { out += "'"; continue; }
    if (c === 0x201C || c === 0x201D) { out += '"'; continue; }
    if (c === 0x2013 || c === 0x2014) { out += '-'; continue; }
    if (c === 0x2026) { out += '...'; continue; }
    if (c === 0x00A0) { out += ' '; continue; }
    if (c === 9) { out += '    '; continue; }
    if (c === 10 || c === 13) { out += ' '; continue; }
    if (c >= 32 && c <= 255) { out += ch; continue; }
  }
  return out;
}

function escPdf(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Encode a string as a hex string of 2-byte glyph IDs for the embedded display
// font (Identity-H). Any code point not in the font maps to GID 0 (.notdef),
// which renders as blank rather than breaking the file. WinAnsi-normalize first
// so curly quotes/dashes become ASCII the font actually has.
function euroHex(str) {
  const s = toWinAnsi(str);
  let hex = '';
  for (let i = 0; i < s.length; i++) {
    const gid = EURO_OK ? (EURO.uni2gid[s.charCodeAt(i)] || 0) : 0;
    hex += (gid & 0xffff).toString(16).padStart(4, '0');
  }
  return hex;
}

function wrap(str, size, kind, maxW) {
  const words = str.split(/\s+/).filter((w) => w.length);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (measure(trial, size, kind) <= maxW) { line = trial; continue; }
    if (line) { lines.push(line); line = ''; }
    if (measure(word, size, kind) <= maxW) { line = word; continue; }
    let chunk = '';
    for (const ch of word) {
      if (measure(chunk + ch, size, kind) <= maxW) { chunk += ch; }
      else { if (chunk) lines.push(chunk); chunk = ch; }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export class PdfDoc {
  constructor() {
    this.pages = [];
    this.cur = null;
    this.y = 0;
    this._newPage();
  }

  _newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = PAGE_H - MARGIN;
  }

  _ensure(need) {
    if (this.y - need < MARGIN) { this._newPage(); return true; }
    return false;
  }

  // ---- primitives --------------------------------------------------------
  // A filled rectangle in PDF user space (origin bottom-left). x,y = lower-left.
  fillRect(x, y, w, h, color) {
    this.cur.push(`${col(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }

  // Draw one text line. kind: 'helv' | 'helvb' | 'euro'. color optional.
  _draw(text, size, kind, x, baselineY, color) {
    const c = color ? `${col(color)} rg ` : '';
    if (kind === 'euro' && EURO_OK) {
      this.cur.push(`${c}BT /F3 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${baselineY.toFixed(2)} Tm <${euroHex(text)}> Tj ET`);
    } else {
      const font = (kind === 'euro' || kind === 'helvb') ? '/F2' : '/F1';
      this.cur.push(`${c}BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${baselineY.toFixed(2)} Tm (${escPdf(toWinAnsi(text))}) Tj ET`);
    }
  }

  // ---- content blocks ----------------------------------------------------
  // Body text (word-wrapped). opts: {size, bold, color, leading, indent}
  text(str, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const kind = opts.bold ? 'helvb' : 'helv';
    const leading = opts.leading || size * 1.4;
    const indent = opts.indent || 0;
    const x = MARGIN + indent;
    const maxW = CONTENT_W - indent;
    const color = opts.color || PF.body;
    const segments = String(str == null ? '' : str).split(/\r?\n/);
    for (const seg of segments) {
      const lines = wrap(toWinAnsi(seg), size, kind, maxW);
      for (const ln of lines) {
        this._ensure(leading);
        this.y -= leading;
        this._draw(ln, size, kind, x, this.y + leading * 0.25, color);
      }
    }
    return this;
  }

  // The azure brand header band on page 1: wordmark + title in white.
  brandHeader(title, subtitle) {
    const bandH = 74;
    const top = PAGE_H;                 // band hugs the very top edge
    const bandY = top - bandH;
    // full-bleed azure band
    this.fillRect(0, bandY, PAGE_W, bandH, PF.azure);
    // a thin darker azure base line for depth
    this.fillRect(0, bandY, PAGE_W, 4, PF.azureDark);

    // wordmark (Eurostile) top-left, white
    const wm = 'PIER FOUNDATIONS';
    this._draw(wm, 15, 'euro', MARGIN, bandY + bandH - 26, PF.white);
    // tagline under the wordmark
    this._draw('VIBRATORY STONE COLUMNS', 7.5, 'helvb', MARGIN, bandY + bandH - 40, PF.azureLight);

    // report title (Eurostile) lower-left, white, larger
    this._draw(title, 17, 'euro', MARGIN, bandY + 16, PF.white);

    // right-aligned subtitle (project) in white
    if (subtitle) {
      const w = measure(toWinAnsi(subtitle), 10, 'helvb');
      this._draw(subtitle, 10, 'helvb', PAGE_W - MARGIN - w, bandY + 18, PF.white);
    }

    // move cursor below the band with a little breathing room
    this.y = bandY - 16;
    return this;
  }

  // A section heading rendered as a light-azure chip with an azure Eurostile
  // title and an azure rule beneath. opts: {top}
  heading(str, opts) {
    opts = opts || {};
    const size = 12;
    const chipH = 20;
    const gapTop = opts.top == null ? 10 : opts.top;
    this.y -= gapTop;
    // page-break guard: header + a couple of body lines should fit
    if (this.y - (chipH + 24) < MARGIN) { this._newPage(); this.y -= 6; }
    const chipY = this.y - chipH;
    // light-azure chip spanning the content width
    this.fillRect(MARGIN, chipY, CONTENT_W, chipH, PF.azureLight);
    // azure title inside the chip (Eurostile)
    this._draw(str, size, 'euro', MARGIN + 8, chipY + 6, PF.azure);
    this.y = chipY - 2;
    // azure rule under the chip
    this.rule(1.2, PF.azure);
    this.y -= 4;
    return this;
  }

  // Cover-title block was folded into brandHeader; keep title() as an alias that
  // just paints the brand header (back-compat with the renderer call site).
  title(str, subtitle) { return this.brandHeader(str, subtitle); }

  // Key : value line. Label in secondary colour + bold, value in body colour.
  keyVal(key, value, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const leading = size * 1.5;
    const keyStr = toWinAnsi((key || '') + ':');
    const keyW = measure(keyStr, size, 'helvb');
    const gap = 6;
    const valX = MARGIN + keyW + gap;
    const valMaxW = PAGE_W - MARGIN - valX;
    const valLines = wrap(toWinAnsi(value == null || value === '' ? '-' : value), size, 'helv', valMaxW);
    this._ensure(leading * valLines.length);
    this.y -= leading;
    const yStart = this.y + leading * 0.2;
    this._draw(keyStr, size, 'helvb', MARGIN, yStart, PF.secondary);
    for (let i = 0; i < valLines.length; i++) {
      const ly = yStart - i * leading;
      this._draw(valLines[i], size, 'helv', valX, ly, PF.body);
      if (i > 0) this.y -= leading;
    }
    return this;
  }

  // Two-column row (left label, right value). opts: {rightW, size, color, rightColor, indent}
  row(left, right, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const leading = size * 1.45;
    const rightW = opts.rightW || 90;
    const gap = 8;
    const indent = opts.indent || 0;
    const leftX = MARGIN + indent;
    const leftMaxW = CONTENT_W - rightW - gap - indent;
    const leftLines = wrap(toWinAnsi(left), size, 'helv', leftMaxW);
    const rightStr = toWinAnsi(right == null ? '' : right);
    const rightX = PAGE_W - MARGIN - rightW;
    const n = leftLines.length;
    this._ensure(leading * n);
    this.y -= leading;
    const yStart = this.y + leading * 0.2;
    for (let i = 0; i < n; i++) {
      const ly = yStart - i * leading;
      this._draw(leftLines[i], size, 'helv', leftX, ly, opts.color || PF.body);
      if (i > 0) this.y -= leading;
    }
    if (rightStr) {
      this._draw(rightStr, size, 'helvb', rightX, yStart, opts.rightColor || PF.azureDark);
    }
    return this;
  }

  // Horizontal rule. weight + optional colour (default light border).
  rule(weight, color) {
    const w = weight || 0.5;
    this._ensure(w + 4);
    this.y -= (w + 4);
    const yy = this.y + 2;
    this.cur.push(`${col(color || PF.borderLt)} RG ${w} w ${MARGIN.toFixed(2)} ${yy.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${yy.toFixed(2)} l S`);
    return this;
  }

  spacer(pts) { this.y -= (pts || 6); if (this.y < MARGIN) this._newPage(); return this; }

  // ---- serialize ---------------------------------------------------------
  toBytes() {
    const enc = new TextEncoder();
    // We build objects as either strings (ASCII/Latin-1) or {bin:Uint8Array} for
    // the raw font stream, then serialize byte-exact.
    const objects = [];
    const push = (body) => { objects.push(body); return objects.length; };

    const fontRegular = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold    = push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    // ---- embedded Eurostile (Type0 / CIDFontType2, Identity-H) -------------
    let fontDisplayNum = fontBold; // fallback: if no embed, /F3 -> Helvetica-Bold
    if (EURO_OK) {
      const ttfBytes = base64ToBytes(EURO_TTF_B64);
      // FontFile2 stream (the raw TTF). /Length1 = uncompressed length.
      const fontFileNum = pushBin(objects, push,
        `<< /Length ${ttfBytes.length} /Length1 ${ttfBytes.length} >>`, ttfBytes);

      const bbox = EURO.bbox || [0, -300, 1000, 1000];
      const descriptorNum = push(
        `<< /Type /FontDescriptor /FontName /EurostileExtended ` +
        `/Flags ${EURO.flags || 32} /FontBBox [${bbox.join(' ')}] ` +
        `/ItalicAngle ${EURO.italicAngle || 0} /Ascent ${EURO.ascent} /Descent ${EURO.descent} ` +
        `/CapHeight ${EURO.capHeight} /StemV ${EURO.stemv || 90} /FontFile2 ${fontFileNum} 0 R >>`
      );

      // W array: per-GID widths. Build compact [gid [w] gid2 [w2] ...].
      const wEntries = [];
      const gids = Object.keys(EURO.widths).map((k) => parseInt(k, 10)).sort((a, b) => a - b);
      for (const gid of gids) wEntries.push(`${gid}[${EURO.widths[gid]}]`);
      const cidFontNum = push(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /EurostileExtended ` +
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/FontDescriptor ${descriptorNum} 0 R /CIDToGIDMap /Identity ` +
        `/DW 600 /W [${wEntries.join(' ')}] >>`
      );

      // ToUnicode CMap: maps each GID back to its Unicode code point so the
      // Eurostile (display) text remains SELECTABLE / SEARCHABLE / accessible.
      // Without this, Identity-H text extracts as garbage. Built from uni2gid.
      const bf = [];
      for (const cpStr of Object.keys(EURO.uni2gid)) {
        const cp = parseInt(cpStr, 10);
        const gid = EURO.uni2gid[cpStr] & 0xffff;
        bf.push(`<${gid.toString(16).padStart(4, '0')}> <${cp.toString(16).padStart(4, '0')}>`);
      }
      // bfchar blocks are capped at 100 entries each -> chunk.
      let bfBlocks = '';
      for (let i = 0; i < bf.length; i += 100) {
        const chunk = bf.slice(i, i + 100);
        bfBlocks += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
      }
      const cmapStr =
        '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
        '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
        bfBlocks +
        'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
      const toUniNum = push(`<< /Length ${enc.encode(cmapStr).length} >>\nstream\n${cmapStr}\nendstream`);

      fontDisplayNum = push(
        `<< /Type /Font /Subtype /Type0 /BaseFont /EurostileExtended ` +
        `/Encoding /Identity-H /DescendantFonts [${cidFontNum} 0 R] /ToUnicode ${toUniNum} 0 R >>`
      );
    }

    const pagesObjNum = objects.length + 1;
    push('');

    const pageObjNums = [];
    for (const frags of this.pages) {
      const stream = frags.join('\n');
      const streamObjNum = push(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const pageObjNum = push(
        `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontDisplayNum} 0 R >> >> ` +
        `/Contents ${streamObjNum} 0 R >>`
      );
      pageObjNums.push(pageObjNum);
    }

    objects[pagesObjNum - 1] =
      `<< /Type /Pages /Count ${pageObjNums.length} /Kids [${pageObjNums.map((n) => n + ' 0 R').join(' ')}] >>`;

    const catalogNum = push(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`);

    // ---- byte-exact assembly with a correct xref table --------------------
    const chunks = [];   // array of Uint8Array
    let length = 0;
    const write = (u8) => { chunks.push(u8); length += u8.length; };
    const writeStr = (s) => { write(latin1Bytes(s)); };

    writeStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets[i] = length;
      const obj = objects[i];
      if (obj && obj.bin) {
        writeStr(`${i + 1} 0 obj\n${obj.head}\nstream\n`);
        write(obj.bin);
        writeStr('\nendstream\nendobj\n');
      } else {
        writeStr(`${i + 1} 0 obj\n${obj}\nendobj\n`);
      }
    }
    const xrefStart = length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 0; i < objects.length; i++) {
      xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\n`;
    xref += `startxref\n${xrefStart}\n%%EOF`;
    writeStr(xref);

    // concat
    const out = new Uint8Array(length);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

// Store a binary stream object: we keep {head, bin} so toBytes writes the dict
// then the raw bytes then endstream. Returns the object number.
function pushBin(objects, push, head, bin) {
  objects.push({ head, bin });
  return objects.length;
}

function latin1Bytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

// Standard base64 for the Graph sendMail contentBytes field.
export function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
