# PickleCue website — conversion, truth and performance audit

**Date:** 2026-08-25
**Scope:** picklecue-website (all public surfaces). The iOS repo was read-only and used only as feature truth.
**Branch:** `redesign/conversion-pass`
**Live baseline captured from:** https://www.picklecue.com, commit `4ad7e0c8`

The site is well designed. It is not yet honest, and it is not yet measurable.
Those two things cost more downloads than any layout change would win.

---

## 1. The headline

Seven findings would each have embarrassed the brand or misled a visitor. Two of
them were live on the homepage.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| P0-1 | The homepage hero video showed five venue names scraped from PlayPickleball, all soft-deleted from the app | Licence + accuracy | **Fixed** |
| P0-2 | The community event page advertised early-bird prices the organizer no longer offers, four days before the event | Third-party misrepresentation | **Fixed** |
| P0-3 | Four different court counts shipped simultaneously; none matched the database | Trust | **Fixed + CI gate** |
| P0-4 | The live demo marketed DUPR ratings, which the app does not ship | Claim | **Fixed** |
| P0-5 | Every canonical URL pointed at a URL the host permanently redirects away from | SEO | **Fixed** |
| P0-6 | If the shared shell script failed, every page below the hero stayed invisible forever | Availability | **Fixed + proven** |
| P0-7 | 2,613 court pages — the largest organic surface — had zero analytics and a dead cookie link | Measurement | **Fixed** |

---

## 2. P0-1 — the hero video reproduced scraped, deleted court data

`tools/courtgen/gate.py` exists because PlayPickleball's Terms of Use clause (xi)
prohibits reproducing their content, and CI greps the generated court pages for
specific PlayPickleball venue names before every deploy.

The gate cannot see inside an MP4. `videos/hero/app-tour.webm` — 54 seconds,
1.67 MB, autoplaying at the top of the homepage — was a screen recording made
against **live production**, not against the scrubbed marketing fixture. Frames
sampled every three seconds show:

| Venue shown in the hero | `source` | `removed_at` set |
|---|---|---|
| Pickletownla | `playpickleball` | yes |
| Santa Monica Family YMCA | `playpickleball` | yes |
| Pickle Pop | `playpickleball` | yes |
| Memorial Park Pickleball | `playpickleball` | yes |
| Memorial Park Gymnasium | `playpickleball` | yes |

Verified by SQL against `public.courts`, 2026-08-25. Two separate problems:

1. **Licence.** The exact category of data the publication gate was written to
   keep off public pages was playing in a loop on the most-viewed page.
2. **Accuracy.** All five are soft-deleted. Someone who downloaded the app after
   watching the hero and searched "Santa Monica" would not find any of them.

The same contact sheet also shows the tour spending ~24 seconds on one court
detail page, an **empty** Tournaments tab ("No Upcoming Tournaments — Be the
first to host one in your area"), and a profile reading **"PickleCue Demo —
Demo account for App Store review."** The homepage hero was a recording of the
App Review demo account.

**Fixed.** The video, its MP4 and its poster are deleted. The hero is now five
real app screens from the already-scrubbed marketing capture set — the same
files `players.html` and `organizers.html` use, with the fictional cast
(Canyon View Courts, Riverside Pickleball, Larkspur Park Courts) — crossfading
in workflow order under a labelled stage rail: Discover → Join → Play → Score →
Compete. Motion now explains the product instead of just moving.

Side effect: the homepage lost 1.67 MB (see §8).

**Also removed (owner authorised, 2026-08-25).** Every remaining file under
`videos/`. A reference scan of 4,248 text files found **no HTML, CSS or JS on the
site pointing at any of them** — 60 tracked media files, 7.7 MB, all orphaned,
all publicly fetchable (`curl` returned 206 for `/videos/11b-dupr.mp4`, a demo of
a feature `FeatureFlags.duprIntegration` switches off). They are recoverable from
git history; the docs and re-encode scripts moved to `archive/marketing-video/`.

**Correction to an earlier figure in this document.** A first pass reported
"291 MB of unreferenced video deploys". That was `du` on the working directory
and counted `videos/raw/`, which `.gitignore` excludes — so it was never checked
out by CI and never deployed. The deployed figure was **7.7 MB**. `du` measures
the disk; `git ls-files` measures the deploy.

---

## 3. P0-2 — the event page advertised prices that no longer exist

`events/pickle-for-a-purpose/index.html` shipped:

- an `<h2>` reading **"Early-bird pricing"**
- **$60** players / **$45** general admission, "Regular price $100 / $75"
- JSON-LD offers at 60 and 45 with `availability: InStock`
- a sticky mobile CTA reading **"Register · $60 Early Bird"**
- "Early-bird pricing is available for a limited time."

The organizer's own page (`give-sc.salvationarmy.org`, event `e797563`, fetched
2026-08-25) publishes exactly two ticket offers:

```
Player Registration   $100.00   availability: SoldOut
General Admission      $75.00   availability: SoldOut
```

There is **no $60 or $45 offer of any kind**. The in-file comment said the Aug 10
early-bird deadline was tentative and must never be rendered as firm; the site
rendered the early-bird *prices* as firm anyway, and the deadline passed 15 days
ago. The event is 2026-08-29 — four days out.

**Fixed.** Prices now mirror the organizer ($100 / $75), the early-bird framing
and the fake-scarcity line are gone, and the sticky CTA no longer quotes a price.
The same stale $60/$45 block was also live in `poster-p4p.html` and
`poster-p4p-stories.html`; both corrected.

`availability` is now **omitted** from the JSON-LD rather than set. Their page
marks every offer SoldOut — down to a single $5 raffle ticket — which reads like
a closed ticket widget, not a literal sell-out. The price is verifiable; the
stock is not. The page states the price and links out for availability instead of
guessing on a charity's behalf.

---

## 4. P0-3 — four court counts, none of them right

| Where | What it said | Truth |
|---|---|---|
| `index.html` SoftwareApplication schema | "Court finder with over 22,000 courts" | wrong |
| `demo/index.html` | "26,000+ courts with reviews and live activity" | wrong twice — `court_reviews` is empty |
| `courts/index.html` | "3,443 courts across 310 cities and 38 states" | correct, but ambiguous |
| `courts/methodology.html` | "We currently publish 10,674 courts … on the web" | contradicted the page above it |

Ground truth, `public.courts`, 2026-08-25:

```sql
SELECT count(*), sum(court_count) FROM public.courts
WHERE removed_at IS NULL AND review_status = 'approved';
--  10674  |  29679
```

That is also exactly what a user sees: the SELECT policy is
`removed_at IS NULL AND (review_status='approved' OR created_by = auth.uid() OR is_admin_or_mod())`,
identical for anon and authenticated.

The old **22,311** figure (still in the iOS repo's `CLAUDE.md`, `README.md` and
`APP_STORE_REVIEW_NOTES.md`) counted a table that included 14,903
PlayPickleball rows. Those were soft-deleted on 2026-08-24. **22,311 is dead.**

**The vocabulary was the real bug.** A state page said "574 courts" (venues) and
"DEDICATED COURTS 1909" (playing surfaces) on the same screen. Both true, one
word. The site now says **court location** for a venue and **court** for a
playing surface, everywhere.

Resolved numbers:

| Claim | Value | Meaning |
|---|---|---|
| App | **10,674 court locations** | live, approved rows — what a user sees |
| App | **29,679 courts** | sum of `court_count` across those locations |
| Web directory | **3,443 court locations**, 310 cities, 38 states | cities clearing `MIN_COURTS = 5` |

`data/claims.json` is now the single source, and `tools/gate-claims.mjs` fails
the build on a fifth number, on a banned phrase, or on a canonical that points at
a redirect. It found 18 real violations on first run — including a malformed
canonical in `licenses.html` reading
`https://www.picklecue.comhttps://www.picklecue.com/licenses.html`, which nobody
had noticed.

**Open decision.** 7,231 court locations across roughly 4,420 smaller cities are
publishable but not published, because `MIN_COURTS = 5`. Owner chose to leave the
threshold alone during a conversion pass and revisit it as its own project.

---

## 5. P0-4 — the demo marketed a switched-off feature

`FeatureFlags.duprIntegration = false`. `Game.swift:201` renders `"Skill \(range)"`
when it is off, and `DesignComponents.swift:333` says the badge "stays hidden
until DUPR ships in v2". The live demo showed a **3.48 DUPR** stat tile, a
**"DUPR 3.48"** profile line, a **"DUPR 3.0+"** tournament requirement, and a
coaching tip reading *"Playing 1 more match this week can improve your DUPR
rating!"*

Someone who downloaded on the strength of that would not find it. All five now
show the skill range, matching the shipping app.

Not banned everywhere: `event_registration_settings.require_dupr` and
`event_registrations.dupr_id` are live columns, so an organizer collecting a DUPR
ID on a registration form is a real feature. The gate bans DUPR on marketing
pages only.

---

## 6. P0-5 — every canonical pointed at a redirect

Cloudflare Pages serves `/players` and **308s** `/players.html` to it. Verified
live: `players`, `organizers`, `community`, `clubs`, `support`, `privacy`,
`terms`, `scorekeeper`, `live` — all `.html` forms redirect, and `/courts` 308s
to `/courts/`.

Every one of those pages canonicalised itself to the redirecting `.html` form.
Every internal nav link used it. **Five of the twelve non-court sitemap URLs
redirected.** Google reports that as "Page with redirect" and picks its own
canonical.

Fixed across 4,119 files (4,101 generated court pages plus the templates that
emit them). Sitemap: 363 URLs, zero `.html`, `/courts/` corrected.

---

## 7. P0-6 and P0-7 — availability and measurement

**P0-6.** An inline script adds `html.js`, which is what sets every `.reveal`
block to `opacity:0`. Only the deferred `site-v2.js` removes it again. If that
file 404s, is blocked, or throws, **everything below the hero stays invisible
permanently** — 17 blocks on Players and Organizers, 22 on the new page. The
hiding was unconditional; the un-hiding was not.

Now `site-v2.js` sets `window.__pcShell`, and a 1.5 s inline watchdog strips
`html.js` if the shell never arrived. Proven by serving the site with
`/assets/site-v2.js` forced to 404:

```
                       before watchdog        after watchdog
/players    (1440)     17/17 hidden           0/17 hidden
/organizers (390)      17/17 hidden           0/17 hidden
/live-scores(1440)     22/22 hidden           0/22 hidden
```

This is also why full-page screenshots of Organizers show a large blank band: a
capture that never scrolls never triggers the observer. Scroll before capturing.

**P0-7.** `/courts/**` — 2,613 indexable pages, the site's largest organic
surface — carried no `gtag`, no `consent.js` and no Smart App Banner, while its
footer offered a "Cookie preferences" link that only `consent.js` can handle.
An App Store click from a court page was unmeasurable. All three added to the
generated shell.

---

## 8. Performance

Measured at 390 px, decoded first-party bytes, **the same instrumentation driven
against both sides** — live production for "before", a local server mirroring
Cloudflare's extensionless routing for "after". Third-party bytes (gtag) are
excluded from both columns and discussed separately below.

| Page | Before | After | Change |
|---|---:|---:|---:|
| **Home** | **2,212 KB** | **576 KB** | **−74%** |
| Live demo | 685 KB | 412 KB | −40% |
| Community | 429 KB | 319 KB | −26% |
| Players | 402 KB | 297 KB | −26% |
| Event | 381 KB | 273 KB | −28% |
| Organizers | 381 KB | 275 KB | −28% |
| Courts index | 324 KB | 222 KB | −31% |

What changed:

| Asset | Before | After | Note |
|---|---:|---:|---|
| Hero video + poster | 1,737 KB | **0** | replaced by five stills totalling 206 KB |
| `wordmark-on-light.png` | 118 KB | 30 KB (webp) | 1137 px wide for a 24 px logo, on every page |
| `wordmark-on-dark.png` | 49 KB | 28 KB (webp) | on every page |
| `hero-court.png` (demo) | 335 KB | 19 KB (webp) | |
| Google Fonts (demo) | 61 KB + 2 preconnects | 0 | DM Sans was fourth in a stack led by `ui-rounded` / `-apple-system`, so no Apple visitor ever rendered it |

**Two honest caveats.**

1. **Court pages got heavier in total.** First-party dropped 324 → 222 KB, but
   they now load gtag (~165 KB third-party) that they did not load before. That
   is a deliberate trade: the site's largest organic surface was previously
   impossible to measure. Revisit if it shows up in field INP.
2. **A first measurement of these numbers was wrong and is not what is reported
   above.** An earlier harness read `content-length` on one side and raced
   `response.body()` against context teardown on the other, and reported the
   homepage at 90 KB. Both columns are now produced by one function called twice.

Not a defect, recorded so it is not re-reported: `static.cloudflareinsights.com`
returns `ERR_CONNECTION_REFUSED` on this machine. `curl` returns `000` for that
host locally and 204 for `google-analytics.com/g/collect`, so the beacon is
blocked by local DNS, not broken in production.

## 9. Page by page

| Page | Main problem | What changed | Why it should convert better |
|---|---|---|---|
| **Product / home** | 1.67 MB hero recording of the App-Review demo account, showing scraped venue names and an empty Tournaments tab | Hero is five real screens on a labelled Discover → Join → Play → Score → Compete rail; schema count corrected; spectator section now links to a real page | Loads 20× lighter, shows the workflow instead of a screen recording, and every frame is defensible |
| **Courts** | Reads as a state directory; "courts" meant two things on one page; self-contradicting totals; no analytics; five cards read "1 cities" | Precise vocabulary, corrected totals, pluralisation fixed, analytics + Smart App Banner + consent added, `/courts/` canonical fixed | The biggest organic surface can finally be measured, and an iPhone visitor gets a one-tap install banner |
| **Players** | Feature brochure; everything below the hero depended on one JS file | Watchdog, canonical, Smart App Banner, nav parity | Content can no longer disappear; the journey rebuild is Phase E |
| **Organizers** | The homepage sold organizers better than the organizer page did; large blank band in captures | Same shell fixes plus a link to the new spectator page | The strongest differentiator is now one click away |
| **Community** | One real event in a very large page | Left as is this pass — deliberately. Editorial rebuild is Phase G | Fabricating cards to fill a grid was explicitly rejected |
| **Event** | Advertised prices the organizer had withdrawn; fake scarcity; pre-launch nav CTA | Organizer's real prices, no early-bird framing, no `InStock` claim, "Get early access" → "Download PickleCue" | Stops sending people to pay $100 after promising $60 |
| **Live demo** | Marketed DUPR; "26,000+ courts with reviews"; three fabricated star ratings; pinch-zoom disabled; five `<h1>`s; no canonical; Austin and San Francisco fixtures mixed; June/July dates shown as upcoming; no guided path through five tabs | All corrected; one city (Austin); dates that cannot rot; Google Fonts removed; 335 KB PNG → 19 KB. **Phase H** added a landing state and an optional five-step guided tour that drives the real demo, ending in the one download ask | A visitor now reaches the point in about a minute instead of guessing at five tabs |
| **/live-scores** (new) | The browser spectator platform existed and nothing linked to it; `/live` is `noindex` | New indexable page: what a spectator sees, short-code entry that validates the real `[A-Z2-9]{6}` alphabet before hitting `/e/`, scorekeeper explainer, FAQ schema | Targets "follow a pickleball tournament live" and turns spectators into organizers |

---

## 10. Accessibility

Fixed: pinch-zoom re-enabled on `/demo/` and `/scorekeeper` (`user-scalable=no`,
WCAG 2.2 SC 1.4.4); five competing `<h1>`s in the demo reduced to one with a
screen-reader document heading; the new page's short-code field has a real label,
a live-region message and a 48 px target; `--cue` (#56D364) restricted to dark
sections only, because it measures roughly 2:1 on paper.

Verified across 12 pages × 3 viewports (1440 / 768 / 390): **zero horizontal
overflow, exactly one `<h1>` per page, Smart App Banner on all, no console
errors, no 4xx** (`/api/geo` 404s locally only — it is a Pages Function).

Not yet done, Phase I: focus trapping in the mobile menu and lightbox, a full
axe pass, VoiceOver, 200% zoom.

---

## 11. Analytics

Existing gtag + Consent Mode v2 kept; nothing new added. Court pages gained the
existing setup. New events: `event_code_open` on the spectator page. Stale
`data-cta="nav_waitlist"` on the nav button is still there and should become
`nav_download` — deliberately left for the Phase B CTA pass so every placement is
renamed once.

`assets/site-v2.js` posted waitlist signups as `source: 'website'` while
`index.html` posted `'website-intl'`. Both now `'website-intl'`; every waitlist
form on the site is the international-availability form.

---

## 11b. Programmatic SEO: the unpublished court directory

**Not a bulk-indexing exercise.** Owner decision 2026-08-25: do not lower
`MIN_COURTS` or publish more pages until the questions below are answered. This
section sizes the opportunity so that decision has numbers behind it.

`tools/courtgen/build_site.py` publishes a city only when it holds
`MIN_COURTS = 5` or more locations. Distribution of every live, approved,
US-state-coded, non-county city (SQL, 2026-08-25):

| Locations per city | Cities | Locations | Names that are generic | Surface known |
|---|---:|---:|---:|---:|
| **5+ — published today** | 321 | 3,527 | 90.0% | 15.2% |
| 4 | 128 | 512 | 90.0% | 16.4% |
| 3 | 294 | 882 | 92.2% | 16.2% |
| 2 | 656 | 1,312 | 91.8% | 17.5% |
| 1 | 2,521 | 2,521 | 92.2% | 14.6% |

(The generator's own count is 310 cities / 3,443 locations — it applies a
stricter city-label filter than this sizing query. Its numbers are the
authoritative ones; the buckets are for scale.)

**The finding that should drive the decision:** content quality does not vary
with city size. 90–92% of court names are generic in *every* bucket, and surface
is known for roughly one row in six regardless. A one-court city page would not
be worse-written than a five-court one — it would just be one row. So the real
question is not "are small cities lower quality" but "does a page listing one
unnamed court, described by its street, deserve to exist".

| Option | Adds | Verdict |
|---|---|---|
| `MIN_COURTS = 3` | +422 cities, +1,394 locations | Defensible **if** the city page gains something beyond a list — a map, nearby cities, the state above it. A 3-row page that is only 3 rows is thin. |
| `MIN_COURTS = 1` | +3,177 cities, +3,833 locations | 2,521 of those are single-row pages. This is the pattern `build_site.py`'s own comment warns about, and it is a sitewide quality signal, not a per-page one. |

**Answer these before changing the threshold:**

1. **Uniqueness.** What does a 3-court city page say that its state page does
   not? Right now: the same rows, one level down.
2. **Court detail.** `surface` is known for 15%, `indoor` for 12.5%, `lights`
   for 843 of 10,674. Plan 090 in the iOS repo proposes a per-attribute
   confirmation loop; that is the input that makes these pages worth indexing.
3. **Search demand.** Does anyone search "pickleball courts in <town of 1
   court>"? Measure before generating 2,521 pages to find out.
4. **Internal linking.** A city page with no inbound link but a sitemap entry is
   a crawl-budget cost. Nearby-city links would have to exist first.
5. **Canonical and duplicates.** 656 two-location cities across 38 states will
   contain repeated city names (Springfield, Franklin, Clinton). The slug is
   state-scoped, but the title and H1 are not.
6. **Court detail pages.** 4,101 already generate and are all `noindex` because
   they are thin without photos or reviews. Publishing more city pages that link
   to more `noindex` pages widens that ratio.

**Recommendation:** treat this as its own project after the redesign. The
sequence that makes it work is court-detail quality first (iOS plan 090), then
`MIN_COURTS = 3` with a genuinely different city-page template, then measure,
then consider going lower. Not the reverse.

---

## 11c. Geolocation: deliberately off

`_headers` sets `Permissions-Policy: geolocation=()` sitewide, so the browser
geolocation API is unavailable on every page. That is not an oversight and it is
**not to be relaxed as a shortcut** for a "Near me" button.

Courts search is being built on city, state, ZIP and court name (Phase D). A
permission prompt is friction on first visit and a second privacy surface to
document, justify in the policy, and defend at review.

If "Use my location" is ever added it needs, in order: a product case with a
measured benefit, a privacy review, the policy updated, a direct user gesture
before the prompt is raised, a graceful denied path, and a guarantee that no
coordinate reaches analytics. Until all six exist, the header stays as it is.

## 11d. Court search performance, measured properly

The Phase D report said "warm query ~400 ms". **That number was the test harness,
not the product.** The harness typed, slept 400 ms, then read the DOM, and 400 ms
is what it recorded.

Re-measured inside the real code path — a `MutationObserver` catching the exact
moment results are painted, ten representative queries, no sleeps in the timing
window:

| | keystroke → painted | minus the debounce (compute + render) |
|---|---:|---:|
| desktop 1440 | median 43 ms | **2.6 ms**, slowest 6.1 ms |
| mobile 390, 4× CPU throttle | median 43 ms | **1.8 ms**, slowest 3.4 ms |

The CPU throttle was itself verified before those numbers were trusted: a busy
loop takes 27 ms unthrottled and 108 ms at rate 4 — exactly 4.00×. A first check
said the throttle was not applying; that check was too short and JIT-noisy, and
was wrong.

Since compute is under 3 ms, **the debounce was the entire latency**. It was
90 ms; it is now 40 ms, which still coalesces a fast typist. Targets were
compute <25 ms, render <50 ms, post-debounce <150 ms — met with room to spare
without any change to the algorithm.

## 12. Still open

**Phase B–I (not started).** Shared CTA/QR component, desktop QR-to-phone, sticky
mobile install bar, the homepage connected-journey section, the Courts search and
value bridge, the Players journey, the Organizer lifecycle, the Community
editorial rebuild, the demo guided tour, and the full accessibility pass.

**Needs the owner.**

1. ~~Unreferenced video~~ — **resolved 2026-08-25.** 7.7 MB, 60 files, removed
   from the deploy tree after a full reference scan. See §2.
2. **The iOS repo still claims 22,311 courts** in `CLAUDE.md`, `README.md` and
   `APP_STORE_REVIEW_NOTES.md`. The last of those is Apple-facing and also
   promises court "reviews and photos" — `court_reviews` and `court_photos` are
   both empty. That is a live App Review risk and the iOS repo was read-only for
   this task.
3. **The app shows a blue verified badge on court names.** `gate.py` bans the
   `verified` column from public pages because it marks the import source, not a
   player verification. The app renders it as a checkmark anyway.
4. **`MIN_COURTS`** — 7,231 locations held back from the web.
5. **Geolocation** is disabled site-wide by `Permissions-Policy`, so "near me"
   on the Courts page needs a deliberate policy change.
6. **CSP is `Content-Security-Policy-Report-Only`.** Removing the demo's Google
   Fonts request means the site no longer violates its own `font-src 'self'`;
   enforcing the policy is now a smaller step than it was.
