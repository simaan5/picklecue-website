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

  # Poster from midpoint
  local mid=$(awk -v d="$total" 'BEGIN{ printf "%.2f", d/2 }')
  ffmpeg -y -hide_banner -loglevel error \
    -ss "$mid" -i "$OUT_DIR/${name}.mp4" -frames:v 1 -q:v 4 \
    "$OUT_DIR/${name}.jpg"

  printf "  → %s.mp4 %s bytes  webm %s bytes  jpg %s bytes  (~%ss)\n" \
    "$name" \
    "$(stat -f%z "$OUT_DIR/${name}.mp4")" \
    "$(stat -f%z "$OUT_DIR/${name}.webm")" \
    "$(stat -f%z "$OUT_DIR/${name}.jpg")" \
    "$total"
}

# ─── Hero reel slots (replace existing 01–06) ─────────────────────────────

# 01 Courts: populated map → tap pin → court detail with amenities
# (~14s)
build_reel "01-courts" \
  01-courts-take2.mp4 2.0 4.5 \
  01-courts-take3.mp4 0.6 9.5

# 02 Games: discovery → tap card → game detail → RSVP → "You're In!" success
# (~16s — combines the original 02 and the standalone 09)
build_reel "02-games" \
  02-games-take1.mp4 0.4 7.0 \
  09-game-join-take1.mp4 3.5 9.0

# 03 Leagues: full overview scroll showing standings, schedule, match settings
# (~13s — single source, longer cut)
build_reel "03-leagues" \
  03-leagues-take3.mp4 0.5 13.0

# 04 Tournaments: search → Spring Showdown detail → live bracket reveal + pan
# (~18s — combines the original 04 and 04b bracket)
build_reel "04-tournaments" \
  04-tournaments-take1.mp4 0.4 8.0 \
  04b-bracket-take1.mp4 19.0 9.5

# 05 Matches: history with stats → Log Match keypad with quick-score chips
# (~16s — combines the original 05 and the standalone 10)
build_reel "05-matches" \
  05-matches-take1.mp4 0.4 7.0 \
  10-match-log-take1.mp4 0.4 9.0

# 06 Privacy/Trust: Settings list → Safety Center hub
# (~17s — combines the original 06 and the standalone 16)
build_reel "06-privacy" \
  06-privacy-take1.mp4 0.5 8.0 \
  16-safety-take1.mp4 0.4 9.0

# ─── Extras (extended single-source for elsewhere on the site) ─────────────

# 07 Home (extend to ~12s)
build_reel "07-home" \
  07-home-take1.mp4 0.4 12.0

# 08 Game Creation (extend wizard reveal to ~14s)
build_reel "08-game-creation" \
  08-game-creation-take2.mp4 0.4 14.0

# Profile combined (drawer + main view)
build_reel "11-profile" \
  12-profile-take1.mp4 0.4 7.5 \
  11-reputation-take1.mp4 0.5 9.0

# Messaging combined (list + group chat)
build_reel "13-chat" \
  13-messaging-take1.mp4 0.5 6.5 \
  14-group-chat-take1.mp4 0.4 8.5

# Standalone bracket (for tournament-deep page)
build_reel "04b-bracket" \
  04b-bracket-take1.mp4 19.0 9.5

# Standalone notifications (sparse but exists)
build_reel "15-notifications" \
  15-notifications-take1.mp4 0.4 8.0

# Standalone safety (separate from 06 combined)
build_reel "16-safety" \
  16-safety-take1.mp4 0.4 9.0

echo ""
echo "Done — combined reels written to $OUT_DIR/"
