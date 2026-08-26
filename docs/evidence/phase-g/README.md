# Phase G — community and event

Two pages, one record, and four states proven from a controlled clock instead
of from a Saturday night.

## What changed

**The event page derives its state; it no longer asserts one.**
`data/events.json` holds the facts — dates, timezone, venue, organizer, source
URL, registration state, `statusVerifiedAt`, observed offers, ticket tiers.
`tools/build-event.mjs` derives the lifecycle state from those and writes the
status line, every CTA label, the lede, the pricing framing and CTA, the entry
copy, the meta descriptions, the sticky bar, the calendar file and the whole
`SportsEvent` node. Seventeen marked regions, one command, idempotent.

Before this, the page held its own truth in four places: prose, sticky CTA,
JSON-LD and the community card. That is how `$60 early bird` and an `InStock`
offer survived fifteen days past the tier disappearing from the organizer's
page, four days out.

**There is no recap state, deliberately.** Photos, results and a write-up
belong to the organizer. A gate that stays red until one exists is a gate that
pressures somebody into inventing one. *"This event has taken place. Pickle for
a Purpose was held on Saturday, August 29, 2026 at Peninsula Racquet Club in
Rancho Palos Verdes"* is complete and true on its own.

## The four states

| `--now` | state | CTA | `Offer` nodes | sticky bar | utilities | `.ics` |
|---|---|---|---|---|---|---|
| `2026-08-20T12:00-07:00` | `upcoming-unavailable` | View official event page | 2 | yes | yes | present |
| `2026-08-29T09:00-07:00` | `event-day` | View official event page | 2 | yes | yes | present |
| `2026-08-29T19:59-07:00` | `event-day` | View official event page | 2 | yes | yes | present |
| `2026-08-29T20:30-07:00` | `ended` | View official event page | **0** | **removed** | **removed** | **deleted** |

A fifth state, `upcoming-open`, exists for the day registration reopens. It is
the only one that advertises `https://schema.org/InStock`, because it is the
only one where we could stand behind it.

Status line per state:

- **upcoming-unavailable** — Registration is currently unavailable on the
  organizer's site. The event is still scheduled. Registration and payment are
  handled entirely on The Salvation Army's official event page, and only they
  can confirm whether it reopens.
- **event-day** — Happening today. 5–8 PM at Peninsula Racquet Club. PickleCue
  is not running this event — for anything about entry, timing or last-minute
  changes, their page is the only source that can answer.
- **ended** — This event has taken place. Pickle for a Purpose was held on
  Saturday, August 29, 2026 at Peninsula Racquet Club in Rancho Palos Verdes.
  Anything the organizers publish afterwards will be on their official event
  page.

Screenshots: `01-` … `04-`, each at 390 and 1440, for the event page and for
the community card. Regenerate with
`node tools/checks/event-states-evidence.mjs` (it restores the tree afterwards).

## Availability is still asserted nowhere

Their page reports `SoldOut` on every offer down to a single $5 raffle ticket.
That reads like a closed ticket widget rather than a literal sell-out, and only
Echelon can tell those apart. The site says *registration is currently
unavailable on the organizer's site* and links out. It does not say sold out,
and `gate-events.mjs` fails the build if any page ever does.

Re-verified against the organizer's live listing on 2026-08-26 via
`node tools/verify-event.mjs pickle-for-a-purpose --write`: `EventScheduled`,
Player Registration $100, General Admission $75, all offers `SoldOut`, no
change since the previous check. That command now re-renders the page as well,
because the calendar file's `DTSTAMP` is `statusVerifiedAt` itself.

## Two bugs this phase found in its own work

**The seam banner fired four days early.** The end time was written into the
page through an HTML comment marker placed inside a JavaScript string literal.
HTML comments are not comments inside `<script>` — they are characters. So
`new Date('<!-- ... -->2026-08-29T20:00:00-07:00<!-- ... -->')` is an Invalid
Date, `new Date() <= InvalidDate` is `false`, and the guard never returned. The
page announced *"This event has taken place"* directly above a paragraph saying
the event was still scheduled. No gate could catch it: the markup, the state
and the copy were all correct. The end time now comes from
`<body data-event-ends>`, the script bails on an unparseable date, and
`tools/checks/event-seam.mjs` drives four fake browser clocks plus a genuinely
built ended page.

**Every tracked click on the community page produced zero GA4 events.**
`community.html` and the event page each defined `window.track` before the
deferred `acquire.js` loaded, so `acquire.js`'s `window.track || …` kept the
page's version — and that version pushed a GTM-shaped `{event: …}` object into
a dataLayer owned by **gtag.js**, which never reads it. Two listeners, both
calling it. Measured on the real code path: **0 GA4 events and 2 inert pushes
per click, before; 1 event and 0 inert, after.**

## Weight

`before` is live production, `after` is this branch, both through the same
`weigh()` call in `tools/measure/lib.mjs`.

| page | viewport | before | after | change |
|---|---|---|---|---|
| `/community` | 390 / 1440 | 429 KB | **227 KB** | −47% |
| `/events/pickle-for-a-purpose/` | 390 / 1440 | 381 KB | **229 KB** | −40% |
| `/support` | 390 / 1440 | 427 KB | **220 KB** | −48% |
| `/privacy` | 390 / 1440 | 446 KB | **240 KB** | −46% |
| `/terms` | 390 / 1440 | 429 KB | **223 KB** | −48% |

Both Phase G pages gained content and still got lighter. Most of the drop is
one finding: **seven pages preloaded a 66 KB serif they never render.**
`tools/checks/fonts.mjs` loads each page, records what is downloaded and reads
back the families actually composited — Fraunces was fetched at preload
priority on `/community`, the event page, `/support`, `/terms`, `/privacy`,
`/404` and `/organizer-templates`, and rendered on none of them. `/bracket/`
genuinely uses it and keeps its preload. `/licenses` already had no preload and
downloaded nothing, which is what proved removal drops the fetch.

Phase G's own markup added 3.5 KB to `community.html`, 4.7 KB to the event page
and a 1 KB calendar file.

## Accessibility

`tools/checks/a11y.mjs`, both pages × light and dark × 390 and 1440, each theme
**loaded fresh** rather than toggled on a live page (toggling composites
mid-transition and invents failures — 33 of 37 findings in an earlier sweep
were that artifact).

**Content inside `<main>`: 0 findings** across all eight combinations —
contrast, target size, heading order, accessible names, `alt` attributes,
duplicate ids.

The instrument was verified against injected defects before its "clean" was
trusted: a 1.55:1 paragraph, a 30×30 button, an h3→h5 skip, an `<img>` with no
`alt` and a duplicate `id` were all caught.

**Shared chrome: 50 distinct target-size findings** — masthead nav (32 px tall),
footer links (38 px), social row (25 px), skip link (39 px), theme toggle
(42 px). These are identical on all 4,130 pages and predate this phase. They
are reported, not fixed here; the fix belongs with the Phase I cross-site pass,
where the court-page shell is regenerated anyway.

**Correction, measured in Phase I.** This document originally said both wordmark
images cost "roughly 28 KB per page load across the whole site". That is wrong.
Both are fetched — the theme swap is `display:none` and a `display:none` image
is still requested — but `/images/*` is cached for 30 days, so the cost is
**28 KB once per visitor**, not per navigation. Measured with
`PerformanceResourceTiming.transferSize` across three navigations in one
context: 30 KB + 28 KB on the first page, `0` on every page after it.
(`page.on('response')` fires for cache hits too and reports `200`, which is what
produced the wrong number the first time.)

Against a 4,117-file markup change and a full court-page regeneration, 28 KB on
a first visit does not justify the blast radius. **Not doing it**, and the
reason is recorded here rather than left as an open item that looks skipped.

## Structured data

`tools/gate-schema.mjs` parses every JSON-LD block on the site and holds it to
Google's required properties per type: **4,110 blocks across 4,130 pages, all
clean.** Proven to fire on a trailing comma, a missing `location`, a bare
`EventScheduled` enum token, a relative image URL, a `price` with no
`priceCurrency`, and an unparseable date.

The `SportsEvent` node is now generated rather than hand-maintained, and gained
the `image` property Google lists as recommended.

## Gates added this phase

| gate | what it refuses |
|---|---|
| `tools/build-event.mjs --all --check` | a page built for a lifecycle state the clock has left behind, or a hand-edited marked region |
| `tools/gate-analytics.mjs` | an unconditional `window.track`, a second `[data-track]` listener, a GTM-shaped `dataLayer` push, or `[data-track]` markup on a page that never loads `acquire.js` |
| `tools/gate-schema.mjs` | JSON-LD that does not parse or is missing a required property |

`gate-events.mjs` was rewritten to import `stateFor` from the builder, so the
lifecycle state is decided in exactly one place, and its after-the-event check
now fails on surviving forward-looking copy rather than on the absence of a
recap.

All three are wired into `gates.yml` (every push and PR) and `deploy.yml`
(before publish).

## Checks that are not gates

Each needs a browser, so they run locally rather than on every push:

| check | what it proves |
|---|---|
| `tools/checks/track.mjs` | one click → exactly one GA4 event, correct params, zero inert pushes, on eight pages |
| `tools/checks/event-seam.mjs` | the seam banner is silent before `endsAt` and present after, across four fake clocks, and stands down on a built ended page |
| `tools/checks/event-utils.mjs` | share is revealed under Web Share and under clipboard-only, absent under neither; one directions link; `.ics` served as `text/calendar` |
| `tools/checks/a11y.mjs` | contrast, targets, headings, names, alts, duplicate ids — content and chrome reported separately |
| `tools/checks/fonts.mjs` | which fonts are downloaded vs actually composited |
| `tools/checks/event-states-evidence.mjs` | renders all four states from controlled clocks and restores the tree |
