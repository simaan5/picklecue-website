# PickleCue — App Store launch email

The launch announcement to the pre-launch waitlist. Built for Zoho Campaigns,
but the HTML is self-contained and portable.

| | |
|---|---|
| Subject | `PickleCue is officially live 🎉` |
| Preheader | `You waited. It's here. Now available on the App Store in the U.S.` |
| From | PickleCue &lt;info@picklecue.com&gt; |
| Reply-To | info@picklecue.com |
| List | **PickleCue App Launch** (waitlist) — no sample/test list |
| CTA target | https://apps.apple.com/us/app/picklecue-pickleball/id6757326631 |

## Files

```
picklecue-app-store-launch.html   the campaign HTML (absolute image URLs)
build-hero.py                     regenerates the hero from the real app capture
assets/                           source copies of every image
```

Images are **hosted on this origin** and referenced absolutely:

```
https://www.picklecue.com/images/email/launch/<file>
```

They live in `images/email/launch/` and deploy with the site. An email cannot
resolve a same-origin path, so absolute URLs are required — that is also why
`marketing/` is excluded from `tools/gate-csp-hosts.mjs` and disallowed in
`robots.txt`.

| asset | displayed | weight |
|---|---|---|
| `app-store-launch-hero.jpg` | 560×350 | 94 KB |
| `picklecue-wordmark.png` | 230×39 | 22 KB |
| `app-store-badge.png` | 150×50 | 13 KB |
| `ic-*.png` × 6 | 56×56 | ~27 KB |

**Total ~176 KB.** All images are 2× for retina and flattened onto `#0D1A12`,
so they need no alpha and cannot show a white halo in a client that drops
transparency.

## Asset provenance — read before changing anything

**The wordmark is the official one, dark colourway.** `Pickcue Mark.png` on the
Desktop is the *light-background* colourway: its "Pickle" glyph is
`rgb(23,70,49)`, which measures **1.67:1** against the `#0D1A12` email canvas —
invisible. The dark colourway (`images/wordmark-on-dark.png`, white "Pickle" +
lime "Cue") measures **17.89:1**. Same wordmark, correct colourway for a dark
email. Not redrawn, not recoloured, not restretched — scaled on both axes
equally from the 744×126 original.

**The phone in the hero is the real app.** It is
`qa/store-screenshots/build-213-deck-v4/raw/s10-home-dashboard.png` from the
PickleCue repo — the preseeded Home dashboard, build 213. Nothing is redrawn
and no UI is invented. `build-hero.py` scales it on both axes equally and
applies a rigid rotation (−9.5°); it is never stretched on one axis.

**The App Store badge is Apple's own SVG**, rendered from
`images/badges/app-store-badge.svg` unmodified.

**Known: the Home screenshot carries a date.** The Next Game card reads
`Thu, Aug 27 · 7:00 AM` with a `Starts in 7d 9h` chip — internally inconsistent,
because the capture was taken 2026-08-19. At the size it renders in the email
(the phone is ~175 px wide) that chip is roughly 4 px tall and illegible. It was
left untouched rather than retouched. `data/marketing-assets.json` blocks this
capture for **website** use for exactly this reason; a one-time email dated
2026-08-26 is a different case, since `Aug 27` reads as tomorrow. If the send
slips more than a few days, recapture.

## Rebuilding the hero

```sh
# 1. render Apple's badge (needs playwright-core, already a devDependency)
node -e "..."   # see build-hero.py header, or reuse assets/app-store-badge.png
# 2. compose
python3 marketing/email/app-store-launch/build-hero.py
# 3. re-encode to JPEG q88 and copy to the hosted directory
cp assets/app-store-launch-hero.jpg ../../../images/email/launch/
```

## Importing into Zoho Campaigns

The draft campaign **PickleCue** already exists with sender, reply-to, subject,
preheader and list configured. Only the content needs replacing.

1. Open the campaign → **Content** → choose **Code your own / Paste HTML**
   (not the drag-and-drop builder — it rewrites table markup and breaks the
   Outlook VML buttons).
2. Paste `picklecue-app-store-launch.html` whole.
3. **Do not re-upload the images.** They are already hosted on
   `www.picklecue.com`, so Zoho's image manager is not involved and the URLs
   will not rot when a Zoho campaign is archived.
4. Confirm the two merge tags in the footer survived the paste:
   `$[LI]$` (unsubscribe) and `$[OO]$` (manage preferences). **Verify these
   against Zoho's own merge-tag list in the editor before sending** — Zoho is
   the authority on its tag syntax, and a footer that does not resolve is a
   compliance failure, not a cosmetic one.
5. Preview & Test → check mobile and desktop → send a test to yourself.
6. Click the hero and both buttons from the test email and confirm each opens
   **PickleCue: Pickleball**, App Store ID **6757326631**.

## Client notes

- 600 px fixed content width; `@media (max-width:620px)` drops the feature grid
  to one column and pads down to 22 px.
- Buttons are VML `<v:roundrect>` for Outlook desktop and a padded table cell
  everywhere else, so they are rounded and tappable in both.
- No web fonts. Arial / Helvetica / sans-serif only.
- No JavaScript, no embedded video, no background images doing real work.
- With images blocked the email still reads end to end: every section's message
  is live text, and the only image-only element is the hero, which carries the
  alt text *"PickleCue is now available on the App Store"*.
- `color-scheme: dark` is declared, and `[data-ogsc]` overrides keep the
  surfaces dark if Outlook.com forces its own theme.
