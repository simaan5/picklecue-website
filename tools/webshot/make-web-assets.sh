#!/usr/bin/env bash
# Regenerate every /images/web asset the homepage uses, from the captures in
# tools/webshot/out. Repeatable on purpose: after a re-capture the derived
# crops must be rebuilt too, or the page keeps showing the old pixels.
#
# Crops are deliberate and framed — each one targets the control the tile is
# about, at a CONSISTENT aspect so tiles read at the same size. The page never
# crops with CSS (object-fit is `contain` everywhere), so cropping happens here
# where it can be reviewed.
set -euo pipefail
cd "$(dirname "$0")/../.."
O=tools/webshot/out
W=images/web
DECK="/Volumes/Mini Drive 2/Xcode Projects/PickleCue/qa/store-screenshots/build-213-deck-v4/raw"
mkdir -p "$W"

pair() { # src, name, maxbig, maxsmall
  magick "$1" -resize "${3}x${3}>" -quality 82 "$W/$2.webp"
  magick "$1" -resize "${4}x${4}>" -quality 78 "$W/$2-sm.webp"
}

# ---- whole captures -------------------------------------------------------
for f in org-control-room org-checkin org-scorekeeper-pad org-qr-poster \
         org-player-book reg-form reg-waiver reg-partner reg-event-home \
         reg-roster score-live-desktop score-live-phone score-live-tv \
         score-bracket live-bracket live-results league-standings \
         mkt-bracket-champion mkt-results mkt-results-phone mkt-tv-final \
         mkt-champion-me mkt-whats-next; do
  [ -f "$O/$f.png" ] && pair "$O/$f.png" "$f" 1600 760
done

# ---- lifecycle steps: each cropped to the control it is about -------------
magick "$O/reg-form.png"    -crop 1206x1150+0+380  +repage /tmp/_s1.png
magick "$O/reg-waiver.png"  -crop 1206x1080+0+1560 +repage /tmp/_s2.png
magick "$O/reg-partner.png" -crop 1206x900+0+1720  +repage /tmp/_s3.png
magick "$O/org-checkin.png" -crop 2880x1180+0+300  +repage /tmp/_s4.png
pair /tmp/_s1.png step-reg-form    1200 620
pair /tmp/_s2.png step-reg-waiver  1200 620
pair /tmp/_s3.png step-reg-partner 1200 620
pair /tmp/_s4.png step-org-checkin 1200 620

# ---- scoring tiles: one consistent landscape aspect ------------------------
magick "$DECK/s2-live-scoring.png"    -crop 1320x880+0+430   +repage /tmp/_c1.png
magick "$O/org-scorekeeper-pad.png"   -crop 2020x640+430+390 +repage /tmp/_c2.png
magick "$O/score-live-desktop.png"    -crop 1000x310+420+820 +repage /tmp/_c3.png
magick "$O/mkt-tv-final.png"          -crop 2880x800+0+60    +repage /tmp/_c4.png
pair /tmp/_c1.png sc-app    1200 640
pair /tmp/_c2.png sc-keeper 1200 640
pair /tmp/_c3.png sc-public 1200 640
pair /tmp/_c4.png sc-tv     1600 760

# ---- spectator tiles ------------------------------------------------------
magick "$O/org-qr-poster.png"     -crop 1840x760+360+530 +repage /tmp/_p1.png
magick "$O/reg-event-home.png"    -crop 1206x760+0+230   +repage /tmp/_p2.png
magick "$O/mkt-whats-next.png"    -crop 1206x820+0+1420  +repage /tmp/_p3.png
magick "$O/mkt-results-phone.png" -crop 1206x800+0+1330  +repage /tmp/_p4.png
pair /tmp/_p1.png sp-qr      1200 640
pair /tmp/_p2.png sp-event   1200 640
pair /tmp/_p3.png sp-next    1200 640
pair /tmp/_p4.png sp-results 1200 640

# ---- iOS purpose crops ----------------------------------------------------
CR="/Volumes/Mini Drive 2/Xcode Projects/PickleCue/qa/marketing-account/web-crops"
for f in ios-courts-map ios-home-crop ios-scoring-crop ios-live-activity \
         ios-standings ios-bracket-crop ios-roster ios-match-history \
         ios-player-stats ios-chat-thread; do
  [ -f "$CR/$f.png" ] && pair "$CR/$f.png" "$f" 1100 620
done

echo "  regenerated $(ls "$W"/*.webp | wc -l | tr -d ' ') web assets"
