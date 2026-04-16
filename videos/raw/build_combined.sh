#!/usr/bin/env bash
# Build combined 13–18s product reels by concatenating raw simulator segments.
# Replaces the 6 hero-slot files in /videos/ in place — no HTML changes needed.
set -euo pipefail

RAW_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$RAW_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d -t picklecue_reels_XXXX)"
trap "rm -rf '$TMP_DIR'" EXIT

# Reel definition format:
#   reel <name>
#   seg <raw_filename> <start_seconds> <duration_seconds>
#   ...
#
# Each seg gets trimmed to TMP_DIR with identical H.264 params, then concat-demuxed.

# Reusable encode profile for segment temps (must be IDENTICAL across segments
# of one reel for the concat demuxer to copy without re-encode).
#
# mpdecimate drops near-duplicate frames so static screen pauses get visually
# compressed (max=12 caps any pause at ~0.4s @ 30fps). Motion stays at full
# speed. setpts re-times the kept frames into a continuous stream.
SEG_VF="scale=540:-2:flags=lanczos"
SEG_OPTS=(-fps_mode cfr -r 30
          -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p
          -preset medium -crf 22 -an)

trim_segment() {
  local src="$1" start="$2" dur="$3" out="$4"
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$start" -i "$RAW_DIR/$src" -t "$dur" \
    -vf "$SEG_VF" "${SEG_OPTS[@]}" \
    "$out"
}

build_reel() {
  local name="$1"; shift
  echo ""
  echo "=== $name ==="
  local list="$TMP_DIR/${name}_list.txt"
  > "$list"
  local total=0 i=0
  while [[ $# -gt 0 ]]; do
    local src="$1" start="$2" dur="$3"; shift 3
    local seg_out="$TMP_DIR/${name}_seg${i}.mp4"
    echo "  segment $i: $src @ ${start}s for ${dur}s"
    trim_segment "$src" "$start" "$dur" "$seg_out"
    echo "file '$seg_out'" >> "$list"
    total=$(awk -v t="$total" -v d="$dur" 'BEGIN{ printf "%.2f", t+d }')
    i=$((i+1))
  done

  # Concat (copy streams since all segments share encoding)
  ffmpeg -y -hide_banner -loglevel error \
    -f concat -safe 0 -i "$list" -c copy -movflags +faststart \
    "$OUT_DIR/${name}.mp4"

  # WebM (re-encode from concat list)
  ffmpeg -y -hide_banner -loglevel error \
    -f concat -safe 0 -i "$list" \
    -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -an \
    "$OUT_DIR/${name}.webm"

  # Poster from midpoint — force standard pixel format so mjpeg encodes cleanly
  local mid=$(awk -v d="$total" 'BEGIN{ printf "%.2f", d/2 }')
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$mid" -i "$OUT_DIR/${name}.mp4" -frames:v 1 \
    -vf "format=yuvj420p" -q:v 4 \
    "$OUT_DIR/${name}.jpg"

  printf "  → %s.mp4 %s bytes  webm %s bytes  jpg %s bytes  (~%ss)\n" \
    "$name" \
    "$(stat -f%z "$OUT_DIR/${name}.mp4")" \
    "$(stat -f%z "$OUT_DIR/${name}.webm")" \
    "$(stat -f%z "$OUT_DIR/${name}.jpg")" \
    "$total"
}

# ─── Hero reel slots (replace existing 01–06) ─────────────────────────────

# 01 Courts: search → court detail → Chat chip → court chat → Reviews chip
# Take 4 is the action-dense recording (~11s)
build_reel "01-courts" \
  01-courts-take4.mp4 0.5 11.0

# 02 Games: discovery → tap card → game detail (5s) + tap RSVP → "You're In!" (5s)
# Tight cuts, ~10s total
build_reel "02-games" \
  02-games-take1.mp4 0.5 5.0 \
  09-game-join-take1.mp4 4.0 6.5

# 03 Leagues: standings/match settings overview (~7s tight)
build_reel "03-leagues" \
  03-leagues-take3.mp4 0.5 7.5

# 04 Tournaments: Spring Showdown detail → Players list (16 pts w/ seeds) → Bracket → pan
# Take 2 is action-dense with Players modal + bracket reveal in one recording (~13s)
build_reel "04-tournaments" \
  04c-tour-take2.mp4 0.4 13.0

# 05 Matches: history+stats (5s) → Log Match keypad (6s)  ~11s
build_reel "05-matches" \
  05-matches-take1.mp4 0.5 5.0 \
  10-match-log-take1.mp4 0.5 6.0

# 06 Privacy/Trust: Settings list (4s) → Safety Center hub (6s)  ~10s
build_reel "06-privacy" \
  06-privacy-take1.mp4 0.5 4.5 \
  16-safety-take1.mp4 0.5 6.0

# ─── Extras (extended single-source for elsewhere on the site) ─────────────

# 07 Home: weather + featured game + scroll  (~7s tight)
build_reel "07-home" \
  07-home-take1.mp4 0.4 7.0

# 08 Game Creation: wizard quick-start cards + scroll to format  (~9s)
build_reel "08-game-creation" \
  08-game-creation-take2.mp4 0.4 9.0

# Profile combined: drawer (4s) → profile detail (4s) → DUPR rating (5s)  ~13s
build_reel "11-profile" \
  12-profile-take1.mp4 0.4 4.5 \
  11-reputation-take1.mp4 0.5 4.5 \
  dupr-take1.mp4 0.4 5.0

# DUPR rating standalone (~6s)
build_reel "11b-dupr" \
  dupr-take1.mp4 0.4 6.0

# Messaging combined: list (4s) + group chat (5s)  ~9s
build_reel "13-chat" \
  13-messaging-take1.mp4 0.5 4.5 \
  14-group-chat-take1.mp4 0.4 5.5

# Standalone bracket (~6s)
build_reel "04b-bracket" \
  04b-bracket-take1.mp4 19.5 6.5

# Standalone notifications (sparse, ~5s)
build_reel "15-notifications" \
  15-notifications-take1.mp4 0.4 5.0

# Standalone safety (~6s)
build_reel "16-safety" \
  16-safety-take1.mp4 0.4 6.0

echo ""
echo "Done — combined reels written to $OUT_DIR/"
