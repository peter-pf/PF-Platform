#!/usr/bin/env python3
"""
Generate 3 GENERIC, de-branded service-load deliverable examples for the PF FAQ page.
Built for Peter (AI COO) per Jonathan's request.

  1. column-pad-footing-example.png  - isolated spread footings w/ per-footing DL/LL schedule
  2. strip-footing-example.png       - continuous wall footing w/ DL/LL per linear foot
  3. mat-footing-pressure-gradient-example.png - source-PDF page-2 style soil-bearing contour map

All labels are GENERIC. No client/GC/architect/SEOR/project name. No proprietary marks.
Every graphic is watermarked "EXAMPLE - ILLUSTRATIVE ONLY".

Run:  python3 generate_examples.py
"""
import os, math
os.environ.setdefault("OPENBLAS_NUM_THREADS","1")
os.environ.setdefault("OMP_NUM_THREADS","1")
os.environ.setdefault("MKL_NUM_THREADS","1")
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------- fonts ----------
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
SANS_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
def f(sz, bold=False):
    return ImageFont.truetype(SANS_B if bold else SANS, sz)

# ---------- PF brand palette (neutral, professional) ----------
INK   = (28, 33, 40)        # near-black text / lines
GRID  = (200, 206, 214)     # light grid
MUTE  = (110, 120, 132)     # secondary text
AZURE = (0, 110, 175)       # PF azure accent
PANEL = (244, 246, 249)     # light panel fill
LINE  = (70, 78, 88)
WHITE = (255, 255, 255)

def text(d, xy, s, font, fill=INK, anchor="la"):
    d.text(xy, s, font=font, fill=fill, anchor=anchor)

def watermark(img):
    """Diagonal 'EXAMPLE - ILLUSTRATIVE ONLY' watermark + footer note."""
    W, H = img.size
    layer = Image.new("RGBA", (W, H), (0,0,0,0))
    ld = ImageDraw.Draw(layer)
    wm = ImageFont.truetype(SANS_B, int(W*0.045))
    txt = "EXAMPLE  -  ILLUSTRATIVE  ONLY"
    bb = ld.textbbox((0,0), txt, font=wm)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    tile = Image.new("RGBA", (tw+40, th+40), (0,0,0,0))
    td = ImageDraw.Draw(tile)
    td.text((20,20), txt, font=wm, fill=(150,160,172,60), anchor="lm")
    tile = tile.rotate(28, expand=True, resample=Image.BICUBIC)
    tw2, th2 = tile.size
    for y in range(-th2, H+th2, int(th2*0.9)):
        for x in range(-tw2, W+tw2, int(tw2*1.05)):
            layer.alpha_composite(tile, (x, y))
    out = Image.alpha_composite(img.convert("RGBA"), layer)
    return out.convert("RGB")

def header(d, W, title, subtitle):
    d.rectangle([0,0,W,118], fill=INK)
    d.rectangle([0,118,W,126], fill=AZURE)
    text(d, (40,30), "PIER FOUNDATIONS", f(30, True), fill=WHITE)
    text(d, (40,74), "SERVICE LOADS  -  EXAMPLE DELIVERABLE", f(18), fill=(170,200,225))
    text(d, (W-40, 38), title, f(26, True), fill=WHITE, anchor="ra")
    text(d, (W-40, 78), subtitle, f(16), fill=(170,200,225), anchor="ra")

def footer(d, W, H, note):
    d.rectangle([0,H-92,W,H], fill=PANEL)
    d.line([0,H-92,W,H-92], fill=GRID, width=2)
    text(d, (40, H-72), "What Pier Foundations needs:", f(15, True), fill=AZURE)
    text(d, (40, H-46), note, f(15), fill=INK)
    text(d, (W-40, H-46),
         "Unfactored ASD service loads  |  Generic example - not a real project",
         f(13), fill=MUTE, anchor="ra")

# =====================================================================
# 1. COLUMN PAD FOOTING EXAMPLE
# =====================================================================
def column_pad():
    W,H = 1600, 1220
    img = Image.new("RGB",(W,H),WHITE); d=ImageDraw.Draw(img)
    header(d, W, "COLUMN PAD FOOTINGS", "Isolated spread footings - gravity columns")

    text(d,(40,150),"Partial Foundation Plan", f(20,True))
    text(d,(40,182),"Each interior column lands on an isolated spread footing. Provide",
                    f(15), fill=MUTE)
    text(d,(40,204),"unfactored Dead Load (DL) and Live Load (LL) at every column.",
                    f(15), fill=MUTE)

    # --- plan grid (3x2 columns) ---
    ox, oy = 90, 360
    sx, sy = 380, 300        # bay spacing px
    cols = [["C1","C2","C3"],["C4","C5","C6"]]
    loads = {
        "C1":(180,55),"C2":(300,120),"C3":(210,75),
        "C4":(240,95),"C5":(360,140),"C6":(190,80),
    }
    # gridlines
    for r in range(3):
        d.line([ox, oy+r*sy, ox+2*sx, oy+r*sy], fill=GRID, width=2)
    for c in range(3):
        d.line([ox+c*sx, oy, ox+c*sx, oy+2*sy], fill=GRID, width=2)
    # gridline bubbles
    for c,lab in enumerate(["A","B","C"]):
        cx=ox+c*sx
        d.ellipse([cx-18,oy-46,cx+18,oy-10], outline=LINE, width=2, fill=WHITE)
        text(d,(cx,oy-28),lab,f(16,True),anchor="mm")
    for r,lab in enumerate(["1","2","3"]):
        cy=oy+r*sy
        d.ellipse([ox-58,cy-18,ox-22,cy+18], outline=LINE, width=2, fill=WHITE)
        text(d,(ox-40,cy),lab,f(16,True),anchor="mm")

    # footings + columns
    for ri,row in enumerate(cols):
        for ci,cid in enumerate(row):
            cx, cy = ox+ci*sx, oy+ri*sy
            fw = 92
            d.rectangle([cx-fw,cy-fw,cx+fw,cy+fw], outline=AZURE, width=3, fill=(232,242,249))
            d.rectangle([cx-26,cy-26,cx+26,cy+26], fill=INK)   # column
            dl,ll = loads[cid]
            text(d,(cx,cy-fw-22),cid,f(17,True),anchor="mm")
            # load callout
            bx,by = cx+fw+8, cy-46
            d.rectangle([bx,by,bx+150,by+92], outline=LINE, width=2, fill=WHITE)
            text(d,(bx+10,by+10),f"DL = {dl} k",f(15,True),fill=INK)
            text(d,(bx+10,by+38),f"LL = {ll} k",f(15,True),fill=INK)
            text(d,(bx+10,by+64),f"DL+0.5LL = {dl+0.5*ll:.0f} k",f(12),fill=MUTE)

    # --- schedule table ---
    tx, ty = 1180, 310
    text(d,(tx,ty-34),"Service Load Schedule",f(18,True))
    cw=[120,140,140]
    heads=["Column","DL (kips)","LL (kips)"]
    d.rectangle([tx,ty,tx+sum(cw),ty+44], fill=INK)
    cxp=tx
    for h,w in zip(heads,cw):
        text(d,(cxp+w/2,ty+22),h,f(15,True),fill=WHITE,anchor="mm"); cxp+=w
    rid=0
    for row in cols:
        for cid in row:
            yy=ty+44+rid*44
            fillc = PANEL if rid%2 else WHITE
            d.rectangle([tx,yy,tx+sum(cw),yy+44], fill=fillc, outline=GRID, width=1)
            dl,ll=loads[cid]
            vals=[cid,str(dl),str(ll)]
            cxp=tx
            for v,w in zip(vals,cw):
                bold = (v==cid)
                text(d,(cxp+w/2,yy+22),v,f(15,bold),anchor="mm"); cxp+=w
            rid+=1
    # totals note
    ny=ty+44+rid*44+18
    d.rectangle([tx,ny,tx+sum(cw),ny+118], outline=AZURE, width=2, fill=(240,247,252))
    text(d,(tx+12,ny+12),"Notes",f(14,True),fill=AZURE)
    for i,ln in enumerate([
        "- Loads are UNFACTORED (ASD)",
        "- DL = Dead, LL = Live",
        "- Do NOT apply LRFD factors",
        "- Sustained = DL + 0.5 LL",
    ]):
        text(d,(tx+12,ny+40+i*22),ln,f(13),fill=INK)

    footer(d, W, H, "Per-column unfactored DL and LL (kips) for every footing in the improved area.")
    img = watermark(img)
    p=os.path.join(OUT,"column-pad-footing-example.png"); img.save(p); print("saved",p); return p

# =====================================================================
# 2. STRIP (CONTINUOUS WALL) FOOTING EXAMPLE
# =====================================================================
def strip_footing():
    W,H = 1600, 1100
    img = Image.new("RGB",(W,H),WHITE); d=ImageDraw.Draw(img)
    header(d, W, "STRIP / WALL FOOTINGS", "Continuous footings - loads per linear foot")

    text(d,(40,150),"Partial Foundation Plan",f(20,True))
    text(d,(40,182),"Continuous wall footings carry distributed load. Provide unfactored "
                    "DL and LL per linear foot (plf or klf) for each footing run.",
                    f(15),fill=MUTE)

    # --- plan: a rectangular footprint of continuous footings ---
    ox,oy = 110, 270
    w,h = 980, 560
    # outer continuous footing (drawn as a band)
    band=46
    def runrect(x0,y0,x1,y1):
        d.rectangle([x0,y0,x1,y1], outline=AZURE, width=3, fill=(232,242,249))
    # outer ring footings
    d.rectangle([ox,oy,ox+w,oy+h], outline=GRID, width=2)
    # top, bottom, left, right footing bands
    runrect(ox,oy-band//2,ox+w,oy+band//2)            # F1 top
    runrect(ox,oy+h-band//2,ox+w,oy+h+band//2)        # F1 bottom
    runrect(ox-band//2,oy,ox+band//2,oy+h)            # F2 left
    runrect(ox+w-band//2,oy,ox+w+band//2,oy+h)        # F2 right
    # one interior bearing wall footing
    iy=oy+int(h*0.55)
    runrect(ox,iy-band//2,ox+w,iy+band//2)            # F3 interior

    # wall centerlines (dashed)
    def dash(x0,y0,x1,y1):
        d.line([x0,y0,x1,y1], fill=LINE, width=2)
    # labels for each run with plf loads
    runs = [
        ("F1","Exterior bearing wall", 4.2, 1.3, (ox+w//2, oy-band//2-26), "mm"),
        ("F3","Interior bearing wall", 6.0, 2.4, (ox+w//2, iy-band//2-26), "mm"),
        ("F2","End wall", 3.0, 0.9, (ox-band//2-12, oy+h//2), "rm"),
    ]
    for cid,desc,dl,ll,(lx,ly),anc in runs:
        text(d,(lx,ly),cid,f(18,True),anchor=anc,fill=INK)

    # callout boxes pointing to runs
    def callout(x,y,cid,dl,ll):
        bw,bh=270,118
        d.rectangle([x,y,x+bw,y+bh], outline=LINE, width=2, fill=WHITE)
        d.rectangle([x,y,x+8,y+bh], fill=AZURE)
        text(d,(x+22,y+12),cid,f(16,True),fill=AZURE)
        text(d,(x+22,y+42),f"DL = {dl:.1f} klf",f(15,True))
        text(d,(x+22,y+68),f"LL = {ll:.1f} klf",f(15,True))
        text(d,(x+22,y+94),f"({dl*1000:.0f} / {ll*1000:.0f} plf)",f(12),fill=MUTE)
    callout(ox+w+70, oy-10, "F1 - Exterior", 4.2, 1.3)
    callout(ox+w+70, oy+170, "F3 - Interior", 6.0, 2.4)
    callout(ox+w+70, oy+350, "F2 - End wall", 3.0, 0.9)

    # length dimension example
    d.line([ox,oy+h+70,ox+w,oy+h+70], fill=MUTE, width=2)
    for xx in (ox,ox+w):
        d.line([xx,oy+h+60,xx,oy+h+80], fill=MUTE, width=2)
    text(d,(ox+w//2,oy+h+90),"Footing run length = 96 ft (example)",f(14),anchor="mm",fill=MUTE)

    # notes panel
    nx,ny=ox+w+70, oy+520
    d.rectangle([nx,ny,nx+270,ny+150], outline=AZURE, width=2, fill=(240,247,252))
    text(d,(nx+12,ny+12),"Notes",f(14,True),fill=AZURE)
    for i,ln in enumerate([
        "- Loads are UNFACTORED (ASD)",
        "- klf = kips per linear foot",
        "- plf = pounds per linear foot",
        "- Provide DL & LL per run",
        "- Do NOT apply LRFD factors",
    ]):
        text(d,(nx+12,ny+40+i*22),ln,f(13),fill=INK)

    footer(d, W, H, "Unfactored DL and LL per linear foot (klf or plf) for each continuous footing run.")
    img=watermark(img)
    p=os.path.join(OUT,"strip-footing-example.png"); img.save(p); print("saved",p); return p

# =====================================================================
# 3. MAT FOOTING - SOIL BEARING PRESSURE GRADIENT (source-PDF page-2 style)
# =====================================================================
# Rainbow ramp matching the source plot: violet(low) -> red(high)
RAMP = [
    (600 , (138, 43,226)),   # violet
    (1200, (0 ,  0 ,255)),   # blue
    (1800, (30,144,255)),    # dodger blue
    (2400, (0 ,220,220)),    # cyan
    (3000, (40,180, 60)),    # green
    (3600, (150,210, 40)),   # yellow-green
    (4200, (255,225, 0)),    # yellow
    (4800, (255,160, 0)),    # orange
    (5400, (255, 80, 0)),    # red-orange
    (6000, (235, 20, 20)),   # red
]
def ramp_color(v):
    if v <= RAMP[0][0]: return RAMP[0][1]
    if v >= RAMP[-1][0]: return RAMP[-1][1]
    for i in range(len(RAMP)-1):
        v0,c0=RAMP[i]; v1,c1=RAMP[i+1]
        if v0<=v<=v1:
            t=(v-v0)/(v1-v0)
            return tuple(int(c0[k]+(c1[k]-c0[k])*t) for k in range(3))
    return RAMP[-1][1]

def mat_pressure():
    import numpy as np
    W,H = 1700, 1180
    img = Image.new("RGB",(W,H),WHITE); d=ImageDraw.Draw(img)
    header(d, W, "MAT FOUNDATION", "Soil bearing pressure contour plot")

    text(d,(40,150),"Soil Bearing Pressure Plot (Service Loads)",f(20,True))
    text(d,(40,182),"Color contours show the bearing pressure under the mat from the FE model, "
                    "enveloped over the service load cases below. This is the deliverable that "
                    "is VERY helpful to Pier Foundations.",
                    f(15),fill=MUTE)

    # plot area
    px,py = 60, 240
    pw,ph = 1040, 720
    # build a pressure field: a few high-pressure column zones over a low base
    nx,ny = 260,180
    field = np.full((ny,nx), 400.0)
    # base gentle variation
    yy,xx = np.mgrid[0:ny,0:nx]
    field += 250*np.sin(xx/40.0)*np.cos(yy/55.0)
    # column load concentrations (cx,cy in grid frac, peak psf, radius)
    cols = [
        (0.18,0.30,4800,26),(0.40,0.28,5800,24),(0.63,0.32,4200,26),(0.84,0.27,4600,24),
        (0.15,0.68,3600,28),(0.38,0.72,5400,22),(0.62,0.66,5000,24),(0.86,0.70,3000,30),
        (0.50,0.50,2200,34),
    ]
    for fx,fy,peak,rad in cols:
        cx_,cy_=fx*nx, fy*ny
        dist=np.sqrt((xx-cx_)**2+(yy-cy_)**2)
        field += (peak-400)*np.exp(-(dist**2)/(2*rad**2))
    field=np.clip(field,0,6000)

    # render field to an RGB image then paste
    flat=field.reshape(-1)
    rgb=np.zeros((flat.size,3),dtype=np.uint8)
    # quantize to contour bands (like the source - discrete bands)
    bands=np.array([0,600,1200,1800,2400,3000,3600,4200,4800,5400,6000])
    for i in range(len(bands)-1):
        lo,hi=bands[i],bands[i+1]
        mask=(flat>=lo)&(flat<hi)
        c=ramp_color((lo+hi)/2)
        rgb[mask]=c
    rgb[flat>=6000]=ramp_color(6000)
    fimg=Image.fromarray(rgb.reshape(ny,nx,3)).resize((pw,ph),Image.NEAREST)
    img.paste(fimg,(px,py))
    d2=ImageDraw.Draw(img)
    d2.rectangle([px,py,px+pw,py+ph],outline=INK,width=2)

    # overlay footing/grid outline + a couple pressure value labels
    for c in range(1,7):
        x=px+int(pw*c/7)
        d2.line([x,py,x,py+ph],fill=(255,255,255),width=1)
    for r in range(1,5):
        y=py+int(ph*r/5)
        d2.line([px,y,px+pw,y],fill=(255,255,255),width=1)
    # value annotations at a few peaks
    annot=[(0.40,0.28,"5800"),(0.38,0.72,"5400"),(0.50,0.50,"2200"),(0.84,0.27,"4600")]
    for fx,fy,v in annot:
        ax,ay=px+int(pw*fx),py+int(ph*fy)
        d2.text((ax,ay),v,font=f(15,True),fill=INK,anchor="mm")

    # column markers
    for fx,fy,_,_ in cols:
        ax,ay=px+int(pw*fx),py+int(ph*fy)
        d2.rectangle([ax-9,ay-9,ax+9,ay+9],outline=INK,width=2)

    # ---- legend / color bar (right side) ----
    lx,ly = px+pw+60, py+10
    text(d2,(lx,ly-34),"Bearing Pressure (psf)",f(17,True))
    bar_w, seg_h = 64, 56
    vals=[600,1200,1800,2400,3000,3600,4200,4800,5400]
    for i,v in enumerate(reversed(vals)):
        yy=ly+i*seg_h
        d2.rectangle([lx,yy,lx+bar_w,yy+seg_h],fill=ramp_color(v),outline=(255,255,255),width=1)
        d2.text((lx+bar_w+14,yy+seg_h/2),f"{v}",font=f(16,True),fill=INK,anchor="lm")
    d2.rectangle([lx,ly,lx+bar_w,ly+len(vals)*seg_h],outline=INK,width=2)
    text(d2,(lx,ly+len(vals)*seg_h+12),"violet = low   red = high",f(13),fill=MUTE)

    # ---- load-cases enveloped box ----
    bx,by=lx, ly+len(vals)*seg_h+60
    bw,bh=380,180
    d2.rectangle([bx,by,bx+bw,by+bh],outline=INK,width=2,fill=WHITE)
    text(d2,(bx+16,by+14),"LOAD CASES ENVELOPED:",f(16,True),fill=AZURE)
    for i,ln in enumerate(["1.0 D","1.0 D + 1.0 H + 1.0 L"]):
        text(d2,(bx+24,by+52+i*30),ln,f(16))
    text(d2,(bx+16,by+126),"LIVE LOADS HAVE NOT BEEN",f(14,True),fill=INK)
    text(d2,(bx+16,by+150),"REDUCED.",f(14,True),fill=INK)

    footer(d, W, H,
           "A service-load soil bearing pressure plot (psf), enveloped over unfactored DL / DL+L cases.")
    img=watermark(img)
    p=os.path.join(OUT,"mat-footing-pressure-gradient-example.png"); img.save(p); print("saved",p); return p

if __name__=="__main__":
    column_pad()
    strip_footing()
    mat_pressure()
    print("ALL DONE")
