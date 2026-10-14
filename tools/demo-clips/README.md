# /demo clip strip — source

`/videos/demo/c01-home … c10-schedule.{mp4,webm,jpg}` are the ten short loops under the
demo iPhone on `/demo/`. Nothing in them was recorded against production.

## Provenance (2026-10-14)

| Piece | Where it comes from |
|---|---|
| Ten app screens | Captured by `capture-raws.py` from the **current build** (215, iOS repo `origin/main` f98a7d22) on the **iPhone 17 Pro Max** simulator, iOS 26.0.1, 1320×2868, against the MarketingCapture fixture world (`qa/marketing-account`, snapshot installed by `install-snapshot.sh`). The simulator's app container was wiped first so no earlier session data leaked in. SHA-256s, routes, settle times: `CAPTURES.json`. |
| Lock Screen date | The Lock Screen preview used to print a hardcoded "Wednesday, August 5". iOS PR #608 makes it the capture date; `s7` was captured from that branch (identical to main otherwise). |
| Schedule route | `-previewMarketing schedule` is not a screen (falls to the paywall). The Full Schedule sheet comes from `-previewMarketing home -homeSheet schedule`. |
| Composition | `gen.mjs` writes one raw-motion scene per screen: a 4 s seamless loop (settled → tap ripple → punch zoom to the focal point → ease back). Frame 0 == frame 4.0, so the loop has no seam. |
| Engine | [raw-motion](https://github.com/eneskirca/raw-motion) at `2e96bc3e5b1a3d214578d32338a0c49f73c1311a`. |

The iPhone 18 Pro Max device type exists in Xcode 27 but refuses the only installed runtime
(iOS 26.0.1), so the 17 Pro Max is the newest model that boots here.

## Rebuild

```sh
# 1. capture (sim booted, Debug app from origin/main installed, snapshot installed)
python3 tools/demo-clips/capture-raws.py                      # → raw-215/*.png + CAPTURES.json next to the script
# 2. scenes
SHOTS_DIR=$PWD/raw-215 node tools/demo-clips/gen.mjs           # → c01-home/ … c10-schedule/ next to gen.mjs
# 3. render + encode (needs raw-motion cloned one level up as ../raw-motion)
OUT=$PWD/videos/demo tools/demo-clips/build-all.sh             # 240 px wide, 30 fps, muted; poster = frame 0
```

`gen.mjs` expects `../scene/motion.js` (raw-motion's engine file) next to it; copy it from the
raw-motion checkout. Ship changed clips under NEW filenames: `/videos/*` is cached 30 days
with no `?v=`.

## Page

`demo/index.html` `.demo-clips` (inside `.demo-stage`, under `.iphone-frame`), styles at the end
of `demo/demo.css`, in-view playback at the end of `demo/demo.js` (only tiles ≥60 % visible
play; `prefers-reduced-motion` gets the posters).
