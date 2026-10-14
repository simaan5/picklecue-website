#!/usr/bin/env bash
# Render every clip scene (clips/c*/) with raw-motion, then encode the web files into $OUT.
#   OUT=/path/to/picklecue-website/videos/demo ./build-all.sh [c01-home ...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RM="$HERE/../raw-motion/bin/raw-motion.mjs"
OUT="${OUT:?set OUT to the website videos/demo directory}"
mkdir -p "$OUT"
CLIPS=("$@"); [ ${#CLIPS[@]} -gt 0 ] || CLIPS=($(cd "$HERE" && ls -d c*/ | tr -d /))
for c in "${CLIPS[@]}"; do
  d="$HERE/$c"
  node "$RM" build "$d" --workers 8 --grain 0 >"$d/build.log" 2>&1 || { tail -5 "$d/build.log"; exit 1; }
  # muted, 30 fps, 240 px wide (2x of the 118 px tile); poster = frame 0
  ffmpeg -y -loglevel error -i "$d/out.mp4" -an -vf "scale=240:-2,fps=30,format=yuv420p" -c:v libx264 -preset veryslow -crf 27 -movflags +faststart "$OUT/$c.mp4"
  ffmpeg -y -loglevel error -i "$d/out.mp4" -an -vf "scale=240:-2,fps=30" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 1 "$OUT/$c.webm"
  ffmpeg -y -loglevel error -i "$d/out.mp4" -frames:v 1 -vf "scale=240:-2" -q:v 4 "$OUT/$c.jpg"
  printf "%-14s mp4 %6d KB  webm %6d KB  jpg %4d KB\n" "$c" $(( $(stat -f%z "$OUT/$c.mp4") / 1024 )) $(( $(stat -f%z "$OUT/$c.webm") / 1024 )) $(( $(stat -f%z "$OUT/$c.jpg") / 1024 ))
done
