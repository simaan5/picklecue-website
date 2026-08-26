# Phase I — verification

The pass that checks the other eight. Two engines, every page type, and an
answer to the one question Report-Only could never answer.

## The finding that justified the phase

`/live`, `/organizer`, `/scorekeeper`, `/checkin` and `/e` loaded
`@supabase/supabase-js` from `cdn.jsdelivr.net` — a host `script-src` has never
allowed.

The CSP had run **Report-Only** since launch, which means the browser reports
and then loads the resource anyway. Nothing broke. Nothing complained. Flipping
the policy to enforcing on any ordinary day would have taken down **live
scoring, the organizer console, scorekeeper mode, check-in and the event
resolver simultaneously**, while every marketing page kept working and looked
perfect.

Worse than the CSP: the tag was `@supabase/supabase-js@2`. jsdelivr serves
whatever the newest 2.x is at request time — on 2026-08-26 that was **2.112.4**.
A breaking change in any later 2.x reaches live scoring with no deploy on our
side and no way to roll back, during an event, when the scoreboard is the whole
point.

Both libraries are now vendored, pinned and version-stamped in
`assets/vendor/`, byte-for-byte what jsdelivr served, with provenance and
checksums recorded. `tools/checks/vendor.mjs` asserts each page reaches
`supabase.createClient` from this origin with zero CDN requests, in both
engines.

`tools/gate-csp-hosts.mjs` makes it permanent: it parses the policy out of
`_headers` and fails the build on any external host a page references that the
policy does not cover — statically, on every push, with no browser and no
waiting for someone to visit the right page.

## CSP is now enforcing

| | |
|---|---|
| pages loaded under the exact policy as **enforcing** | 32 (20 templates + 12 app-adjacent) |
| engines | Chromium **and** WebKit |
| `securitypolicyviolation` events | **0** |
| `eval` / `new Function` in our scripts or the vendored ones | none |

The check is proven to fire rather than assumed to: tightening `style-src`
produces 4 violations, `script-src` 1, `img-src` 3.

`'unsafe-inline'` stays in `script-src` and `style-src`. 21 inline `onclick`
handlers and a large number of inline `style` attributes need a nonce and a
markup pass first. That is deliberately not part of this change.

## axe-core, both engines

axe-core 4.13 across 20 templates × 2 themes × 2 viewports × 2 engines — **160
audits**. Each theme **loaded fresh** rather than toggled, because toggling
`data-theme` on a live page composites mid-transition and invents contrast
failures.

**Before: 19 distinct violations. After: 0.** Every one reproduced identically
in both engines — there were no Safari-only findings.

| what | why it mattered |
|---|---|
| `.strip-t` / `.strip-note` | `.story p{font:450 19px…; color:var(--ink-soft)}` is (0,1,1) and beat `.strip-t` (0,1,0). Those labels have **never** rendered as the 10px lime mono the rule asks for — they shipped as 19px body ink on a night panel, **2.43:1**. Confirmed with DevTools `CSS.getMatchedStylesForNode`, not guessed. |
| journey chapters | The inactive fade was `opacity:.4`, putting light-theme chapter copy at **1.92:1**. De-emphasis had become illegibility. `.82` is the lowest value clearing 4.5:1 for body and 3:1 for the 30px heading in both themes. The active chapter is now **marked** with a rule as well as lit. |
| courts search button | `color:var(--on-court,#0B1D14)` — `--on-court` is defined nowhere, so the fallback always shipped: near-black on `#1F5D43` is **2.25:1**, on the primary control of the courts page. White is 7.76:1. |
| demo | `--t3` raised (3.91/3.66 → 6.12/5.72), `--purple` darkened (white on it 4.23 → 7.10), a `<main>` added (the page had **no landmark at all**), and all six scrollable regions given `tabindex`, a label and a focus ring. `.screen` is `overflow-y:auto`, so every screen was a keyboard trap, not only the two axe reached first. |
| 404 | `.made-by` carries `opacity:.9`, so `--ink-mute` at 11px composites to 4.03:1. |

The runner was verified against injected defects before its zero was trusted: a
missing `alt`, an unlabelled `input`, a 1.55:1 block and an empty link were all
caught.

## Keyboard and screen-reader structure

`tools/checks/keyboard.mjs`, 20 templates, both engines: skip link is the first
tab stop and lands in `main`; every interactive element reachable in DOM order;
one `h1`; no heading skips; landmarks present and labelled; no keyboard trap.

**0 issues.** One real fix on the way there: the demo had no skip link at all,
so a keyboard user tabbed straight out of the page past the back link.

**WebKit reaches only form fields by Tab.** That is macOS Safari's shipped
default, not a site problem, and iOS Safari with a hardware keyboard or
VoiceOver does not behave that way — so tab-order assertions run in Chromium
and WebKit checks structure and naming.

## Focus visibility

`tools/checks/focus.mjs` answers this in **pixels**: screenshot the element's
neighbourhood, focus it, screenshot again, count changed pixels. **0 elements
show no visible change on focus**, across every template in both themes.

It exists because reading the focused element's own `outline`/`box-shadow` was
wrong twice — the indicator is usually on an ancestor via `:focus-within`, and
`outline: auto` has no numeric width. That method produced three findings, and
all three were the instrument. The courts field changes its border from
12%-alpha to solid `--court-fg` (**7.22:1** light, **9.35:1** dark) plus a 3px
glow; the homepage waitlist field has a working `:focus-within` rule too.

## Core Web Vitals

Measured directly rather than by installing Lighthouse — LCP and CLS come from
the browser's own `PerformanceObserver`. INP needs a real interaction stream, so
**total blocking time** is reported instead and labelled as such.

iPhone 15, CPU throttle **proven at 3.95–4.03×** before any number was printed:

| | range across all 20 templates | Google "good" |
|---|---|---|
| LCP | 92 – 900 ms | < 2500 ms |
| CLS | **0 on every page** | < 0.1 |
| TBT | 0 – 31 ms | < 200 ms |

Zero combinations outside the good range. The CLS zeros were verified by
injecting a 260px late shift, which registered **0.30** — the collector runs.
An earlier version did not: `window.__vitals = ${fn}()` without parentheses
around the arrow function reported `undefined` for every page.

## Weight, whole site

`before` is live production, `after` is this branch, both through the same
`weigh()` call.

| page | before | after | change |
|---|---|---|---|
| `/` @390 | 2209 KB | **435 KB** | **−80%** |
| `/` @1440 | 2343 KB | **461 KB** | **−80%** |
| `/courts/us/texas/austin` | 1325 KB | **220 KB** | **−83%** |
| `/courts/us/california` | 1366 KB | **260 KB** | **−81%** |
| `/community` | 429 KB | **227 KB** | **−47%** |
| `/organizers` @390 | 380 KB | **210 KB** | **−45%** |
| `/events/pickle-for-a-purpose/` | 381 KB | **229 KB** | **−40%** |
| `/players` @1440 | 440 KB | **257 KB** | **−42%** |
| `/live-scores` @390 | 346 KB | **220 KB** | **−36%** |
| `/demo/` | 686 KB | **455 KB** | **−34%** |
| `/clubs` @1440 | 409 KB | **253 KB** | **−38%** |
| `/courts/` | 323 KB | **297 KB** | **−8%** |

**Across all 22 measured page/viewport combinations: 16,690 KB → 6,225 KB, −63%.**

MapLibre (985 KB) and the court search index (58 KB brotli) are both absent from
every initial load; they are fetched on demand.

## What Phase I did NOT fix, and why

**Shared chrome target sizes** — masthead nav 32 px, footer links 38 px, social
row 25 px, skip link 39 px. Identical on all 4,130 pages, older than this
rebuild. Above WCAG 2.5.8's 24 px minimum, below the 44 pt bar in `CLAUDE.md`.
Fixing them means changing the masthead and footer that
`tools/courtgen/shell.py` generates and regenerating 4,104 court pages — a
diff that would bury everything else in this PR.

**Both wordmark images download on every page.** Measured properly in this
phase: `/images/*` is cached for 30 days, so the cost is **28 KB once per
visitor**, not per navigation — 30 KB + 28 KB on the first page, `transferSize`
of `0` on every page after it. Against a 4,117-file markup change, that does not
justify the blast radius. (The Phase G note originally claimed "per page load";
that claim is corrected in `docs/evidence/phase-g/README.md`.)

**Cloudflare Web Analytics on 6 of 4,130 pages.** `support`, `privacy`,
`terms`, `404`, `bracket/` and `organizer-templates` hardcode a
`static.cloudflareinsights.com` beacon with a real token; nothing else on the
site does, and Cloudflare is not auto-injecting it. So that data covers 0.15% of
the site while looking like site traffic, and it loads outside the Consent Mode
v2 framework that gates GA4 — including on `privacy.html` and `terms.html`.
Removing analytics or extending it are both product decisions, so neither was
made here.

**Apex → www never redirects.** `_redirects` carries
`https://picklecue.com/* https://www.picklecue.com/:splat 301`, but Cloudflare
Pages matches `_redirects` on the **path** only — an absolute-URL source is not
a rule it applies, so this has never fired. The whole site is served on both
hostnames. It is **not** a Universal Links problem: both hosts serve
`apple-app-site-association` as `200 application/json` with no redirect, which
`tools/checks/links.mjs` verifies explicitly. It needs a Cloudflare Redirect
Rule in the dashboard, which is not something the repo can carry.

**Production's canonical points at a redirect** — `/players` currently declares
`https://www.picklecue.com/players.html`, which 308s. Already fixed on this
branch; it clears on the first deploy.

## Checks added this phase

| tool | what it proves |
|---|---|
| `tools/gate-csp-hosts.mjs` | every external host a page references is covered by the policy in `_headers` (gate) |
| `tools/checks/axe.mjs` | axe-core across every template, both themes, both viewports, both engines |
| `tools/checks/csp.mjs` | the policy served as **enforcing**, on every page, both engines |
| `tools/checks/keyboard.mjs` | skip link, tab order, landmarks, heading outline, no trap |
| `tools/checks/focus.mjs` | focus visibility by pixel diff, not by computed style |
| `tools/checks/vitals.mjs` | LCP / CLS / TBT on a proven-throttled iPhone |
| `tools/checks/vendor.mjs` | the vendored libraries load from this origin, no CDN request |
| `tools/checks/links.mjs` | production redirects, AASA, canonicals, outbound campaign links |
| `tools/checks/templates.mjs` | the one template list all of the above share |

## Still owner-only

- **VoiceOver on a real iPhone.** Everything above is structure; the experience
  is not.
- **Real iOS Safari.** WebKit here is the same engine, not the same device: no
  real safe-area, no rubber-band scroll, no Low Power Mode, no Reduce Motion
  set by a person.
- **A live event.** `/live`, `/scorekeeper` and `/checkin` were verified to
  load, initialise their Supabase client and violate no policy. They were not
  verified against a running tournament with real scores.
