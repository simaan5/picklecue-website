# DESIGN.md — PickleCue website

The one design system for every page on www.picklecue.com. It is the **V2 token set**
already declared in `assets/site-v2.css` (mirrored in `index.html` and
`assets/site-v2-skin.css`). Nothing here is a new brand value.

Written 2026-09-27 from the five-group audit (design · mobile · states · flows · launch).
Static HTML/CSS only; CSP is enforcing. Not published: `tools/stage-dist.mjs` never
deploys `.md` files.

**Rule for changes:** every colour, font size, spacing value and radius on a page must come
from this file. If you need a value that is not here, add it here first, in the same PR.

## 1. Colour tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | #F7F7F2 | #071A12 | page background |
| `--card` (`--paper-2` on tool pages) | #FFFFFF | #0C2419 | raised surface |
| `--ink` | #0E1B14 | #EDF3EC | primary text |
| `--ink-soft` | #43564B | #B9CBBF | body / secondary text |
| `--ink-mute` | #5F6F64 (4.95:1 on paper) | #8FA697 (6.9:1) | captions, meta. **Floor for text — never lighter, never with opacity** |
| `--court` | #1F5D43 | #56D364 on tool pages | brand green as a FILL |
| `--on-court` | #FFFFFF | #0E1B14 | text on a `--court` fill (white on #56D364 fails AA) |
| `--court-fg` | #1F5D43 | #56D364 | brand green used AS TEXT |
| `--cue` | #56D364 | same | accent green on dark surfaces |
| `--electric` | #D8F35A | same | primary CTA fill; text on it is #061811 |
| `--night` / `--night-card` | #061811 / #0C2419 | #040F0A / #0C2419 | always-dark bands |
| `--paper-on-night` / `--mute-on-night` | #EDF3EC / #9BB0A2 | same | text on night bands |
| `--line` (`--rule`) | rgba(14,27,20,.12) | rgba(237,243,236,.14) | hairlines |
| `--rule-strong` | rgba(14,27,20,.28) | rgba(237,243,236,.28) | input and ghost-button borders |
| `--clay` / `--live` | #D3511A | #F08250 | status only: live, error, destructive. Not decoration |

Theme switching: `data-theme` on `<html>` plus a `prefers-color-scheme` fallback guarded by
`:root:not([data-theme="light"])`; persisted in `localStorage.pc_theme`.

**Retired V1 palette — must not appear:** #F4F1EA, #EAE5D9, #0C0F12, #3D4248, #6E7278,
#2E5E4E, #C8E04E, #0F1214, #1A1F23, #6FB39B, Fraunces. The tool pages (live, organizer,
scorekeeper, checkin, e, keepscore, bracket) moved to V2 on 2026-09-27.

**Intentional sub-themes (documented exceptions):** courtside TV mode and bracket broadcast
mode in `assets/live.css` (incl. `--bc-gold` #F5C64B); Discord brand #5865F2 / #4752C4 on
hover of the Discord ghost button; the ended-event page `events/pickle-for-a-purpose/`
keeps its own archived palette.

## 2. Typography

- `--f`: `'Instrument Sans', 'Instrument Sans Fallback', …` — everything. One variable file
  covers 400–800.
- `--f-mono`: JetBrains Mono — eyebrows/kickers, codes, numerals.
- **No italic face ships.** Never set `font-style: italic` on display text; accents are colour
  only (`--court-fg`). Body `<em>` may stay italic.
- Every face uses `font-display: optional`, so **every page preloads** the latin Instrument Sans
  and JetBrains Mono files (see the `<link rel="preload" as="font">` pair in any page head).
  A page without them renders system fonts on a first visit.

| Role | Spec |
|---|---|
| Hero h1 | 800, clamp(…) → ~69px (home 84px), line-height 1.02–1.05, tracking -.035em |
| Section h2 | 800, ~48px, tracking -.03em |
| Courts h1 | 800, clamp(38px, 5.2vw, 62px) |
| Card h3 | 700, 22–26px |
| Lede | 400, 1.25–1.35rem, `--ink-soft` |
| Body | 400, 17px/1.55–1.6 |
| Small / meta | 14–15px, `--ink-mute` |
| Kicker | 600 13px/1 mono, tracking .16em, uppercase, `--court-fg` |

Weights: 400, 500, 600, 700, 800 only. Tracking: -.035em, -.03em, -.02em, 0, .16em.

## 3. Shape, space, depth, motion

- Radius: 20px cards (`--r-card`), 14px media, 10–12px inputs and small tiles, **999px pills**
  (not 100px), 50% dots/avatars.
- Spacing (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 120.
- Layout: `--wrap` 1340px, `--wrap-tight` 1240px, 32px side padding; the phone header drops to
  16px below 340px.
- Grids: single-column tracks are `minmax(0,1fr)`, never `1fr` (a `1fr` track grows to its widest
  child and overflows a phone).
- Motion: `--ease` cubic-bezier(.16,1,.3,1). Overlays fade; everything respects
  `prefers-reduced-motion`.

## 4. Components

| Component | Spec |
|---|---|
| Primary button (marketing) | `.btn.btn-primary`: `--electric` fill, #061811 text, 600, 999px. Hero 17px / 18px 32px; nav 15px / 13px 24px, min-height 44px. **One per screen.** |
| Secondary button | `.btn.btn-ghost`: transparent, `--ink` text, 1.5px `--rule-strong` border |
| Tool-page primary | `.btn.primary` (live.css): `--court` fill, `--on-court` text — inside the web tools only |
| Form submit on a light card | `--court` fill + white (courts search) |
| Text link | `--court-fg`, 600 |
| Card | `--card`, 1px `--line`, 20px radius |
| Input | `--card` bg, 1px `--line`, 10–12px radius, min-height 44px; `aria-invalid="true"` on error |

**States every control needs:**
- `:hover` — lift or border change.
- `:active` — scale ~.94–.985.
- `:disabled` — opacity .6, `cursor: not-allowed`, no lift.
- `:focus-visible` — `outline: 2px solid currentColor; outline-offset: 3px` (one rule for all
  controls; currentColor contrasts with whatever surface the control sits on).

**Forms:** error text directly under the field in an `aria-live` region, `aria-invalid` on the
field, focus back in the field. While submitting: button disabled, label "Adding…",
`aria-busy` on the form. Success and failure each have their own message.

**Overlays (menu, lightbox, dialogs):** `role="dialog"` + `aria-modal`, focus moves to the close
button on open, Tab is trapped, Escape/close return focus to the trigger.

**Tap targets:** 44×44px minimum on touch (`@media (pointer:coarse)` for list links).

## 5. Known deviations still open

- 54 distinct shadows; proposed three tokens: `--shadow-sm`, `--shadow-cta`, `--shadow-lg`.
- Weights 450 / 550 / 650 appear ~28 times — fold to 400 / 500 / 600 when touching those rules.
- Font sizes are px, not rem, so a browser's default-size setting does not scale type (zoom
  still works). Converting is a larger refactor, deferred by owner decision 2026-09-27.
- `assets/acquire.css` uses `#C8F751` as a `var(--cue, …)` fallback (never renders while
  `--cue` is defined); `community.html` hover uses `#D3F76A`.
