#!/usr/bin/env python3
"""Optimize 21MP drone photos into web derivatives for the PF marketing site."""
import os
from PIL import Image, ImageOps

SRC = "/home/aiciv/PF-Platform/website/assets/projects"
OUT = "/home/aiciv/PF-Platform/website/site/img"
os.makedirs(OUT, exist_ok=True)

# (source_relpath, output_basename, role)  role: 'feature' -> 2000px + 800px thumb
JOBS = [
    # IU Launch
    ("iu-launch/DJI_0369.JPG", "iu-launch-1"),
    ("iu-launch/DJI_0370.JPG", "iu-launch-2"),
    ("iu-launch/DJI_0371.JPG", "iu-launch-3"),
    ("iu-launch/DJI_0372.JPG", "iu-launch-4"),
    ("iu-launch/DJI_0373.JPG", "iu-launch-5"),
    ("iu-launch/DJI_0374.JPG", "iu-launch-6"),
    # Republic Hotel
    ("republic-hotel/DJI_0247.JPG", "republic-hotel-1"),
    ("republic-hotel/DJI_0249.JPG", "republic-hotel-2"),
    ("republic-hotel/DJI_0255.JPG", "republic-hotel-3"),
    ("republic-hotel/DJI_0258.JPG", "republic-hotel-4"),
    ("republic-hotel/DJI_0265.JPG", "republic-hotel-5"),
    ("republic-hotel/DJI_0266.JPG", "republic-hotel-6"),
    # Madison Lifestyle Garage
    ("madison-lifestyle/DJI_0411.JPG", "madison-lifestyle-1"),
    ("madison-lifestyle/DJI_0414.JPG", "madison-lifestyle-2"),
    ("madison-lifestyle/DJI_0415.JPG", "madison-lifestyle-3"),
    ("madison-lifestyle/DJI_0416.JPG", "madison-lifestyle-4"),
    ("madison-lifestyle/DJI_0428.JPG", "madison-lifestyle-5"),
    ("madison-lifestyle/DJI_0429.JPG", "madison-lifestyle-6"),
]

FEATURE_W = 1800
THUMB_W = 800
FEATURE_Q = 72
THUMB_Q = 76
MAX_KB = 480  # hard cap; step quality down until under this


def process(src_rel, base):
    src = os.path.join(SRC, src_rel)
    img = Image.open(src)
    img = ImageOps.exif_transpose(img)  # honor camera orientation
    img = img.convert("RGB")
    w, h = img.size

    # Feature (~1800px wide) — step quality down until under MAX_KB
    fw = FEATURE_W
    fh = int(h * (fw / w))
    feat = img.resize((fw, fh), Image.LANCZOS)
    fpath = os.path.join(OUT, f"{base}.jpg")
    q = FEATURE_Q
    while True:
        feat.save(fpath, "JPEG", quality=q, optimize=True, progressive=True)
        if os.path.getsize(fpath) / 1024 <= MAX_KB or q <= 50:
            break
        q -= 4

    # Thumb (800px wide)
    tw = THUMB_W
    th = int(h * (tw / w))
    thumb = img.resize((tw, th), Image.LANCZOS)
    tpath = os.path.join(OUT, f"{base}-thumb.jpg")
    thumb.save(tpath, "JPEG", quality=THUMB_Q, optimize=True, progressive=True)

    fsize = os.path.getsize(fpath) / 1024
    tsize = os.path.getsize(tpath) / 1024
    print(f"{base}: feature {fw}x{fh} {fsize:.0f}KB | thumb {tw}x{th} {tsize:.0f}KB")
    return fsize, tsize, fpath, tpath


def main():
    over = []
    for src_rel, base in JOBS:
        fsize, tsize, fpath, tpath = process(src_rel, base)
        if fsize > 500:
            over.append((fpath, fsize))
        if tsize > 500:
            over.append((tpath, tsize))
    print("\n--- Files over 500KB ---")
    if over:
        for p, s in over:
            print(f"  OVER: {p} = {s:.0f}KB")
    else:
        print("  none")

    # Generate poster image for hero video from a representative IU Launch photo.
    poster_src = os.path.join(SRC, "iu-launch/DJI_0371.JPG")
    pimg = ImageOps.exif_transpose(Image.open(poster_src)).convert("RGB")
    pw, ph = pimg.size
    target_w = 1920
    target_h = 1080
    # cover-crop to 16:9
    scale = max(target_w / pw, target_h / ph)
    nw, nh = int(pw * scale), int(ph * scale)
    pimg = pimg.resize((nw, nh), Image.LANCZOS)
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    pimg = pimg.crop((left, top, left + target_w, top + target_h))
    poster_path = "/home/aiciv/PF-Platform/website/site/media/hero-poster.jpg"
    os.makedirs(os.path.dirname(poster_path), exist_ok=True)
    pq = 78
    while True:
        pimg.save(poster_path, "JPEG", quality=pq, optimize=True, progressive=True)
        if os.path.getsize(poster_path) / 1024 <= MAX_KB or pq <= 50:
            break
        pq -= 4
    print(f"\nhero-poster.jpg: {target_w}x{target_h} {os.path.getsize(poster_path)/1024:.0f}KB")


if __name__ == "__main__":
    main()
