#!/usr/bin/env bash
# Post-process raw simulator recordings into web-ready mp4+webm+poster.
# Trim each raw to its premium 6-9s payload, scale to 540 wide, encode both codecs.
set -euo pipefail

RAW_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$RAW_DIR/.." && pwd)"

# Format: name|raw_filename|start_seconds|duration_seconds
# Each entry trims raw[start..start+duration], scales to 540 wide, encodes mp4 + webm + poster.
ENTRIES=(
  "01-courts|01-courts-take3.mp4|0.6|8.5"
  "02-games|02-games-take1.mp4|0.4|8.0"
  "03-leagues|03-leagues-take3.mp4|0.5|7.8"
  "04-tournaments|04-tournaments-take1.mp4|0.4|7.5"
  "04b-bracket|04b-bracket-take1.mp4|18.0|9.0"
  "05-matches|05-matches-take1.mp4|0.4|8.0"
  "06-privacy|06-privacy-take1.mp4|0.5|8.2"
  "07-home|07-home-take1.mp4|0.4|7.6"
  "08-game-creation|08-game-creation-take2.mp4|0.4|9.0"
  "09-game-join|09-game-join-take1.mp4|0.5|8.5"
  "10-match-log|10-match-log-take1.mp4|0.4|8.5"
  "11-profile-detail|11-reputation-take1.mp4|0.5|9.0"
  "12-profile-drawer|12-profile-take1.mp4|0.4|7.5"
  "13-messaging|13-messaging-take1.mp4|0.5|7.5"
  "14-group-chat|14-group-chat-take1.mp4|0.4|8.0"
  "15-notifications|15-notifications-take1.mp4|0.4|8.0"
  "16-safety|16-safety-take1.mp4|0.4|8.5"
)

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r name raw start dur <<<"$entry"
  src="$RAW_DIR/$raw"
  mp4="$OUT_DIR/$name.mp4"
  webm="$OUT_DIR/$name.webm"
  poster="$OUT_DIR/$name.jpg"

  if [ ! -f "$src" ]; then
    echo "SKIP missing: $src"
    continue
  fi

  echo ""
  echo "=== $name ==="
  echo "src=$raw  start=${start}s  dur=${dur}s"

  # 1) MP4 (H.264) — passthrough native variable framerate; libx264 handles VFR fine via -enc_time_base
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$start" -i "$src" -t "$dur" \
    -vf "scale=540:-2:flags=lanczos" \
    -fps_mode cfr -r 30 \
    -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
    -preset slow -crf 24 -movflags +faststart -an \
    "$mp4"

  # 2) WebM (VP9)
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$start" -i "$src" -t "$dur" \
    -vf "scale=540:-2:flags=lanczos" \
    -fps_mode cfr -r 30 \
    -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -an \
    "$webm"

  # 3) Poster (jpg from ~midpoint)
  mid=$(awk -v s="$start" -v d="$dur" 'BEGIN { printf "%.2f", s + d/2 }')
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$mid" -i "$src" -frames:v 1 \
    -vf "scale=540:-2:flags=lanczos" -q:v 4 \
    "$poster"

  printf "  mp4   : %s (%s bytes)\n" "$(basename "$mp4")"   "$(stat -f%z "$mp4")"
  printf "  webm  : %s (%s bytes)\n" "$(basename "$webm")" "$(stat -f%z "$webm")"
  printf "  poster: %s (%s bytes)\n" "$(basename "$poster")" "$(stat -f%z "$poster")"
done

echo ""
echo "Done."
