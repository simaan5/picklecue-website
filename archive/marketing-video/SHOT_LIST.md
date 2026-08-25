# PickleCue Marketing Reel — Shot List

> **Demo user:** Andrew S. (pooh / simaanandrew@gmail.com)
> **Sim:** iPhone 17 Pro, UUID `CF00A6D6-8340-4F88-B683-6C130EA6EB86`
> **Bundle:** `com.andrewsimaan.PickleCue`
> **Resolution:** 1206×2622 (sim native) → website target 540×1170 (45% downscale)
> **Codec:** simulator capture in HEVC, post-process to H.264 mp4 + VP9 webm + jpg poster
> **Demo data:** 12 upcoming games, 16-player Spring Showdown tournament, Bay Area Doubles Ladder league, 8 matches, 3 active chat threads, 30 unread notifications, 6 public activity items.
> **Naming:** `NN-feature.mp4` (raw → final). Two-digit prefix matches website reel slots 01–06.

## Reel Slots (existing index.html — `/videos/0N-name.{mp4,webm,jpg}`)

| Slot | Feature | Story |
|------|---------|-------|
| 01 | Courts | Map zoom → tap pin → premium court detail |
| 02 | Games | Discover upcoming games → open detail → join |
| 03 | Leagues | Open Leagues → tap "Bay Area Doubles Ladder" → standings |
| 04 | Tournaments | Open tournament → bracket pinch-zoom + participants |
| 05 | Matches | History → Log a match → score entry |
| 06 | Privacy | Settings → safety controls (block/mute/account) |

## Extended Clips (additional must-record marketing)

| ID | Feature | Story |
|----|---------|-------|
| 07 | Home feed | Personalized feed: weather + featured games + activity |
| 08 | Game creation | Create game wizard end-to-end |
| 09 | Game join | Tap RSVP from game detail with player avatars updating |
| 10 | Match logging | Open log match → enter score → save → updated history |
| 11 | DUPR / rating | Profile → reputation hub → rating breakdown |
| 12 | Profile / stats | Profile main → trust score + recent matches + favorites |
| 13 | Messaging | Chat list → open Sarah K. thread → live messages |
| 14 | Community / group chat | Open group "Weekend Pickleballers 🏓" |
| 15 | Notifications | Open notifications drawer → tap actionable card |
| 16 | Privacy / safety | Settings → safety hub → blocks/mutes/reports |

---

## Per-clip detail

### 01 — Courts overview & detail (6–9s)
- **Start:** Courts tab, map centered on SF showing several active green pins.
- **Sequence:**
  1. Pinch-out a touch (or hold), let map settle (1.0s)
  2. Tap "Presidio Wall Playground Pickleball" pin (1.0s)
  3. Court preview card slides up (1.0s)
  4. Tap "View Details" (0.6s)
  5. Court detail scrolls slightly to reveal amenities/games (2.5s)
- **End frame:** Court detail page with live games and amenity row visible.
- **Recommended caption:** "Find courts. See who's playing."
- **Slot:** 01

### 02 — Games discovery & RSVP (6–10s)
- **Start:** Play tab → Games list. 12 upcoming games visible with player avatars.
- **Sequence:**
  1. Slow scroll down 1 card length (1.5s)
  2. Tap "Competitive 4.0+ at Louis Sutter" (0.6s)
  3. Game detail loads — show roster (4 players) + skill range + court (2.0s)
  4. Tap RSVP / Join CTA (0.6s) — confirm pulse (1.0s)
  5. Hold on filled card (1.0s)
- **End:** Joined state visible.
- **Caption:** "Find a game. Join in seconds."
- **Slot:** 02

### 03 — Leagues + standings (6–9s)
- **Start:** Leagues tab → "Bay Area Doubles Ladder" card visible with status `active`.
- **Sequence:**
  1. Tap league card (0.5s)
  2. Detail loads (1s)
  3. Tap "Standings" tab (0.6s)
  4. Standings table animates in (1.5s)
  5. Slow scroll showing rankings 1–8 (3s)
- **End:** Andrew & Partner at #2 highlighted.
- **Caption:** "Compete weekly. Climb the ladder."
- **Slot:** 03

### 04 — Tournament bracket (7–10s)
- **Start:** Leagues tab → Tournaments sub-tab → "PickleCue Spring Showdown" card.
- **Sequence:**
  1. Tap tournament card (0.5s)
  2. Detail header loads with prize $600 + 16 participants (1s)
  3. Tap "Bracket" tab (0.6s)
  4. Bracket canvas fades in (1s)
  5. Pinch-zoom into round 1 (2s)
  6. Pan across to next round (2s)
- **End:** Bracket visible with seeds.
- **Caption:** "Run a tournament. Live brackets, zero friction."
- **Slot:** 04

### 05 — Matches history (6–9s)
- **Start:** Matches tab → 8 recent matches visible.
- **Sequence:**
  1. Hold 1s on header
  2. Slow scroll showing W/L cards with opponent avatars (3s)
  3. Tap top "11-8" win card (0.6s)
  4. Match detail loads showing teams + court + duration (2.5s)
- **End:** Match detail.
- **Caption:** "Every match counted. Every rally tracked."
- **Slot:** 05

### 06 — Privacy / safety controls (6–9s)
- **Start:** Settings tab → Privacy & Safety section visible.
- **Sequence:**
  1. Tap "Safety" row (0.6s)
  2. Safety hub loads with tabs (Tips, Contacts, Blocked, Muted, Reports) (1.5s)
  3. Tap "Blocked" tab — list appears (1s)
  4. Tap back, tap "Privacy Settings" (1s)
  5. Show toggles: Ghost mode, Hide from search, Block messages from non-friends (2s)
- **End:** Privacy toggles visible.
- **Caption:** "Yours to control. Always."
- **Slot:** 06

### 07 — Home feed (6–8s)
- **Start:** Home tab → personalized feed with weather card + featured game + activity items.
- **Sequence:** Slow scroll down 2 card lengths (4s); subtle bounce at end.
- **Caption:** "Your hub. Players, games, weather — at a glance."

### 08 — Game creation wizard (7–10s)
- **Start:** Play tab → tap "+" / Create Game button.
- **Sequence:** Pick court (1s) → time (1s) → format Doubles (1s) → skill 3.5–4.5 (1s) → tap Create (1s) → success state with new card (2s).
- **Caption:** "Create a game in 30 seconds."

### 09 — Game join with avatar pulse (6–8s)
- **Start:** Game detail page (Sunset doubles @ Presidio).
- **Sequence:** Tap RSVP (0.5s) → confirm modal → Join (0.5s) → roster avatar fills with check (2s).
- **Caption:** "Tap. You're in."

### 10 — Match logging (8–10s)
- **Start:** Matches tab → "Log Match" button.
- **Sequence:** Tap Log Match → pick teams (Sarah K. + me vs Tyler M. + Zoe P.) (2s) → enter scores 11-8 (2s) → tap Save (0.5s) → see new card animate in at top of history (2s).
- **Caption:** "Log a match. Update your rating instantly."

### 11 — DUPR / Reputation (6–9s)
- **Start:** Profile → Reputation hub.
- **Sequence:** Show trust score gauge (2s) → scroll to badges (2s) → tap "Give Signals" preview / DUPR linked badge (2s).
- **Caption:** "Trust, rating, reputation — earned through play."

### 12 — Profile main (6–8s)
- **Start:** Profile tab via drawer.
- **Sequence:** Show header (avatar, Andrew S., 4.5 DUPR badge) (1s) → scroll past stats (W/L, streak) (2s) → recent matches list (2s) → favorite courts (1s).
- **Caption:** "One profile. Your full pickleball life."

### 13 — Messaging / DM (6–9s)
- **Start:** Chat tab → Messages list with Sarah K. thread on top (recent timestamp).
- **Sequence:** Tap Sarah K. (0.5s) → thread loads with 6 messages (1.5s) → user types "On my way 🚗" (2s) → send (0.5s) → bubble appears (1s).
- **Caption:** "Coordinate every game. Right inside the app."

### 14 — Group chat (6–8s)
- **Start:** Chat tab → Groups → "Weekend Pickleballers 🏓".
- **Sequence:** Tap group (0.5s) → thread loads with 7 messages from 5 different people (1.5s) → scroll up showing avatars (3s).
- **Caption:** "Built for crews."

### 15 — Notifications (6–8s)
- **Start:** Home → tap bell icon (top-right) OR Settings → Notifications.
- **Sequence:** Notification list slides in (1s) → 8 cards visible (friend req, league update, tournament starting, match logged, etc.) (3s) → tap top friend-request card (0.5s) → action sheet (1s).
- **Caption:** "Never miss your next game."

### 16 — Privacy + account controls (6–8s)
- **Start:** Settings → Account & Privacy section.
- **Sequence:** Tap "Privacy Settings" (0.5s) → toggles row (Ghost mode, Hide from search) (2s) → tap back, tap "Data export" (0.5s) → "Delete account" preview (2s).
- **Caption:** "Built for control. Built for trust."

---

## Recording cadence

1. Boot sim → ensure Andrew S. is logged in.
2. For each clip:
   - Navigate to **start** screen first (NOT yet recording).
   - Wait 0.5s for layout settle.
   - `mcp__ios-simulator-mcp__record_video` with `output_path=videos/raw/<slot>-<feature>-takeN.mp4`.
   - Run sequence (tap/swipe), each step 0.6–2s.
   - `mcp__ios-simulator-mcp__stop_recording`.
   - Inspect with screenshot frames; if hesitation or accidental tap → retake.
3. After all raw captured → ffmpeg post-process: trim, scale to 540×1170, encode mp4 (H.264) + webm (VP9), poster jpg from frame 1.

## Risks / pre-recording polish

- The `LeaguesMainView` may include both leagues + tournaments tabs — verify before clip 03/04.
- DUPR hub may require linking flow first; if linked badge doesn't appear, sub in reputation/trust score visualizer.
- Profile drawer entry point varies; confirm via `ui_describe_all`.
- Group chat title with 🏓 emoji must render correctly; verify on first take.
- For RSVP CTA visibility, test the chosen game has slots remaining (Sunset doubles @ Presidio: 4 max, 4 RSVPed → may need to switch to Crocker Amazon ladder which has 2/4).
