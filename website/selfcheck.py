#!/usr/bin/env python3
"""No-browser self-check for the PF marketing site."""
import os
import re
import sys
from html.parser import HTMLParser

SITE = "/home/aiciv/PF-Platform/website/site"
INDEX = os.path.join(SITE, "index.html")

VOID = {"area","base","br","col","embed","hr","img","input","link",
        "meta","param","source","track","wbr"}

class Balancer(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        elif tag in self.stack:
            # pop until match (tolerant)
            while self.stack and self.stack.pop() != tag:
                pass
        else:
            self.errors.append("Unexpected close: </%s>" % tag)

def check_html_balance():
    print("=== HTML PARSE / TAG BALANCE ===")
    with open(INDEX, encoding="utf-8") as f:
        html = f.read()
    b = Balancer()
    b.feed(html)
    ok = True
    if b.stack:
        print("  UNCLOSED tags:", b.stack)
        ok = False
    if b.errors:
        for e in b.errors:
            print(" ", e)
        ok = False
    if ok:
        print("  OK — all tags balanced, document parses.")
    return ok

def collect_assets():
    with open(INDEX, encoding="utf-8") as f:
        html = f.read()
    # local src/href only (skip http(s), mailto, #, data:)
    refs = re.findall(r'(?:src|href)\s*=\s*"([^"]+)"', html)
    local = []
    for r in refs:
        if r.startswith(("http://","https://","mailto:","#","data:","tel:")):
            continue
        local.append(r)
    # also CSS url() in styles.css and any background images
    css_path = os.path.join(SITE, "css", "styles.css")
    css_refs = []
    if os.path.exists(css_path):
        with open(css_path, encoding="utf-8") as f:
            css = f.read()
        for m in re.findall(r'url\(\s*["\']?([^"\')]+)["\']?\s*\)', css):
            if not m.startswith(("http://","https://","data:")):
                css_refs.append(("css", m, css_path))
    return local, css_refs

def check_assets():
    print("\n=== LOCAL ASSET RESOLUTION ===")
    local, css_refs = collect_assets()
    missing = []
    for r in sorted(set(local)):
        p = os.path.normpath(os.path.join(SITE, r))
        exists = os.path.exists(p)
        if not exists:
            missing.append(r)
        print("  %-7s %s" % ("OK" if exists else "MISSING", r))
    print("\n  -- CSS url() refs (resolved relative to css/) --")
    css_dir = os.path.join(SITE, "css")
    for kind, r, base in css_refs:
        p = os.path.normpath(os.path.join(css_dir, r))
        exists = os.path.exists(p)
        if not exists:
            missing.append(r)
        print("  %-7s %s" % ("OK" if exists else "MISSING", r))
    if missing:
        print("\n  MISSING ASSETS:", missing)
    else:
        print("\n  All referenced local assets resolve to files on disk.")
    return not missing

def check_images():
    print("\n=== OPTIMIZED IMAGE SIZE CHECK (<500KB) ===")
    img_dir = os.path.join(SITE, "img")
    poster = os.path.join(SITE, "media", "hero-poster.jpg")
    over = []
    files = sorted(os.listdir(img_dir))
    for fn in files:
        p = os.path.join(img_dir, fn)
        kb = os.path.getsize(p)/1024
        flag = "" if kb < 500 else "  <-- OVER 500KB"
        if kb >= 500:
            over.append(fn)
        print("  %6.0f KB  img/%s%s" % (kb, fn, flag))
    pkb = os.path.getsize(poster)/1024
    print("  %6.0f KB  media/hero-poster.jpg%s" % (pkb, "" if pkb<500 else "  <-- OVER"))
    if pkb >= 500:
        over.append("hero-poster.jpg")
    if over:
        print("  OVER LIMIT:", over)
    else:
        print("  All optimized images under 500KB.")
    return not over

def check_no_originals():
    print("\n=== PAGE REFERENCES img/ NOT 21MP ORIGINALS ===")
    with open(INDEX, encoding="utf-8") as f:
        html = f.read()
    bad = re.findall(r'(?:src|href)="([^"]*(?:assets/projects|DJI_\d+\.JPG)[^"]*)"', html)
    if bad:
        print("  FOUND references to originals:", bad)
        return False
    img_refs = re.findall(r'src="(img/[^"]+)"', html)
    print("  Page image refs use img/:", len(img_refs), "references — none point to 21MP originals. OK")
    return True

def check_above_fold_weight():
    print("\n=== ABOVE-THE-FOLD ASSET WEIGHT ===")
    # Above the fold: index.html + css + js + font + poster + logos
    items = [
        ("index.html", INDEX),
        ("css/styles.css", os.path.join(SITE,"css","styles.css")),
        ("js/main.js", os.path.join(SITE,"js","main.js")),
        ("fonts/EurostileExtended.ttf", os.path.join(SITE,"fonts","EurostileExtended.ttf")),
        ("media/hero-poster.jpg", os.path.join(SITE,"media","hero-poster.jpg")),
        ("brand/logo-white.svg", os.path.join(SITE,"brand","logo-white.svg")),
        ("brand/logo-black.svg", os.path.join(SITE,"brand","logo-black.svg")),
    ]
    total = 0
    for label, p in items:
        kb = os.path.getsize(p)/1024
        total += kb
        print("  %7.1f KB  %s" % (kb, label))
    print("  ---------------------------------")
    print("  %7.1f KB  TOTAL above-the-fold (excludes hero video, which streams via preload=metadata)" % total)
    print("  Note: hero video (%.1f MB) streams lazily; poster shows immediately." %
          (os.path.getsize(os.path.join(SITE,"media","iu-launch-hero.mp4"))/1024/1024))
    return True

def check_no_orange():
    print("\n=== BRAND GUARD: NO ORANGE/AMBER ACCENTS ===")
    paths = [INDEX, os.path.join(SITE,"css","styles.css"), os.path.join(SITE,"js","main.js")]
    banned = ["#f1420b","#f97316","#ff6b00","#ffa500","#d4703c","orange","amber","#f59e0b","#fb923c"]
    found = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            txt = f.read().lower()
        for b in banned:
            if b in txt:
                found.append((os.path.basename(p), b))
    if found:
        print("  ORANGE/AMBER FOUND:", found)
        return False
    print("  Clean — no orange/amber tokens. Accent is azure #006DB0.")
    return True

def check_accessibility():
    print("\n=== QUICK A11Y / SEO SIGNALS ===")
    with open(INDEX, encoding="utf-8") as f:
        html = f.read()
    checks = {
        "lang attribute": 'lang="en"' in html,
        "<title>": "<title>" in html,
        "meta description": 'name="description"' in html,
        "og:title": 'property="og:title"' in html,
        "og:image": 'property="og:image"' in html,
        "twitter:card": 'name="twitter:card"' in html,
        "favicon": 'rel="icon"' in html,
        "skip link": "skip-link" in html,
        "<main> landmark": "<main" in html,
        "<header> landmark": "<header" in html,
        "<footer> landmark": "<footer" in html,
        "canonical": 'rel="canonical"' in html,
    }
    # all content imgs have alt
    imgs = re.findall(r'<img\b[^>]*>', html)
    no_alt = [i for i in imgs if 'alt=' not in i]
    checks["all <img> have alt attr"] = (len(no_alt) == 0)
    ok = True
    for k,v in checks.items():
        print("  %-28s %s" % (k, "OK" if v else "MISSING"))
        if not v: ok = False
    if no_alt:
        print("  IMG without alt:", no_alt)
    return ok

def main():
    results = []
    results.append(("HTML balance", check_html_balance()))
    results.append(("Asset resolution", check_assets()))
    results.append(("Image sizes <500KB", check_images()))
    results.append(("No 21MP originals", check_no_originals()))
    results.append(("Above-fold weight", check_above_fold_weight()))
    results.append(("No orange", check_no_orange()))
    results.append(("A11y/SEO signals", check_accessibility()))
    print("\n=== SUMMARY ===")
    allok = True
    for name, ok in results:
        print("  %-22s %s" % (name, "PASS" if ok else "FAIL"))
        if not ok: allok = False
    sys.exit(0 if allok else 1)

if __name__ == "__main__":
    main()
