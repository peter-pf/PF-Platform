#!/usr/bin/env python3
"""No-browser self-check for the Pier Foundations marketing site (site/) after the official-asset swap + polish."""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SITE = Path("/home/aiciv/PF-Platform/website/site")
HTML = SITE / "index.html"
CSS = SITE / "css" / "styles.css"
JS = SITE / "js" / "main.js"

VOID = {"area","base","br","col","embed","hr","img","input","link",
        "meta","param","source","track","wbr"}

results = []
def ok(label, cond, detail=""):
    results.append((bool(cond), label, detail))

html = HTML.read_text()
css = CSS.read_text()
js = JS.read_text()

# ---- 1. HTML tag balance ----
class Balancer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append("Unexpected </%s>" % tag); return
        if self.stack[-1] == tag:
            self.stack.pop()
        elif tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.errors.append("Unclosed <%s>" % self.stack.pop())
            if self.stack: self.stack.pop()
        else:
            self.errors.append("Stray </%s>" % tag)

b = Balancer(); b.feed(html)
ok("HTML tag balance", not b.errors and not b.stack,
   ("; ".join(b.errors) or ("unclosed: " + ",".join(b.stack))) if (b.errors or b.stack) else "balanced")

# ---- 2. Local asset resolution (src/href + CSS url()) ----
# Strip HTML comments first: refs inside comments (e.g. the progressive-enhancement
# <video> example) never load in a browser, so they must not be flagged as missing.
html_live = re.sub(r'<!--.*?-->', '', html, flags=re.S)
missing = []
for m in re.finditer(r'(?:src|href)\s*=\s*"([^"]+)"', html_live):
    ref = m.group(1)
    if ref.startswith(("http://","https://","mailto:","#","data:","tel:")):
        continue
    if not (SITE / ref).resolve().exists():
        missing.append(ref)
for m in re.finditer(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', css):
    ref = m.group(1)
    if ref.startswith(("http://","https://","data:")):
        continue
    if not (CSS.parent / ref).resolve().exists():
        missing.append("css:" + ref)
ok("All local assets resolve on disk", not missing, ", ".join(missing) if missing else "all resolve")

# ---- 3. img/ references + full gallery set exist + < 500KB ----
img_refs = set(re.findall(r'src="(img/[^"]+)"', html))
for slug, cnt in (("iu-launch",8),("republic-hotel",8),("madison",8)):
    for n in range(1, cnt+1):
        img_refs.add("img/%s-%d.jpg" % (slug, n))
oversize = []; missimg = []
for ref in sorted(img_refs):
    p = SITE / ref
    if not p.exists():
        missimg.append(ref); continue
    kb = p.stat().st_size/1024
    if kb > 500:
        oversize.append("%s=%.0fKB" % (ref, kb))
ok("All img/ references + 24 gallery photos exist", not missimg, ", ".join(missimg) if missimg else "all present")
ok("All referenced images < 500KB", not oversize, ", ".join(oversize) if oversize else "all under cap")

# ---- 4. Hero poster present; live webm wired; NO mp4 anywhere ----
ok("Hero poster present", (SITE/"media"/"hero-poster.jpg").exists(), "media/hero-poster.jpg")
no_comments = re.sub(r'<!--.*?-->', '', html, flags=re.S)
# NO .mp4 must be referenced anywhere (the old hero.mp4 was deleted).
ok("No .mp4 reference anywhere (deleted hero.mp4 gone)", ".mp4" not in html,
   "found .mp4" if ".mp4" in html else "no mp4 references")
disk_mp4 = [str(p) for p in SITE.rglob("*.mp4")]
ok("No mp4 in deploy folder", not disk_mp4, ", ".join(disk_mp4) if disk_mp4 else "none")

# Live hero <video> must wire media/hero.webm (desktop) + media/hero-720.webm (mobile).
ok("Hero <video> wires media/hero.webm", 'data-src-desktop="media/hero.webm"' in html, "desktop source present")
ok("Hero <video> wires media/hero-720.webm", 'data-src-mobile="media/hero-720.webm"' in html, "mobile source present")
ok("Hero <video> autoplay+muted+loop+playsinline",
   all(a in html for a in ["autoplay", "muted", "loop", "playsinline"]), "video attrs present")
# Every deployable video file exists and is < 25MB (Cloudflare Pages per-file cap).
vids = list(SITE.rglob("*.webm")) + list(SITE.rglob("*.mp4"))
big = []
for v in vids:
    mb = v.stat().st_size / (1024*1024)
    if mb >= 25: big.append("%s=%.1fMB" % (v.name, mb))
ok("hero.webm present", (SITE/"media"/"hero.webm").exists(), "media/hero.webm")
ok("hero-720.webm present", (SITE/"media"/"hero-720.webm").exists(), "media/hero-720.webm")
ok("All video files < 25MB (Cloudflare cap)", not big,
   ", ".join(big) if big else (", ".join("%s=%.1fMB" % (v.name, v.stat().st_size/(1024*1024)) for v in vids) or "none"))

# ---- 5. No orange/amber colors ----
css_nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
html_styles = " ".join(re.findall(r'style="([^"]*)"', html))
blob = (css_nc + " " + html_styles).lower()
bad = [t for t in ["#f1420b","#ff8c00","#ffa500","#ffbf00","orange","amber","#f59e0b","#ff7a00"] if t in blob]
ok("No orange/amber colors", not bad, ", ".join(bad) if bad else "clean (azure-only)")

# ---- 6. a11y / SEO ----
checks = {
    "lang attr": 'lang="en"' in html, "title": "<title>" in html,
    "meta description": 'name="description"' in html, "og:title": 'property="og:title"' in html,
    "og:image": 'property="og:image"' in html, "twitter:card": 'name="twitter:card"' in html,
    "canonical": 'rel="canonical"' in html, "favicon": 'rel="icon"' in html,
    "theme-color": 'name="theme-color"' in html, "skip link": 'class="skip-link"' in html,
    "<main>": "<main" in html, "<header>": "<header" in html, "<footer>": "<footer" in html,
    "dialog role": 'role="dialog"' in html, "aria-modal": 'aria-modal="true"' in html,
}
sf = [k for k,v in checks.items() if not v]
ok("a11y/SEO signals present", not sf, ", ".join(sf) if sf else "all present")
imgs = re.findall(r'<img\b[^>]*>', html)
no_alt = [t[:60] for t in imgs if 'alt=' not in t]
ok("Every <img> has alt", not no_alt, "; ".join(no_alt) if no_alt else "%d imgs, all alt" % len(imgs))

# ---- 7. Madison content compliance ----
mad = re.search(r'data-gallery="madison".*?</article>', html, flags=re.S)
mad_block = mad.group(0) if mad else ""
leaks = [t for t in ["Wilhelm","Carmel","Indianapolis","Monroeville","24&Prime;","30&Prime;","2024","2025","2026"] if t in mad_block]
mad_js = re.search(r'"madison":\s*\{.*?\}', js, flags=re.S)
mad_js_block = mad_js.group(0) if mad_js else ""
leaks += ["js:"+t for t in ["Wilhelm","Carmel","Indianapolis"] if t in mad_js_block]
ok("Madison leaks no GC/location/year/specs", not leaks, ", ".join(leaks) if leaks else "clean")

# ---- 8. No production / linear-foot figures ----
lf = re.findall(r'\b\d[\d,]*\s*(?:LF|linear feet|linear-foot|columns?/day)\b', html, flags=re.I)
ok("No production/linear-foot figures", not lf, ", ".join(lf) if lf else "none")

# ---- 9. Logos are the official ones referenced ----
logo_refs = set(re.findall(r'src="(brand/[^"]+)"', html))
ok("Official logo files referenced", logo_refs and all((SITE/r).exists() for r in logo_refs),
   ", ".join(sorted(logo_refs)))

print("\n=== SELF-CHECK RESULTS (official-asset swap) ===")
allpass = True
for cond, label, detail in results:
    if not cond: allpass = False
    print("[%s] %s%s" % ("PASS" if cond else "FAIL", label, (" -> " + detail) if detail else ""))
print("=== %s ===" % ("ALL PASS" if allpass else "SOME FAILED"))
sys.exit(0 if allpass else 1)
