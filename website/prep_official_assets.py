#!/usr/bin/env python3
"""
Prep OFFICIAL curated assets into site/ for the Pier Foundations marketing site.

- Copies the official curated project photos (web + thumb) from assets/gdrive/projects/<slug>/web/
  into site/img/ with clean, stable names: <slug>-NN.jpg / <slug>-NN-thumb.jpg
- Copies the official hero-poster.jpg (1920x1080) into site/media/hero-poster.jpg
- Verifies every output is < 500 KB (project) and reports sizes.
- Does NOT touch logos (already the official SVGs) and does NOT copy the 138MB mp4.

Featured projects ONLY (per directive): iu-launch-accelerator, republic-hotel, madison-lifestyle-garage.
Almco & Marion Local are excluded by directive.
"""
import json
import shutil
from pathlib import Path

ROOT = Path("/home/aiciv/PF-Platform/website")
GDRIVE = ROOT / "assets" / "gdrive"
SITE = ROOT / "site"
IMG = SITE / "img"
MEDIA = SITE / "media"

SLUGS = ["iu-launch-accelerator", "republic-hotel", "madison-lifestyle-garage"]
# short slug used in filenames on the page
SHORT = {
    "iu-launch-accelerator": "iu-launch",
    "republic-hotel": "republic-hotel",
    "madison-lifestyle-garage": "madison",
}

KB = 1024
CAP_KB = 500


def main():
    manifest = json.loads((GDRIVE / "asset-manifest.json").read_text())
    by_project = {}
    for a in manifest["assets"]:
        if a.get("role") == "project-photo":
            by_project.setdefault(a["project"], []).append(a)

    # wipe old img dir contents to avoid stale unofficial photos lingering
    if IMG.exists():
        for f in IMG.glob("*.jpg"):
            f.unlink()
    IMG.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)

    report = {"projects": {}, "poster": None, "oversize": []}

    for slug in SLUGS:
        photos = sorted(by_project.get(slug, []), key=lambda x: x["path"])
        short = SHORT[slug]
        out = []
        for i, p in enumerate(photos, start=1):
            src_full = Path(p["path"])
            src_thumb = Path(p["path"].replace(".jpg", "_thumb.jpg"))
            dst_full = IMG / f"{short}-{i}.jpg"
            dst_thumb = IMG / f"{short}-{i}-thumb.jpg"
            shutil.copy2(src_full, dst_full)
            if src_thumb.exists():
                shutil.copy2(src_thumb, dst_thumb)
            fk = dst_full.stat().st_size / KB
            tk = dst_thumb.stat().st_size / KB if dst_thumb.exists() else 0
            if fk > CAP_KB:
                report["oversize"].append((str(dst_full), round(fk, 1)))
            if tk > CAP_KB:
                report["oversize"].append((str(dst_thumb), round(tk, 1)))
            out.append({"n": i, "full": dst_full.name, "thumb": dst_thumb.name,
                        "fullKB": round(fk, 1), "thumbKB": round(tk, 1),
                        "src": src_full.name})
        report["projects"][slug] = out

    # hero poster
    poster_src = GDRIVE / "hero-poster.jpg"
    poster_dst = MEDIA / "hero-poster.jpg"
    shutil.copy2(poster_src, poster_dst)
    pk = poster_dst.stat().st_size / KB
    report["poster"] = {"file": poster_dst.name, "KB": round(pk, 1)}
    if pk > CAP_KB:
        report["oversize"].append((str(poster_dst), round(pk, 1)))

    # remove the undeployable mp4 from the deploy folder if present
    mp4 = MEDIA / "iu-launch-hero.mp4"
    removed = False
    if mp4.exists():
        mp4.unlink()
        removed = True
    report["removed_mp4"] = removed

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
