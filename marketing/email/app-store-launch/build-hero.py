#!/usr/bin/env python3
"""Compose the App Store launch hero for the PickleCue launch email.

Every pixel of product UI here is the REAL preseeded Home dashboard from
build 213 (qa/store-screenshots/build-213-deck-v4/raw/s10-home-dashboard.png).
Nothing is redrawn, no UI is invented, and the screenshot is scaled and rotated
rigidly - never stretched on one axis.

    python3 marketing/email/app-store-launch/build-hero.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math, sys
import numpy as np

REPO = Path(__file__).resolve().parents[3]
IOS  = Path("/Volumes/Mini Drive 2/Xcode Projects/PickleCue")
OUT  = Path(__file__).resolve().parent

HOME  = IOS / "qa/store-screenshots/build-213-deck-v4/raw/s10-home-dashboard.png"
BADGE = Path("/tmp/app-store-badge.png")
MARK  = Path.home() / "Desktop/Logo Transparent.png"   # the official C mark

PAPER = (13, 26, 18)      # #0D1A12
LIME  = (163, 230, 53)    # #A3E635
WHITE = (255, 255, 255)
S     = 2                 # supersample factor
W, H  = 1200 * S, 750 * S

AB = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
BD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f = lambda p, s: ImageFont.truetype(p, s * S)

for p in (HOME, BADGE, MARK):
    if not p.exists():
        sys.exit(f"missing asset: {p}")

card = Image.new("RGB", (W, H), PAPER)

# ---- ambient glow behind the device -------------------------------------
# Computed per-pixel rather than drawn as blurred ellipses. The ellipse version
# left a visible straight-edged band down the left of the phone: a blur radius
# large enough to look ambient still has a boundary, and two stacked ellipses
# put that boundary right where the eye goes.
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
cx, cy = W * 0.78, H * 0.46
r = np.sqrt(((xx - cx) / (W * 0.62)) ** 2 + ((yy - cy) / (H * 0.86)) ** 2)
falloff = np.clip(1.0 - r, 0.0, 1.0) ** 1.7          # smooth to zero at the edge
base = np.array(PAPER, dtype=np.float32)
lit  = np.array((30, 80, 48), dtype=np.float32)
card = Image.fromarray(
    (base + (lit - base) * falloff[..., None]).clip(0, 255).astype(np.uint8), "RGB")

# ---- the device: real screenshot, rigid scale + rotate -------------------
shot = Image.open(HOME).convert("RGB")
PHONE_W = int(374 * S)
scale = PHONE_W / shot.width
phone = shot.resize((PHONE_W, int(shot.height * scale)), Image.LANCZOS)

BEZ, RAD = int(11 * S), int(46 * S)
dev = Image.new("RGBA", (phone.width + BEZ*2, phone.height + BEZ*2), (0, 0, 0, 0))
dd = ImageDraw.Draw(dev)
dd.rounded_rectangle([0, 0, dev.width-1, dev.height-1], RAD + BEZ, fill=(22, 26, 24, 255),
                     outline=(72, 92, 80, 255), width=max(1, S))
mask = Image.new("L", phone.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, phone.width-1, phone.height-1], RAD, fill=255)
dev.paste(phone, (BEZ, BEZ), mask)

ANGLE = -9.5                                   # rigid rotation, aspect preserved
dev_r = dev.rotate(ANGLE, expand=True, resample=Image.BICUBIC)

# Soft contact shadow. Kept well inside the device silhouette and blurred wide,
# so it reads as depth rather than as a second rectangle beside the phone.
shadow = Image.new("L", (W, H), 0)
shadow.paste(dev_r.split()[3].point(lambda v: 130 if v > 8 else 0),
             (int(628*S) + int(14*S), int(84*S) + int(26*S)))
shadow = shadow.filter(ImageFilter.GaussianBlur(40 * S))
card = Image.composite(Image.new("RGB", (W, H), (5, 12, 8)), card, shadow)
card.paste(dev_r, (int(628*S), int(84*S)), dev_r)

# The pickleball that used to sit here is gone. Composited against a
# photographic device mockup it read as a flat sticker with a hard shadow, not
# an object in the same scene. The phone bleeding off the right edge carries
# the composition on its own.

# ---- copy lockup --------------------------------------------------------
d = ImageDraw.Draw(card)
X = int(72 * S)

# The C mark, presented as the app icon people will look for in the App Store.
mark = Image.open(MARK).convert("RGBA")
TILE = int(88 * S)
tile = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
# Near-black tile, not dark green: the mark's own "C" is a deep green, and it
# only separates against something close to the black it was drawn on.
ImageDraw.Draw(tile).rounded_rectangle([0, 0, TILE-1, TILE-1], int(20*S), fill=(4, 8, 5, 255),
                                       outline=(74, 112, 76, 255), width=max(1, S))
gl = mark.resize((int(TILE*0.80), int(TILE*0.80)), Image.LANCZOS)
tile.paste(gl, ((TILE - gl.width)//2, (TILE - gl.height)//2), gl)
card.paste(tile, (X, int(58*S)), tile)

# "NOW AVAILABLE" pill
pf = f(BD, 19)
pt = "NOW AVAILABLE"
tw = d.textlength(pt, font=pf)
px0, py0 = X, int(168 * S)
pw, ph = int(tw + 34*S), int(44 * S)
d.rounded_rectangle([px0, py0, px0+pw, py0+ph], ph//2, fill=LIME)
d.text((px0 + pw/2, py0 + ph/2), pt, font=pf, fill=(10, 20, 13), anchor="mm")

d.text((X, int(230*S)), "PICKLECUE",        font=f(AB, 72), fill=WHITE)
d.text((X, int(310*S)), "ON THE APP STORE", font=f(AB, 40), fill=LIME)

badge = Image.open(BADGE).convert("RGBA")
BW = int(224 * S)
badge = badge.resize((BW, int(badge.height * BW / badge.width)), Image.LANCZOS)
card.paste(badge, (X, int(404*S)), badge)

# ---- rounded card edge --------------------------------------------------
out = Image.new("RGB", (W, H), (7, 16, 10))
m = Image.new("L", (W, H), 0)
ImageDraw.Draw(m).rounded_rectangle([0, 0, W-1, H-1], int(20*S), fill=255)
out.paste(card, (0, 0), m)
ImageDraw.Draw(out).rounded_rectangle([0, 0, W-1, H-1], int(20*S),
                                      outline=(46, 78, 56), width=max(1, S))

out = out.resize((1200, 750), Image.LANCZOS)
p = OUT / "assets/app-store-launch-hero.png"
out.save(p, optimize=True)
print(f"  wrote {p.relative_to(REPO)}  {out.size}  {p.stat().st_size//1024} KB")
