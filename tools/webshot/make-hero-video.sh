#!/usr/bin/env bash
# Hero product sequence: discover a court -> see an open game -> join ->
# the match starts -> the score goes live.
#
# Built only from genuine captures of the current shipping product. No mocked
# UI, no invented text, no overlays. Frames are DOWNSCALED to a single phone
# aspect and never upscaled, so screenshot sharpness survives.
#
# Motion is a slow push (about 4% over ~2s) plus a gentle vertical drift, with
# cross-dissolves between scenes — a camera move, not a slideshow cut. Kept
# under 5% so text never softens.
#
# NOTE: each still is fed as a SINGLE frame (no -loop). zoompan emits `d`
# frames per input frame, so looping the image multiplies the duration — that
# mistake produced a 106-second "8-second" hero on the first run.
#
#   bash tools/webshot/make-hero-video.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=/tmp/hero
OUT=videos/hero
mkdir -p "$OUT"

FPS=30
DUR=2.0          # seconds per scene
XF=0.45          # cross-dissolve length
W=608; H=1320    # desktop/tablet render (2x a ~304px hero slot)
MW=456; MH=990   # mobile render — smaller file for phones

build() {          # $1 = width, $2 = height, $3 = output basename
  local w=$1 h=$2 base=$3
  local d=$(python3 -c "print(int($FPS*$DUR))")

  # One filter graph: five zoompan pushes, then four cross-dissolves.
  # zoompan's z ramps per frame; 'on' is the output frame index.
  # y drifts a little so it reads as a camera move rather than a pure zoom.
  ffmpeg -y -loglevel error \
    -i "$SRC/1-discover.png" \
    -i "$SRC/2-games.png" \
    -i "$SRC/3-join.png" \
    -i "$SRC/4-scoring.png" \
    -i "$SRC/5-live.png" \
    -filter_complex "
      [0:v]zoompan=z='1.00+0.04*on/$d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+ih*0.03*on/$d':d=$d:s=${w}x${h}:fps=$FPS,format=yuv420p[v0];
      [1:v]zoompan=z='1.04-0.04*on/$d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$d:s=${w}x${h}:fps=$FPS,format=yuv420p[v1];
      [2:v]zoompan=z='1.00+0.045*on/$d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$d:s=${w}x${h}:fps=$FPS,format=yuv420p[v2];
      [3:v]zoompan=z='1.045-0.045*on/$d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$d:s=${w}x${h}:fps=$FPS,format=yuv420p[v3];
      [4:v]zoompan=z='1.00+0.035*on/$d':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$d:s=${w}x${h}:fps=$FPS,format=yuv420p[v4];
      [v0][v1]xfade=transition=fade:duration=$XF:offset=$(python3 -c "print(round($DUR-$XF,3))")[x1];
      [x1][v2]xfade=transition=fade:duration=$XF:offset=$(python3 -c "print(round(2*($DUR-$XF),3))")[x2];
      [x2][v3]xfade=transition=fade:duration=$XF:offset=$(python3 -c "print(round(3*($DUR-$XF),3))")[x3];
      [x3][v4]xfade=transition=fade:duration=$XF:offset=$(python3 -c "print(round(4*($DUR-$XF),3))")[vout]
    " -map "[vout]" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset veryslow -tune stillimage \
    -movflags +faststart "$OUT/$base.mp4"

  # No WebM. For this screen content x264 with -tune stillimage came out
  # SMALLER than VP9 (931KB vs 1078KB), and h264 is universally supported, so
  # a second encode would only add weight. Re-check if the sources change.
}

build $W  $H  app-sequence
build $MW $MH app-sequence-mobile

# Poster = the first frame, so the still and the video's opening match exactly.
ffmpeg -y -loglevel error -i "$OUT/app-sequence.mp4" -vframes 1 -q:v 3 "$OUT/app-sequence-poster.jpg"

echo
for f in "$OUT"/app-sequence*.{mp4,jpg}; do
  [ -f "$f" ] && printf "  %-46s %7.0f KB\n" "$f" "$(($(stat -f%z "$f")/1024))"
done
printf "  duration: "; ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/app-sequence.mp4"
