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
import { PF_LOGO, PF_LOGO_JPG_B64 } from './pf-logo.js';

// Whether the embedded header logo is usable this run.
const LOGO_OK = !!(PF_LOGO && PF_LOGO.width && PF_LOGO_JPG_B64 && PF_LOGO_JPG_B64.length > 100);

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
  charcoal:   rgb(0x2B, 0x2F, 0x36),  // PF dark text = the header band background (Round 4)
  lightGrey:  rgb(0xC8, 0xD5, 0xDC),  // muted light label text on charcoal
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

// ---- Photo thumbnail constants (shared across all three field report PDFs) ---
// 2 per row, left-aligned, proportional scaling.  Content width is 504pt;
// 2 × 240 + 12 gap = 492pt (leaves a 12pt right margin).
export const PHOTO_THUMB_W    = 240;   // pts per thumbnail
export const PHOTO_THUMB_GAP_X = 12;   // horizontal gap between thumbnails
export const PHOTO_THUMB_GAP_Y =  8;   // vertical gap between rows
export const PHOTO_MAX_THUMB_H = 200;  // hard cap on thumbnail height
export const PHOTO_PER_ROW    =  2;

// ---- Minimal PNG parser (type 0 = grayscale, type 2 = RGB only) ----------
// Returns { kind:'png', w, h, bitDepth, colors, colorSpace, idat:Uint8Array }
// or null if the PNG cannot be embedded (unsupported type, malformed, etc.).
// PDF /FlateDecode with /Predictor 15 can consume the raw IDAT data directly,
// including the PNG per-scanline filter bytes.
function _parsePng(b64) {
  try {
    const bytes = base64ToBytes(b64);
    // PNG signature: 137 80 78 71 13 10 26 10
    if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78) return null;
    let offset = 8;
    let w = 0, h = 0, bitDepth = 0, colorType = 0;
    const idatParts = [];
    while (offset + 12 <= bytes.length) {
      const len = ((bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3]) >>> 0;
      const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
      const ds   = offset + 8;
      if (type === 'IHDR') {
        w = ((bytes[ds] << 24) | (bytes[ds+1] << 16) | (bytes[ds+2] << 8) | bytes[ds+3]) >>> 0;
        h = ((bytes[ds+4] << 24) | (bytes[ds+5] << 16) | (bytes[ds+6] << 8) | bytes[ds+7]) >>> 0;
        bitDepth = bytes[ds+8];
        colorType = bytes[ds+9];
      } else if (type === 'IDAT') {
        idatParts.push(bytes.slice(ds, ds + len));
      } else if (type === 'IEND') { break; }
      offset = ds + len + 4; // +4 CRC
    }
    // Support: 8-bit grayscale (type 0) and 8-bit RGB (type 2) only.
    if (bitDepth !== 8 || (colorType !== 0 && colorType !== 2)) return null;
    if (!w || !h || !idatParts.length) return null;
    const totalLen = idatParts.reduce((s, c) => s + c.length, 0);
    const idat = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of idatParts) { idat.set(c, pos); pos += c.length; }
    return {
      kind: 'png',
      w, h,
      bitDepth,
      colors:      colorType === 0 ? 1 : 3,
      colorSpace:  colorType === 0 ? '/DeviceGray' : '/DeviceRGB',
      idat,
    };
  } catch { return null; }
}

export class PdfDoc {
  constructor() {
    this.pages = [];
    this.cur = null;
    this.y = 0;
    this._dynImages = []; // [{kind, ...}] -- registered via addImage() / addJpeg()
    this._newPage();
  }

  // Register an image for embedding from a data URL or raw base64.
  // Supports JPEG (image/jpeg) and grayscale/RGB PNG (image/png).
  // Returns the image index (>= 0) on success, or -1 if the format cannot be
  // embedded (unsupported PNG type, malformed data, etc.).
  // Use placeImage() to lay out at a given position; idx -1 draws a placeholder.
  addImage(dataOrB64, w, h) {
    let b64 = dataOrB64 || '';
    let mime = 'image/jpeg';
    if (b64.startsWith('data:')) {
      const sc = b64.indexOf(';');
      const cm = b64.indexOf(',');
      if (sc > 5 && cm > sc) mime = b64.slice(5, sc).toLowerCase();
      b64 = cm >= 0 ? b64.slice(cm + 1) : '';
    }
    if (!b64) return -1;
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      this._dynImages.push({ kind: 'jpeg', b64, w: Math.max(w || 1, 1), h: Math.max(h || 1, 1) });
      return this._dynImages.length - 1;
    }
    if (mime === 'image/png') {
      const parsed = _parsePng(b64);
      if (!parsed) return -1;
      this._dynImages.push(parsed);
      return this._dynImages.length - 1;
    }
    return -1; // unsupported MIME type
  }

  // Backward-compat: addJpeg() accepted raw base64 (no data: prefix) with w/h.
  addJpeg(b64, w, h) {
    // Strip data: prefix if present (called from EI with raw b64).
    return this.addImage(b64, w, h);
  }

  // Place a registered image at (x, this.y - thumbH).
  // If idx < 0 (unsupported or missing), renders a grey placeholder box.
  // Advances doc.y by thumbH + vGap. Never splits across page break (caller must
  // call _ensure() before grouping rows; placeImage handles single-image breaks).
  placeImage(idx, x, thumbW, thumbH, vGap) {
    vGap = vGap == null ? 0 : vGap;
    this._ensure(thumbH + vGap);
    const yBottom = this.y - thumbH;
    if (idx < 0) {
      // Grey placeholder with border + label.
      this.fillRect(x, yBottom, thumbW, thumbH, PF.bg3);
      this.cur.push(
        `${col(PF.border)} RG 0.5 w ${x.toFixed(2)} ${yBottom.toFixed(2)} ${thumbW.toFixed(2)} ${thumbH.toFixed(2)} re S`
      );
      this._draw('Photo unavailable', 8, 'helv', x + 4, yBottom + thumbH / 2 - 4, PF.muted);
    } else {
      this.cur.push(
        `q ${thumbW.toFixed(2)} 0 0 ${thumbH.toFixed(2)} ${x.toFixed(2)} ${yBottom.toFixed(2)} cm /DImg${idx} Do Q`
      );
    }
    this.y = yBottom - vGap;
  }

  // Backward-compat: placeJpeg() used by equip-inspection-doc.js internals.
  placeJpeg(idx, x, thumbW, thumbH, vGap) { return this.placeImage(idx, x, thumbW, thumbH, vGap); }

  // Embed a photo array (any mix of JPEG / RGB-PNG) in a 2-per-row grid at the
  // current flow position.  Each entry: { data, w, h } or { b64, w, h }.
  //   data  : 'data:image/jpeg;base64,...' or 'data:image/png;base64,...' or raw b64
  //   w, h  : pixel dimensions (used for aspect-ratio scaling)
  // Missing / unsupported images render as a placeholder box (fail-soft).
  // The grid never splits a photo row across a page break.
  embedPhotos(photos) {
    if (!Array.isArray(photos) || !photos.length) return this;
    this.spacer(6);
    let pending = [];
    const W     = PHOTO_THUMB_W;
    const GAP_X = PHOTO_THUMB_GAP_X;
    const GAP_Y = PHOTO_THUMB_GAP_Y;
    const MAX_H = PHOTO_MAX_THUMB_H;
    const PER   = PHOTO_PER_ROW;

    const flushRow = () => {
      if (!pending.length) return;
      const rowH = Math.max(...pending.map((r) => r.dispH));
      // Ensure the whole row fits before starting; forces a page break if needed.
      this._ensure(rowH + GAP_Y);
      const yBase = this.y - rowH;
      for (let j = 0; j < pending.length; j++) {
        const { idx, dispH } = pending[j];
        const x = MARGIN + j * (W + GAP_X);
        if (idx >= 0) {
          this.cur.push(
            `q ${W.toFixed(2)} 0 0 ${dispH.toFixed(2)} ${x.toFixed(2)} ${yBase.toFixed(2)} cm /DImg${idx} Do Q`
          );
        } else {
          this.fillRect(x, yBase, W, dispH, PF.bg3);
          this.cur.push(
            `${col(PF.border)} RG 0.5 w ${x.toFixed(2)} ${yBase.toFixed(2)} ${W.toFixed(2)} ${dispH.toFixed(2)} re S`
          );
          this._draw('Photo unavailable', 8, 'helv', x + 4, yBase + dispH / 2 - 4, PF.muted);
        }
      }
      this.y = yBase - GAP_Y;
      pending = [];
    };

    for (const p of photos) {
      const placeholderH = Math.min(W, MAX_H);
      if (!p || (!p.data && !p.b64)) {
        pending.push({ idx: -1, dispH: placeholderH });
        if (pending.length >= PER) flushRow();
        continue;
      }
      try {
        const raw = p.data || p.b64 || '';
        const safeW = Math.max(p.w || 1, 1);
        const safeH = Math.max(p.h || 1, 1);
        const aspect = safeH / safeW;
        const dispH  = Math.min(Math.round(W * aspect), MAX_H) || MAX_H;
        const idx    = this.addImage(raw, safeW, safeH);
        pending.push({ idx, dispH });
      } catch {
        pending.push({ idx: -1, dispH: placeholderH });
      }
      if (pending.length >= PER) flushRow();
    }
    flushRow();
    this.spacer(2);
    return this;
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

  // Draw the header logo (Image XObject /Im0) at (x, y) lower-left, scaled to
  // w x h user-space points via the cm matrix. Wrapped in q/Q so the image CTM
  // does not leak into subsequent text ops. Only valid when LOGO_OK; the header
  // guards the call. Sets a flag so toBytes() emits the XObject + resource.
  drawImage(x, y, w, h) {
    this._usesLogo = true;
    this.cur.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`);
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
  // Round 5 (Derek): default body text is BLACK. Callers that want grey (e.g. the
  // footer) pass an explicit color.
  text(str, opts) {
    opts = opts || {};
    const size = opts.size || 10;
    const kind = opts.bold ? 'helvb' : 'helv';
    const leading = opts.leading || size * 1.4;
    const indent = opts.indent || 0;
    const x = MARGIN + indent;
    const maxW = CONTENT_W - indent;
    const color = opts.color || PF.heading;
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

  // The azure brand masthead on page 1. LEFT: wordmark + tagline + report title.
  // RIGHT: a labeled metadata block (label:value pairs) filling the right side of
  // the band, so the job info lives IN the header (not duplicated in the body).
  //   title  : the report title (e.g. "Daily Field Report")
  //   meta   : array of { label, value } rendered right-aligned as a block. The
  //            caller decides the field order (project number goes among these).
  //
  // Title / metadata collision guard (2026-10-28):
  //   The metadata block bounds are pre-computed first so we know its left edge
  //   before placing the title.  If the title would run into the metadata block,
  //   it wraps to two lines at 13pt (the same approach equip-inspection-doc.js
  //   already uses manually).  A guaranteed 20pt gap is maintained between the
  //   title's right edge and the metadata block's leftmost character.
  brandHeader(title, meta) {
    meta = Array.isArray(meta) ? meta.filter((m) => m && (m.label || m.value)) : [];
    // CHARCOAL masthead (Round 4). Taller band so the logo lockup fits cleanly.
    const bandH = 104;
    const bandY = PAGE_H - bandH;
    // full-bleed charcoal band (#2B2F36) + a thin azure base line for a brand cue
    this.fillRect(0, bandY, PAGE_W, bandH, PF.charcoal);
    this.fillRect(0, bandY, PAGE_W, 3, PF.azure);

    const bandCenterY = bandY + bandH / 2;

    // ---- Pre-compute metadata block dimensions FIRST (needed for title placement) ----
    const mSize     = 9.5;
    const mLead     = 15;
    const rightEdge = PAGE_W - MARGIN;  // 558
    const metaGap   = 6;               // gap between label col and value col
    let labelW = 0, valueW = 0;
    const metaRows = meta.map((m) => {
      const label = toWinAnsi((m.label || '') + ':');
      const value = toWinAnsi(m.value == null || m.value === '' ? '-' : String(m.value));
      labelW = Math.max(labelW, measure(label, mSize, 'helvb'));
      valueW = Math.max(valueW, measure(value, mSize, 'helvb'));
      return { label, value };
    });
    const maxBlockW = rightEdge - (MARGIN + 275); // ≈229pt: room for logo+title on left
    if (labelW + metaGap + valueW > maxBlockW) {
      valueW = Math.max(60, maxBlockW - metaGap - labelW);
    }
    const labelRightX = rightEdge - valueW - metaGap;
    const valueLeftX  = rightEdge - valueW;
    // Leftmost pixel any metadata character can reach.
    const metaLeft = meta.length ? (labelRightX - labelW) : rightEdge;

    // ---- LEFT: PF logo lockup, VERTICALLY CENTERED in the band ----
    let logoRightX = MARGIN;
    if (LOGO_OK) {
      const vPad = 20;
      let logoH = bandH - vPad * 2;
      let logoW = PF_LOGO.width * (logoH / PF_LOGO.height);
      const maxLogoW = 190;
      if (logoW > maxLogoW) { const s = maxLogoW / logoW; logoW = maxLogoW; logoH = logoH * s; }
      const logoX = MARGIN - 2;
      const logoY = bandCenterY - logoH / 2;
      this.drawImage(logoX, logoY, logoW, logoH);
      logoRightX = logoX + logoW;
    } else {
      const wmSize = 15;
      this._draw('PIER FOUNDATIONS', wmSize, 'euro', MARGIN, bandCenterY - wmSize * 0.35, PF.white);
      logoRightX = MARGIN + measure('PIER FOUNDATIONS', wmSize, 'euro');
    }

    // ---- Report title (white Eurostile), between logo and metadata block ----
    // Guaranteed gap: title right edge must not come within 20pt of metaLeft.
    const titleX        = logoRightX + 18;
    const MIN_TITLE_GAP = 20;
    const maxTitleW     = metaLeft - MIN_TITLE_GAP - titleX;

    if (title) {
      const BIG  = 16;
      const SMALL = 13;
      if (maxTitleW > 0 && measure(title, BIG, 'euro') <= maxTitleW) {
        // Fits single line at full size.
        this._draw(title, BIG, 'euro', titleX, bandCenterY - BIG * 0.35, PF.white);
      } else {
        // Wrap to two lines at smaller size.
        const words = toWinAnsi(title).split(/\s+/).filter(Boolean);
        let split = 1;
        for (let i = 1; i < words.length; i++) {
          const l1 = words.slice(0, i).join(' ');
          const l2 = words.slice(i).join(' ');
          const capW = maxTitleW > 0 ? maxTitleW : (metaLeft - titleX - 4);
          if (measure(l1, SMALL, 'euro') <= capW && measure(l2, SMALL, 'euro') <= capW) {
            split = i; break;
          }
        }
        if (split === 1 && words.length > 1) split = Math.ceil(words.length / 2);
        this._draw(words.slice(0, split).join(' '), SMALL, 'euro', titleX, bandCenterY + SMALL * 0.65, PF.white);
        this._draw(words.slice(split).join(' '),    SMALL, 'euro', titleX, bandCenterY - SMALL * 0.65, PF.white);
      }
    }

    // ---- RIGHT: labeled metadata block (light-grey labels, white values) ----
    if (meta.length) {
      const blockH = meta.length * mLead;
      let by = bandY + (bandH - blockH) / 2 + blockH - mLead + 3;
      for (const r of metaRows) {
        const lw = measure(r.label, mSize, 'helvb');
        this._draw(r.label, mSize, 'helvb', labelRightX - lw, by, PF.lightGrey);
        let v = r.value;
        while (v.length > 1 && measure(v, mSize, 'helvb') > valueW) v = v.slice(0, -1);
        if (v !== r.value && v.length > 1) v = v.slice(0, -1) + '.';
        this._draw(v, mSize, 'helvb', valueLeftX, by, PF.white);
        by -= mLead;
      }
    }

    // cursor below the band with breathing room; body starts at first section
    this.y = bandY - 18;
    return this;
  }

  // A section heading rendered as a neutral LIGHT-GREY chip with a BLACK Eurostile
  // title and a neutral grey rule beneath (Round 5: no blue in the body). opts: {top}
  heading(str, opts) {
    opts = opts || {};
    const size = 12;
    const chipH = 20;
    const gapTop = opts.top == null ? 10 : opts.top;
    this.y -= gapTop;
    // page-break guard: header + a couple of body lines should fit
    if (this.y - (chipH + 24) < MARGIN) { this._newPage(); this.y -= 6; }
    const chipY = this.y - chipH;
    // neutral light-grey chip spanning the content width (was light-azure)
    this.fillRect(MARGIN, chipY, CONTENT_W, chipH, PF.bg2);
    // BLACK title inside the chip (Eurostile)
    this._draw(str, size, 'euro', MARGIN + 8, chipY + 6, PF.heading);
    this.y = chipY - 2;
    // neutral medium-grey rule under the chip (was azure)
    this.rule(1.2, PF.border);
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

  // Two-column row (left label, right value).
  // opts: {rightW, size, color, rightColor, indent, divider}
  //   divider: true → draw a thin grey separator line at the bottom of the row,
  //            matching table()'s row separator style (used in EI section items).
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
    // Optional thin separator matching table()'s row dividers.
    if (opts.divider) {
      this.cur.push(
        `${col(PF.border)} RG 0.5 w ${MARGIN.toFixed(2)} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`
      );
    }
    return this;
  }

  // A clean data TABLE: rows of { label, value } with a LEFT-aligned label column
  // and a RIGHT-ALIGNED value column, plus subtle ZEBRA striping so multi-row
  // areas are easy to scan. Pro field-report look (Fieldwire/Procore/Raken).
  //
  // Round 4 (Derek): values are RIGHT-ALIGNED to a single shared right edge
  // (VALUE_RIGHT_X = the content right margin) instead of per-cell centered, so
  // the whole value column lines up "going up and down the page". Every table in
  // the document shares the same right edge, so Production/Crew/Equipment/
  // Maintenance values all align on one vertical axis.
  //   valueW      : reserved width (pt) of the value column (kept for the label
  //                 wrap budget; alignment itself is to the shared right edge)
  //   size        : font size (default 10)
  //   rowH        : row height (default size*1.9)
  //   labelColor  : label text colour (default PF.heading = black; Round 5)
  //   valueColor  : value text colour (default PF.heading = black bold; Round 5)
  //   subLabels   : Set of labels to render as a bold sub-heading row (no value,
  //                 no stripe) -- used for "Owned"/"Rental" group headers.
  table(rows, opts) {
    opts = opts || {};
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return this;
    const size = opts.size || 10;
    const rowH = opts.rowH || size * 1.9;
    const valueW = opts.valueW || 130;
    const gap = 10;
    const labelX = MARGIN + 8;                       // small inset from the stripe edge
    // SHARED right edge for every value in every table: the content right margin,
    // pulled in a touch so values do not kiss the zebra edge.
    const valueRightX = PAGE_W - MARGIN - 8;
    const labelMaxW = CONTENT_W - valueW - gap - 16;
    // Round 5 (Derek): BLACK body text, no blue. Labels + values default black.
    const labelColor = opts.labelColor || PF.heading;
    const valueColor = opts.valueColor || PF.heading;
    const subLabels = opts.subLabels || null;

    for (const r of rows) {
      const rawLabel = String(r.label == null ? '' : r.label);
      const isSub = subLabels && subLabels.has(rawLabel) && (r.value == null || r.value === '');

      // ---- pre-compute label (clipped), value, and whether to stack -----------
      // Done before _ensure() so we can pass the correct total row height.
      let label = toWinAnsi(rawLabel);
      const indent = r.indent ? r.indent : 0;
      const lx = labelX + indent;
      const lMax = labelMaxW - indent;
      if (!isSub && measure(label, size, 'helv') > lMax) {
        while (label.length > 1 && measure(label + '...', size, 'helv') > lMax) label = label.slice(0, -1);
        label = label + '...';
      }

      const rawValue = isSub ? '' : toWinAnsi(r.value == null ? '' : String(r.value));
      const vLeading = size * 1.4;
      let stacked = false;
      let stackedLines = null;
      let totalH = rowH;

      if (rawValue) {
        const vw = measure(rawValue, size, 'helvb');
        // Overlap check: if the right-aligned value would start left of the label's
        // right edge (+gap), switch to a stacked layout (label line, then value
        // wrapped below it, full-width and left-aligned).
        const lActualW = measure(label, size, 'helv');
        // Stack when the right-aligned value would physically overlap the drawn
        // label text (2 pt safety margin to absorb sub-pixel rounding).
        if (valueRightX - vw < lx + lActualW + 2) {
          stacked = true;
          stackedLines = wrap(rawValue, size, 'helv', CONTENT_W - 16);
          totalH = rowH + stackedLines.length * vLeading + 3;
        }
      }

      // page-break guard with the correct total height
      if (this._ensure(totalH)) { /* new page: no header repeat needed for a report */ }
      const rowBot = this.y - totalH;

      if (isSub) {
        // group sub-heading: BLACK bold (Round 5), no value
        this._draw(toWinAnsi(rawLabel), size - 0.5, 'helvb',
          MARGIN, rowBot + (rowH - size) / 2 + size * 0.2, PF.heading);
        this.y = rowBot;
        continue;
      }

      // Round 6 (Derek): NO row background fill. Rows sit on plain white and are
      // delineated by a thin grey separator LINE under each row instead.

      // label baseline: vertically centred in the label portion (top rowH of totalH)
      const baseline = (this.y - rowH) + (rowH - size) / 2 + size * 0.22;
      this._draw(label, size, 'helv', lx, baseline, labelColor);

      if (stacked) {
        // Value wraps below the label line, left-aligned, plain weight so it reads
        // as a continuation of the label rather than a competing right column.
        let vy = baseline - vLeading;
        for (const vl of stackedLines) {
          this._draw(vl, size, 'helv', lx, vy, valueColor);
          vy -= vLeading;
        }
      } else if (rawValue) {
        // value (RIGHT-ALIGNED to the shared right edge, bold) so the value column
        // lines up top-to-bottom across every section.
        const vw = measure(rawValue, size, 'helvb');
        this._draw(rawValue, size, 'helvb', valueRightX - vw, baseline, valueColor);
      }

      // thin grey separator LINE under each data row (#C8D5DC, 0.5pt) -- the sole
      // row delineation now that the zebra fill is removed.
      this.cur.push(`${col(PF.border)} RG 0.5 w ${MARGIN.toFixed(2)} ${rowBot.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${rowBot.toFixed(2)} l S`);

      this.y = rowBot;
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

    // ---- embedded header logo (DCTDecode Image XObject /Im0) ---------------
    // Baseline JPEG, 3-component -> DeviceRGB. The raw JPEG bytes go straight into
    // the stream with /Filter /DCTDecode (no decode needed). Referenced from the
    // page Resources /XObject and drawn via `cm ... /Im0 Do` in brandHeader.
    let logoObjNum = 0;
    if (LOGO_OK) {
      const jpg = base64ToBytes(PF_LOGO_JPG_B64);
      logoObjNum = pushBin(objects, push,
        `<< /Type /XObject /Subtype /Image /Width ${PF_LOGO.width} /Height ${PF_LOGO.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`,
        jpg);
    }
    // ---- dynamic image XObjects (/DImg0, /DImg1, ...) -- JPEG + PNG ---------
    const dynImgNums = [];
    for (const img of this._dynImages) {
      if (img.kind === 'jpeg') {
        const jpgBytes = base64ToBytes(img.b64);
        const n = pushBin(objects, push,
          `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.length} >>`,
          jpgBytes);
        dynImgNums.push(n);
      } else if (img.kind === 'png') {
        // RGB/grayscale PNG: embed raw IDAT bytes with /FlateDecode + Predictor 15
        // (the PNG per-scanline filter bytes are handled natively by PDF viewers).
        const decParms =
          `/Predictor 15 /Colors ${img.colors} /BitsPerComponent ${img.bitDepth} /Columns ${img.w}`;
        const n = pushBin(objects, push,
          `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
          `/ColorSpace ${img.colorSpace} /BitsPerComponent ${img.bitDepth} ` +
          `/Filter /FlateDecode /DecodeParms << ${decParms} >> /Length ${img.idat.length} >>`,
          img.idat);
        dynImgNums.push(n);
      }
    }
    let xobjDict = logoObjNum ? `/Im0 ${logoObjNum} 0 R` : '';
    for (let di = 0; di < dynImgNums.length; di++) {
      xobjDict += ` /DImg${di} ${dynImgNums[di]} 0 R`;
    }
    const xobjRes = xobjDict ? ` /XObject << ${xobjDict} >>` : '';

    const pagesObjNum = objects.length + 1;
    push('');

    const pageObjNums = [];
    for (const frags of this.pages) {
      const stream = frags.join('\n');
      const streamObjNum = push(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
      const pageObjNum = push(
        `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontDisplayNum} 0 R >>${xobjRes} >> ` +
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
