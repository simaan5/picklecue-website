# Website analytics events

**Owner:** `assets/acquire.js`. One delegated listener on `document` reads
`data-track` as the event name and every other `data-*` attribute on the same
element as a parameter. A new CTA is therefore markup only, and cannot invent an
event name by accident.

**No new vendor.** This calls the gtag already on the page, through the existing
Consent Mode v2 defaults (EEA/UK/CH denied until opt-in, granted elsewhere). If
consent is denied gtag drops the event; nothing here changes behaviour.

**No page may add its own `[data-track]` listener.** `assets/site-v2.js` and
`index.html` each had one before Phase B. Two listeners on nested elements
double-count every click.

---

## The one rule that shapes this schema

> **An App Store click is an outbound click, never an install.**

We cannot see the store. `app_store_click` is named for what it measures. Do not
add a conversion, goal or param that implies a download happened.

There is one place this nearly went wrong. On desktop the App Store badge is
intercepted and opens the QR panel instead of navigating. Without
`e.stopPropagation()` in that handler, the delegated tracker still fired
`app_store_click` — recording a store visit that was cancelled a line earlier.
Caught in Phase B verification; the interception now emits `qr_open` only.

---

## Events

| Event | When | Parameters |
|---|---|---|
| `app_store_click` | any outbound click to `apps.apple.com` | `placement`, `audience`, `page` |
| `qr_open` | desktop QR panel opened, by badge interception or the explicit trigger | `page` |
| `qr_copy_link` | "Copy link" pressed inside the QR panel | `page` |
| `install_bar_shown` | sticky install bar became visible | `page` |
| `install_bar_dismiss` | visitor dismissed the sticky bar | `page` |
| `demo_open` | link into `/demo/` | `placement`, `audience`, `page` |
| `demo_start` | guided tour started | `source` (`intro` \| `replay`), `page` |
| `demo_step` | a tour step became active | `step` (1–5), `id`, `page` |
| `demo_skip` | tour abandoned mid-way | `step` reached, `page` |
| `demo_complete` | final tour step finished | `page` |
| `demo_explore_free` | tour declined from the landing state | `page` |
| `spectators_open` | link into `/live-scores` | `placement`, `audience`, `page` |
| `event_code_focus` | "I have an event code" CTA | `placement`, `audience`, `page` |
| `event_code_open` | a well-formed six-character code submitted | `placement`, `audience`, `page` |
| `community_event_view` | opening a community event page from a card | `placement`, `audience`, `page` |
| `community_event_outbound` | leaving to an organizer's own event site | `event_slug`, `placement`, `page` |
| `community_partner_email` | "Tell us about your event" | `placement`, `audience`, `page` |
| `waitlist_submit` | international availability form submitted | `placement`, `audience`, `page` |
| `waitlist_success` / `waitlist_error` | server outcome of the above | `existing` / `status` |
| `theme_change` | light/dark toggle | `to` |
| `screenshot_zoom` | a device screenshot opened full size | `shot` |
| `stage_select` | homepage stage rail clicked | `stage` |

### `placement`

`nav` · `nav_mobile` · `menu` · `hero` · `mid` · `card` · `form` · `final` ·
`sticky` · `qr` · `geo_prompt` · `inline`

### `audience`

`home` · `players` · `organizers` · `clubs` · `courts` · `community` ·
`spectators` · `demo` · `event` · `legal` · `support` · `desktop` · `notfound`

`page` is always `location.pathname`.

---

## What was replaced

Eight `data-cta` values pointed at the same Download button — `nav_waitlist`,
`nav_early_access`, `mobile_waitlist`, `templates_nav_waitlist`,
`event_p4p_nav_waitlist`, plus `hero`, `final` and the per-audience variants.
"Waitlist" survived launch by four days in the label of the button that sends
people to the App Store.

Separately, the entire `/courts` tree — 2,613 indexable pages, the largest
organic surface on the site — carried **no tracking attribute at all**, so an
App Store click from a city page was invisible even after gtag was added there.

Both are fixed. 39 App Store links across 14 hand-authored pages, plus the
generated court shell, now emit one event with a placement and an audience.

---

## Cutovers

| Retired | Date | Replaced by | Why |
|---|---|---|---|
| `community_event_register_click` | 2026-08-25 | `community_event_outbound_click` | The button no longer offers registration. The organizer's page exposes no purchasable ticket, so every CTA now reads "View official event page". Counting those as registrations would be wrong data, not untidy data. |
| `cta_click` + `data-cta` (28 values) | 2026-08-25 | `app_store_click` / `demo_open` / `spectators_open` / … with `placement` + `audience` | Eight different names pointed at the same Download button. |

**Do not double-fire during a cutover.** Emitting both the old and the new name
contaminates both totals and makes the transition impossible to read.

If registration for a community event becomes directly available again, do not
revive `community_event_register_click`. Express it on the current event —
`community_event_outbound_click` with `intent: "registration"` — or define a
deliberate registration event with a written meaning. The base event name must
keep describing what the click actually does.

---

## Privacy

- No PII. No email, no search text, no coordinates, no court name.
- `event_slug` is a public URL slug, never a person.
- The court search box and the event-code field send **no input value** — only
  that a submission happened.
- Geolocation is disabled site-wide by `Permissions-Policy`, so there is no
  coordinate to leak.
- No Mixpanel, Hotjar, session replay, fingerprinting or ad pixel. Adding one is
  a separate privacy decision, not an analytics change.

---

## Verifying a change

`node _acq.mjs`-style checks are not committed; the durable assertions live in
Phase B's verification and should be re-run when a CTA moves. The two that
matter:

1. **Fire exactly once.** Spy on `gtag` *after* load — the page declares
   `function gtag(){...}` inline, which overwrites anything installed earlier —
   click a CTA, and assert one event.
2. **Never fire for a cancelled navigation.** Click a desktop App Store badge and
   assert the only event is `qr_open`.
3. **Resolve `window.track` at call time in the demo.** `demo/tour.js` is a
   classic script at the end of `<body>`, so it runs *before* the deferred
   `acquire.js` that defines `window.track`. Capturing the function at load time
   binds the no-op fallback and drops every tour event silently.
4. **`demo_start` precedes `demo_step 1`.** The first implementation called
   `setStep(0)` before it announced the start, so the funnel read "step 1, then
   started".
