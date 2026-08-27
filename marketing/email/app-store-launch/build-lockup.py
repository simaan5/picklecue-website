#!/usr/bin/env python3
"""Header lockup: the C mark to the left of the PickleCue wordmark.

Built as ONE image on purpose. Two <img> tags side by side in an email is a
per-client alignment gamble — Outlook adds baseline gaps, Gmail collapses
whitespace between them, and the vertical centring drifts. One flattened image
renders identically everywhere and costs one request instead of two.

Both halves are official, unaltered assets, scaled on both axes equally:
  mark     ~/Desktop/Logo Transparent.png      (the C mark)
  wordmark images/wordmark-on-dark.png         (dark colourway, white + lime)
"""
from PIL import Image
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[3]
OUT  = Path(__file__).resolve().parent / "assets/picklecue-lockup.png"
MARK = Path.home() / "Desktop/Logo Transparent.png"
WORD = REPO / "images/wordmark-on-dark.png"
PAPER = (13, 26, 18)

for p in (MARK, WORD):
    if not p.exists(): sys.exit(f"missing: {p}")

S = 2                     # 2x for retina; displayed at half these numbers
MARK_H = 44 * S           # mark height
GAP    = 14 * S
WORD_H = 34 * S           # wordmark cap height, optically matched to the mark

mark = Image.open(MARK).convert("RGBA")
mark = mark.resize((MARK_H, MARK_H), Image.LANCZOS)

word = Image.open(WORD).convert("RGBA")
word = word.resize((round(word.width * WORD_H / word.height), WORD_H), Image.LANCZOS)

W = mark.width + GAP + word.width
H = MARK_H
canvas = Image.new("RGBA", (W, H), PAPER + (255,))
canvas.paste(mark, (0, 0), mark)
canvas.paste(word, (mark.width + GAP, (H - word.height) // 2), word)
canvas.convert("RGB").save(OUT, optimize=True)
print(f"  wrote {OUT.name}  {canvas.size}  -> displayed {W//S}x{H//S}  {OUT.stat().st_size//1024} KB")
