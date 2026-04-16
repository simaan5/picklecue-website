# PickleCue Marketing Demo Reel — Delivery

**Date:** 2026-04-16
**Demo user:** Andrew S. (testuser1@gmail.com → display_name "Andrew S.", skill 4.5)
**Sim:** iPhone 17 Pro · UUID `CF00A6D6-8340-4F88-B683-6C130EA6EB86` · iOS 18.x
**Bundle:** `com.andrewsimaan.PickleCue`
**Supabase project:** `uejmhtdfbqbotvbqvfja` (production)
**Repo (web):** `/Volumes/Mini Drive 2/Xcode Projects/picklecue-website`
**Repo (app):** `/Volumes/Mini Drive 2/Xcode Projects/PickleCue`

---

## TL;DR

Seven 540×1174 6–9s clips encoded as mp4 + webm + jpg poster, dropped into `/videos/` and auto-wired into the existing reel slots in `index.html`. The reel auto-plays the active clip and hides the "coming soon" placeholder once any video has data.

| Slot | Asset | Duration | Story shown |
|------|-------|----------|------------|
| 01 | `videos/01-courts.{mp4,webm,jpg}` | 8.5s | Search → Presidio Wall court detail with amenities + actions |
| 02 | `videos/02-games.{mp4,webm,jpg}` | 8.0s | Play tab list → tap Indoor open play → game detail with skill range + RSVP |
| 03 | `videos/03-leagues.{mp4,webm,jpg}` | 7.8s | Bay Area Doubles Ladder overview: stats, schedule, match settings |
| 04 | `videos/04-tournaments.{mp4,webm,jpg}` | 7.5s | PickleCue Spring Showdown — $600 prize, 16/16, Single Elim, 4-action grid |
| 05 | `videos/05-matches.{mp4,webm,jpg}` | 8.0s | Matches history: 3 cards, 2-1 record, 2W streak, 66.7% win rate |
| 06 | `videos/06-privacy.{mp4,webm,jpg}` | 8.2s | Settings → Pro upgrade card → Notifications/Privacy/Appearance picker |
| 07 | `videos/07-home.{mp4,webm,jpg}` | 7.6s | Home feed: weather, featured game, action chips, populated cards (bonus / hero candidate) |

Total payload: ~1.5 MB across all 7 clips × 3 formats. Clip 07 is not in the existing reel slot grid; it is available for hero/feature placement.

---

## Phase 1 — App audit

Spawned an Explore agent against `PickleCue/Features/*` and produced a master inventory of **140+ Views**:
- ~25 must-record (core marketing surface area)
- ~95 optional (deep-dives / secondary screens)
- ~15 internal-only (admin / debug / QA / fixtures)

The 7 clips delivered cover the 6 must-record families currently exposed in `index.html`'s reel slot grid (Courts, Games, Leagues, Tournaments, Matches, Privacy/Settings) plus one bonus (Home feed).

Additional must-record clips identified but not produced this session (see "Backlog" below): game creation, RSVP join with avatar pulse, log-match score keypad, DUPR/reputation hub, profile main, messaging DM, group chat, notifications, full safety hub.

---

## Phase 2 — Demo data audit

Findings before seeding:
- `generate_marketing_demo_data` and fixture-generator RPCs were **dropped in production** by `20260322_001_drop_debug_functions.sql` (CRITICAL #2/#3 in the audit report).
- 16 marketing fixture users (`Sarah K.`, `Marcus T.`, etc.) **already existed** in `profiles` + `auth.users` from the Feb 2026 seed run.
- **0 upcoming games**, **0 activity feed items**, league/tournament data referenced wrong demo user (originally `pooh`).
- Logged-in simulator user is `James R.` (`testuser1@gmail.com` / UUID `2790abf5-4aa1-4ad2-a2ec-e56cff747aef`), not pooh — so all seeded ownership had to be reassigned.
- Several schema mismatches relative to the dropped seed function:
  - `leagues.created_by` (not `owner_id`), `leagues.max_teams` (not `max_members`), `leagues.points_to_win` (not `points_for_win`), `leagues.start_date`/`end_date` (not `season_start`/`season_end`).
  - `chat_participants` has no `is_admin` / `muted_by_admin` columns — only `id, thread_id, user_id, joined_at, last_read_at, is_muted`.
  - `league_standings.point_differential` and `win_percentage` are **generated columns** — must not be set on insert.
  - `notifications.type` is constrained to `{game_invite, game_reminder, game_cancelled, friend_request, match_verified, tournament_update, court_update, system}`.
  - `activity_feed.activity_type` is constrained to `{match_logged, match_won, match_lost, game_created, game_joined, game_completed, tournament_joined, tournament_won, tournament_placed, achievement_earned, rating_milestone, friend_added, court_reviewed, court_favorited, streak_achieved, level_up}`.
  - `games.status` is `{scheduled, in_progress, completed, cancelled}` (not `open`).
  - `game_rsvps.status` is `{confirmed, ...}` (not `going`).
  - `tournaments.status` is `{draft, registration, in_progress, completed, cancelled}` (not `registration_open`).
  - `league_members.role` is `{organizer, moderator, player}` (not `member`).

---

## Phase 3 — Demo world seeded

Idempotent seed file: `supabase/seeds/marketing_demo_seed.sql` (in the `PickleCue/` repo).

**For demo user `Andrew S.` (`2790abf5-4aa1-4ad2-a2ec-e56cff747aef`):**
- Profile bumped: display_name `Andrew S.`, skill_level 4.5, bio, avatar_url
- 12 upcoming games over next 7 days at 8 SF/Oakland courts, mix of doubles/singles/open, varied skill ranges, with 37 RSVPs (Andrew organizes 3, joined 5 others)
- 1 active league (`Bay Area Doubles Ladder`), 8 teams with realistic standings (Andrew at #2, 6-2)
- 1 marquee tournament (`PickleCue Spring Showdown`) — Single Elimination, $25 entry / $600 prize, 16/16 confirmed participants, starts in 6 days
- 3 active chat threads (Sarah K. DM, Marcus T. DM, "Weekend Pickleballers 🏓" group of 6) with realistic recent messages (latest within last hour)
- 8 notifications for Andrew: friend req, game RSVP, league update, tournament starting, match verification, game invite, reputation signal, badge earned (mix read/unread)
- 6 activity feed items from the network (Sarah won, Jamal +0.1 DUPR, Marcus registered, Nina earned badge, Leila reviewed Upper Noe, Andrew won league match)
- 5 demo matches in last 8 days (4W/1L) with full match_players rosters

After seeding the simulator showed: "Good night, Andrew!", weather card, "Sunday brunch pickleball" featured game, populated tabs everywhere.

**Note on safety:** seeding was done via service-role MCP `execute_sql` rather than recreating the dropped `generate_marketing_demo_data` function — the dropped function accepted any user UUID and could inject data into any account, so it stays dropped.

---

## Phase 4 — Shot list

Full per-clip sequence document at `videos/raw/SHOT_LIST.md`. Includes start screen, exact tap/swipe sequence, end frame, duration target, and website placement for slots 01–06 plus 10 extended clips (07–16).

---

## Phase 5 — Recording

Captured via `mcp__ios-simulator-mcp__record_video` against the booted iPhone 17 Pro sim at native 1206×2622 H.264. Each take started with a 0.8–1.2s settle to give the simulator a clean opening frame.

Raw masters retained at `videos/raw/`:
- `01-courts-take2.mp4` (15.5s — fallback map pan)
- `01-courts-take3.mp4` (15.9s — final: search → court detail → scroll) ← used
- `02-games-take1.mp4` (12.6s — final) ← used
- `03-leagues-take3.mp4` (14.6s — final) ← used
- `04-tournaments-take1.mp4` (12,843s — recording was kept open across many tool calls; first ~8s extracted) ← used
- `05-matches-take1.mp4` (38.3s — final) ← used
- `06-privacy-take1.mp4` (16.3s — final) ← used
- `07-home-take1.mp4` (61.2s — final) ← used

Pin-tap on MapKit maps is unreliable via the simulator MCP (the AXMapArea swallows individual annotation taps), so for clip 01 I navigated via the search bar instead — that produced a richer card-then-detail story anyway.

The bracket page on Spring Showdown shows "No Bracket Yet" because the tournament is in `registration` status and the bracket is generated on tournament start — clip 04 ends on the rich tournament detail page (prize, format, location, participants) rather than the bracket itself.

---

## Phase 6 — Post-processing

Pipeline: `videos/raw/process.sh`

For each clip the script:
1. Trims the raw to the 6–9s payload (`-ss start -t dur`)
2. Scales to 540 wide via lanczos (preserves portrait aspect → 540×1174)
3. Forces 30fps cfr (the simulator captures variable rate ≈11–60fps; this normalizes for clean web playback)
4. Encodes mp4 (libx264 high@4.0, yuv420p, crf 24, faststart, no audio)
5. Encodes webm (libvpx-vp9 crf 33, no audio)
6. Generates jpg poster from the midpoint frame

Re-run anytime: `bash videos/raw/process.sh`

---

## Phase 7 — Website wiring

**No `index.html` edits required.** The existing reel HTML already references the exact filenames I chose, and the reel JS auto-hides the "coming soon" placeholder on any video's `loadeddata` event:

```html
<video class="reel-video is-active" data-idx="0" muted loop playsinline preload="metadata"
       poster="videos/01-courts.jpg">
    <source src="videos/01-courts.webm" type="video/webm">
    <source src="videos/01-courts.mp4" type="video/mp4">
</video>
```

Verified live in Chrome via local `python3 -m http.server`:
- Reel section auto-plays clip 0 (Courts), readyState=4, paused=false
- Scroll into other captions correctly switches to clips 1–5
- "Preview clips coming soon" placeholder is hidden (`display: none` set on `loadeddata`)
- Bonus clip `07-home.mp4` is shipped but not yet placed; recommended slot below.

### Recommended placement for Clip 07 (Home feed)

Two good options:
1. **Hero replacement** — swap the existing static iPhone mockup near the top of `index.html` for the 07-home video. It autoplays, loops cleanly (showing weather + featured game + action chips), and sets the "alive product" tone immediately.
2. **Feature module** — add a 7th reel slot (extend the captions array + video element + dot button) with the kicker "Clip 07 · Home" and headline "Your hub: weather, games, and a 53° San Francisco evening."

I did not auto-add this so the existing 6-slot scroll-snap pacing isn't disturbed without your sign-off.

---

## Phase 8 — Backlog (clips not produced this session)

Each is staged in the shot list with start screen + exact taps. Reasons skipped:

| Clip | Reason | Prep needed |
|------|--------|-------------|
| 08 — Game creation wizard | Needs walkthrough of CreateGameView's multi-step picker; ~15s of filming | None; just time |
| 09 — Game join with avatar pulse | Needs a game with 1 open spot (e.g. `Indoor open play — Upper Noe`, currently 3/4) | None; demo state ready |
| 10 — Match logging | Score keypad UX | None |
| 11 — DUPR / Reputation | Reputation hub (ReputationView) — visit Profile drawer | None |
| 12 — Profile main | Profile drawer entry | None |
| 13 — Messaging DM | Open Sarah K. thread (already seeded with 6 fresh messages) | None |
| 14 — Group chat | Open "Weekend Pickleballers 🏓" (7 messages, 5 senders) | None |
| 15 — Notifications | Tap bell in nav (8 fresh notifications) | None |
| 16 — Safety hub | Settings → Safety Center | None |
| Bracket close-up | Spring Showdown bracket renders empty in `registration` status | Bump tournament to `in_progress` status + populate `tournament_matches` |

---

## Polish issues found during recording

1. **MapKit pin taps unreliable** — the AXMapArea image swallows individual annotation taps via the MCP. Workaround: search bar → tap result row. Fix consideration: expose pin tap targets through accessibility for QA tooling.
2. **Tournament bracket gated on `in_progress` status** — registration-state tournaments show "No Bracket Yet" placeholder, which is correct UX but bad for marketing recordings of upcoming tournaments. Consider rendering an "expected bracket preview" (greyed seeds, no scores) once registration is full.
3. **More tab is iPhone overflow** — Matches and Settings are buried under "More" because the app has 7 tabs. This is expected on iPhone but worth noting for marketing — the home/courts/play/leagues quartet should always remain in the main bar.
4. **Demo data ownership** — re-running the dropped marketing seed function would have failed even if it still existed because of the schema drift listed in Phase 2. The new `marketing_demo_seed.sql` is the canonical reference going forward.

---

## Files added / modified

**New:**
- `supabase/seeds/marketing_demo_seed.sql` — idempotent demo data seed
- `videos/01-courts.{mp4,webm,jpg}` … `videos/07-home.{mp4,webm,jpg}` — 21 final assets
- `videos/raw/01-courts-take{2,3}.mp4`, `videos/raw/02-games-take1.mp4` … `videos/raw/07-home-take1.mp4` — 8 raw masters
- `videos/raw/SHOT_LIST.md` — per-clip director notes
- `videos/raw/process.sh` — re-runnable ffmpeg pipeline

**Modified in Supabase (production):** profile bump for James R. → "Andrew S." 4.5; 12 upcoming games; 1 league + members + standings; 1 tournament + 16 participants; 3 chat threads + 17 messages; 8 notifications; 6 activity items; 5 matches + match_players. All keyed off the deterministic namespace `a1b2c3d4-5678-9012-3456-789abcdef012` so re-running the seed file is safe.

**Not modified:** `index.html`, app source, RLS policies, migrations.

---

## How to re-run end-to-end

```bash
# 1. Refresh demo data in Supabase (idempotent)
#    Either via the Supabase MCP `execute_sql`, or manually via SQL editor.
#    Source of truth: PickleCue/supabase/seeds/marketing_demo_seed.sql

# 2. Cold-launch the app on the booted sim
mcp__ios-simulator-mcp__launch_app(bundle_id="com.andrewsimaan.PickleCue", terminate_running=true)

# 3. Re-record any clip per SHOT_LIST.md sequence

# 4. Re-encode all clips
bash "/Volumes/Mini Drive 2/Xcode Projects/picklecue-website/videos/raw/process.sh"

# 5. Local QA
cd "/Volumes/Mini Drive 2/Xcode Projects/picklecue-website" && python3 -m http.server 8765
# Open http://localhost:8765/#reel
```
