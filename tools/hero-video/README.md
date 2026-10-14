# Homepage hero video — source

`/videos/hero/hero-tour.{mp4,webm}` and `hero-tour-poster.jpg` are built from
this folder. Nothing in the video was recorded against production.

## Provenance

| Piece | Where it comes from |
|---|---|
| The ten app screens | iOS repo `qa/store-screenshots/build-213-deck-v4/raw/*.png`, captured from the MarketingCapture fixture world (`qa/marketing-account`) on the iPhone 17 Pro Max simulator at 1320×2868. Routes and SHA-256s: `manifests/SESSION-CAPTURES.json` in that folder. The copies used for the 2026-10-14 render were byte-identical to those masters. |
| Composition | `comp.js` (the `seek(t)` timeline), `index.html` (layers, brand tokens), `motion.js` (engine copy). |
| Engine | [raw-motion](https://github.com/eneskirca/raw-motion) at commit `2e96bc3e5b1a3d214578d32338a0c49f73c1311a`. Zero npm dependencies; drives Chrome over the DevTools protocol. |
| Fonts | The site's own Instrument Sans and JetBrains Mono woff2 files (`fonts/`), copied next to `index.html` at build time. |

Why this exists: the previous hero (`app-tour.*`, August 2026) was a screen
recording of live production and showed five PlayPickleball venues that have
since been soft-deleted — see `docs/website-cro-audit-2026-08-25.md` P0-1.
Court names, players, scores and chat in this video are all fixture data.

## Rebuild

```sh
git clone https://github.com/eneskirca/raw-motion /tmp/raw-motion
mkdir /tmp/hero && cp tools/hero-video/* /tmp/hero/
cp fonts/instrumentsans-*.woff2 fonts/jetbrainsmono-*Dcwgknk-4.woff2 /tmp/hero/
mkdir /tmp/hero/shots && cp <ios-repo>/qa/store-screenshots/build-213-deck-v4/raw/*.png /tmp/hero/shots/

node /tmp/raw-motion/bin/raw-motion.mjs doctor        # node ≥ 22, Chrome, ffmpeg, python3 + numpy
node /tmp/raw-motion/bin/raw-motion.mjs stills /tmp/hero 0.9,1.2,4.75,13.0   # look before you build
node /tmp/raw-motion/bin/raw-motion.mjs build  /tmp/hero --workers 8 --grain 0   # → /tmp/hero/out.mp4 (1080×2346, 60 fps, with soundtrack)
```

The master keeps raw-motion's synthesized soundtrack. The site autoplays muted,
so the web encodes drop audio and halve the frame rate:

```sh
ffmpeg -i out.mp4 -an -vf "scale=750:-2,fps=30,format=yuv420p" -c:v libx264 -preset veryslow -crf 28 -movflags +faststart hero-tour.mp4
ffmpeg -i out.mp4 -an -vf "scale=750:-2,fps=30"                -c:v libvpx-vp9 -b:v 0 -crf 42 -row-mt 1 -deadline good -cpu-used 1 hero-tour.webm
ffmpeg -ss 1.0 -i out.mp4 -frames:v 1 -vf "scale=750:-2" -q:v 4 hero-tour-poster.jpg
```

The phone mask on the page is 402/874 (≈0.46); the canvas is 1080×2346 (≈0.46)
so nothing is cropped. The 2026-10-14 encodes are 2.6 MB (mp4) and 2.2 MB (webm):
every frame moves, so this costs more per second than the old mostly-static
recording did. `--grain 0` matters: film grain roughly doubles the size. `/videos/*` is cached for
30 days with no `?v=`, so a changed video must ship under a new filename.

## Editing

Each screen in `comp.js` is one `SHOTS` entry: entrance type (`A` slide up,
`B` swipe with the ball, `C` punch zoom), a focal point and zoom for the hold,
an optional tap point for the ripple, and a chip (kicker + headline, `<b>` is
green) with its `y`. Render stills at the moments you changed before building.
A `seek(t)` scene is a pure function of time, so a still *is* that frame.
