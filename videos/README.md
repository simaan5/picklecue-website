# PickleCue website — reel video specs

This folder holds the six short clips that play in the "In motion" section on
the homepage. The page references every file below; any that don't yet exist
fall through to the "Preview clips coming soon" plate. Dropping a file in
replaces the plate for that slot automatically — no code change required.

## Slots (exact filenames expected)

| # | Filename stem        | What the clip should show |
|---|----------------------|-------------------------|
| 1 | `01-courts`          | Open the map, tap a court, see surface / lights / reviews, get directions |
| 2 | `02-games`           | Create an open game — pick court, skill, capacity, invite scope |
| 3 | `03-leagues`         | Standings page recomputing after a result is entered |
| 4 | `04-tournaments`     | A live bracket, single-elim, a score being entered and the bracket advancing |
| 5 | `05-matches`         | Log a match — score keypad, partner lookup, the new row in history |
| 6 | `06-privacy`         | Profile visibility toggle, block / mute flow |

For each slot, drop **three files**:

```
videos/01-courts.mp4     ← H.264 (Safari, older devices)
videos/01-courts.webm    ← AV1 or VP9 (Chrome, Firefox, smaller)
videos/01-courts.jpg     ← poster / first frame (prevents layout shift)
```

## Encoding specs

| Attribute    | Value |
|--------------|-------|
| Duration     | 6–10 seconds |
| Aspect       | Portrait. Target 9:19.5 (iPhone Pro) or 9:16. The reel crops with `object-fit: cover`, so anything taller than 9:16 is fine. |
| Dimensions   | 1080×2340 max (downscale if you have bigger) |
| Audio        | **None.** All videos autoplay muted. |
| Loop         | Yes — the page loops them anyway; edit the clip so the last frame blends into the first. |
| Max size     | Target ≤ 2 MB per file. Hard cap 4 MB — over that and we'll need a CDN. |
| Poster       | 1080×2340 JPG, quality 80, ≤ 200 KB. |

## Test data only

All clips must use fake data. **Do not** include:

- Real user profiles, avatars, or display names (generate fake ones)
- Real match history or scores against real opponents
- Real email addresses or phone numbers
- Real court names/locations that identify a specific person's home gym
- App Store branding that implies we're already live (we're not)

Anything on screen that looks like a person's face, name, or contact must be
seeded test data.

## Encoding commands (reference)

With `ffmpeg` installed locally:

```bash
# MP4 (H.264, fast start, portrait)
ffmpeg -i raw-input.mov \
  -vf "scale=1080:-2,format=yuv420p" \
  -c:v libx264 -preset slow -crf 23 \
  -movflags +faststart \
  -an \
  01-courts.mp4

# WebM (VP9, smaller)
ffmpeg -i raw-input.mov \
  -vf "scale=1080:-2" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 \
  -an \
  01-courts.webm

# Poster (first frame)
ffmpeg -i raw-input.mov -vframes 1 -q:v 3 01-courts.jpg
```

## Adding more slots

To add a seventh clip you'd need to:

1. Add `.reel-cap` block + `.reel-video` block + `.reel-dot` button in `index.html`
2. Bump `data-idx` indices accordingly
3. Drop `07-<name>.{mp4,webm,jpg}` here

Or ask the assistant and it'll wire it in one pass.
