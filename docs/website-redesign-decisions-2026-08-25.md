# Redesign decisions — 2026-08-25

Companion to `website-cro-audit-2026-08-25.md`. Records what was decided and
why, so the next pass does not relitigate it.

## Kept

**The visual system.** Warm paper `#F7F7F2`, white card surfaces, deep forest
ink, bright lime as a *cue* rather than a wash, Instrument Sans with restrained
mono labels. It works. Nothing here reopens it.

**The static architecture.** No framework was introduced and none should be.
Court pages are generated at build time by `tools/courtgen/build_site.py`;
everything else is hand-authored HTML on one shared stylesheet. That is why the
courts index answers in 9 KB of markup.

**One event on the Community page.** Filling the grid with invented cards was
explicitly rejected. An honest single story beats a fake marketplace.

## Decided

| Decision | Choice | Why |
|---|---|---|
| Which court number leads | **10,674 court locations**; 29,679 courts where the distinction matters; 3,443 labelled as the web-published subset | Matches what a user actually sees. Ends a four-way contradiction without inflating anything |
| Vocabulary | **court location** = a venue, **court** = a playing surface | The two meanings shared one word, which is what made "574 courts" and "1,909 dedicated courts" both true on one screen |
| Directory depth | `MIN_COURTS` stays at 5 | 7,231 locations stay unpublished for now. Coverage is its own project, not a conversion pass |
| Canonical URL shape | **Extensionless** (`/players`) | The host already serves that form and 308s the `.html` form. The site was canonicalising to the redirect |
| Hero | Five real screens crossfading on a labelled workflow rail | The video was unlicensable and 1.67 MB. Stills are honest, cheap, and the rail makes the motion mean something |
| Event pricing | Mirror the organizer's published prices; omit `availability` | We can verify their price. We cannot verify what their blanket `SoldOut` means |
| Web spectator platform | New evergreen `/live-scores` | It existed, worked, and nothing linked to it. `/live?t=` stays `noindex`; the explainer is indexable |
| Clubs in the nav | Added to desktop, so both navs match | It was in the mobile menu and the footer but not the desktop nav. `clubs.html` is a real audience page |
| Demo geography | One city — Austin | It mixed Austin, San Francisco and San Diego in one simulated session |
| Demo dates | Relative labels ("Next month", "Season in progress") | Every hardcoded date rots. Three were already in the past and shown as upcoming |
| Demo typography | Self-hosted Instrument Sans, no Google Fonts | DM Sans sat fourth in a stack led by `ui-rounded`/`-apple-system` — no Apple visitor ever rendered it |

## Motion rules

Applied to the hero; the rest of the site inherits them as later phases land.

| Class | Duration | Use |
|---|---|---|
| Micro | 140–220 ms | button, chip, tab underline, link border |
| State | 220–380 ms | card, sheet, result |
| Section reveal | 450–650 ms | `.reveal` entrances |
| Ambient sequence | 4 s per frame, 20 s loop | hero stills |

Easing is the existing `cubic-bezier(.16,1,.3,1)`. Two hard rules:

1. **Motion must be defeatable without losing content.** `.hero-seq img:first-child`
   is `opacity:1` in the base rules; the animation is added only inside
   `@media (prefers-reduced-motion: no-preference)`. With animation off, frame
   one is simply the hero image.
2. **Nothing may hide content unconditionally.** `html.js` hiding `.reveal` is
   now paired with a watchdog that removes the class if the script that would
   un-hide it never arrives. CI enforces the pairing.

## Not done in this pass

Phases B–I from the brief: shared CTA/QR component, desktop QR-to-phone, sticky
mobile install bar, the homepage connected-journey section, Courts search, the
Players journey, the Organizer lifecycle, the Community editorial rebuild, the
demo guided tour, and the full accessibility sweep. This pass was Phase A plus
every P0 it surfaced.

## Open, needs the owner

Listed in full in §12 of the audit. The two that matter most:

1. `APP_STORE_REVIEW_NOTES.md` in the iOS repo tells Apple the app has "22,311
   U.S. courts" with "reviews and photos". The real figures are 10,674 locations,
   zero reviews, zero photos. The iOS repo was read-only for this task.
2. 291 MB of unreferenced video still deploys and is publicly fetchable.
