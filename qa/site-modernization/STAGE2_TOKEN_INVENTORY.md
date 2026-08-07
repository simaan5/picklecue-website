# Stage 2 - Token Inventory

Branch `feat/site-modernization`, base `main @ e38bada`.
Parser: brace-depth CSS scanner over `assets/*.css`, `fonts.css`, and every
`<style>` block in `*.html` and `*/index.html`.

**215 custom-property definitions, 27 distinct token names, across 8 files.**

---

## 1. Correction to the Section 11.B audit

The audit reported that `--court` had "four definitions" and that "whichever
cascade wins today is accidental". **That was overstated and is corrected
here.**

A first pass used a line-based parser that captured only the first declaration
on multi-declaration lines such as `--paper: #0F1214; --paper-2: #1A1F23;`.
That under-counted dark-theme blocks and made a correctly-themed system look
broken. Re-parsed with brace-depth tracking, the `:root` picture is sound:

| Token | `:root` (light) | dark override | Verdict |
|---|---|---|---|
| `--court` | `#2E5E4E` | `#6FB39B` | intentional theme pair |
| `--paper` | `#F4F1EA` | `#0F1214` | intentional theme pair |
| `--ink` | `#0C0F12` | `#EDE9DF` | intentional theme pair |
| `--clay` | `#D3511A` | `#F08250` | intentional theme pair |
| `--rule` | `rgba(12,15,18,.12)` | `rgba(237,233,223,.12)` | intentional theme pair |

`assets/site.css` defines a **complete** light and dark set. There is no
dark-mode gap, and no `:root`-level colour drift.

The remaining `--court` values (`#3EDC85`, `#00C27A`) are scoped to `.bvx` in
`assets/live.css`, i.e. the broadcast bracket view. Scoped overrides are
legitimate. **However see item 2.1 - that scope contains real drift.**

---

## 2. True drift (same token, same scope, competing values)

### 2.1 `.bvx` is defined twice in `assets/live.css` - REAL, dead code

`live.css:304` and `live.css:358` are both bare `.bvx { ... }`. The second
block (commented "BracketCanvasView 1:1 port") redefines the same tokens, so
**every token value in the first block is unreachable**.

| Token | line 304 (dead) | line 358 (effective) |
|---|---|---|
| `--paper` | `#10150F` | `#050707` |
| `--paper-2` | `#1A211C` | `#0A1613` |
| `--ink` | `#F2F5EF` | `#F2F5F3` |
| `--ink-soft` | `#C6CEC4` | `#B9C6BE` |
| `--ink-mute` | `#92A094` | `#889590` |
| `--court` | `#3EDC85` | `#00C27A` |
| `--live` | `#3EDC85` | `#A7FF5C` |
| `--rule` | `rgba(255,255,255,0.09)` | `rgba(255,255,255,0.10)` |
| `--rule-strong` | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.14)` |

**Disposition: ACCIDENTAL.** Anyone reading line 304 would believe those
values apply; they do not. Merging is visually a no-op because the second
block already wins.

### 2.2 Font tokens - REAL inconsistency, `index.html` is the correct one

| File | `--f-body` |
|---|---|
| `index.html` | `'Instrument Sans', 'Instrument Sans Fallback', -apple-system, ...` |
| `assets/site.css` | `'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif` |
| `live.css`, `404`, `poster`, `bracket` | `'Instrument Sans', -apple-system, sans-serif` |

`fonts.css` genuinely defines `'Fraunces Fallback'` and
`'Instrument Sans Fallback'` as `@font-face` with `size-adjust` (4 declarations).
These are **metric-matched fallbacks that suppress CLS during font swap**.

**Disposition: ACCIDENTAL.** The homepage gets CLS protection; the other seven
pages do not. `index.html`'s stack is canonical.

### 2.3 `--rule` on `poster.html` - REAL, trivial

`rgba(12,15,18,0.14)` vs `0.12` everywhere else. **Disposition: ACCIDENTAL**,
one-off typo-grade divergence.

---

## 3. Intentional, NOT drift - preserved deliberately

### 3.1 `--page-max`: 1240px vs 1080px

`1080px` is defined only in `assets/live.css`, which serves the live /
scorekeeper / check-in / bracket family. Those are dense operational screens
that intentionally read narrower than the marketing pages.

**Disposition: INTENTIONAL LOCAL SEMANTIC.** Per the Stage 2 brief, the
narrower requirement is not erased. Resolved by naming, not by unification -
see the semantic width set in section 5.

### 3.2 `--gutter`: `clamp(16px,4vw,40px)` vs `clamp(20px,4vw,44px)`

Same split as above: the tighter gutter belongs to `live.css` only.
**Disposition: INTENTIONAL LOCAL SEMANTIC**, same treatment.

### 3.3 All light/dark pairs

`--paper`, `--paper-2`, `--ink`, `--ink-soft`, `--ink-mute`, `--rule`,
`--rule-strong`, `--court`, `--clay`, `--masthead-bg`.
**Disposition: INTENTIONAL THEME OVERRIDE.** Untouched.

---

## 4. The actual structural problem: replication

The same ~20-token palette is copy-pasted into **six** files:

`assets/site.css`, `assets/live.css`, `404.html`, `index.html`,
`poster.html`, `bracket/index.html`

No single edit can change the palette. This is what produced 2.2 and 2.3: not
a cascade fight, but six copies drifting apart slowly. **This is the finding
that justified doing Stage 2 before any visual work.**

---

## 5. Radius: clustering evidence

Raw values found: `2, 5, 6, 12, 16, 18, 24, 28, 34, 36, 42, 44, 100px, 50%`
plus two directional values.

**34 / 36 / 42 / 44 are NOT arbitrary near-duplicates.** They are device-mockup
geometry:

| Component | outer | inner screen | delta |
|---|---|---|---|
| `.hero-device` / `.hero-device-screen` | 42px | 34px | 8px |
| `.reel-phone` / `.reel-phone-screen` | 44px | 36px | 8px |

The constant 8px delta is the bezel thickness. Folding these into a generic
scale would make the bezel optically wrong. The Stage 2 brief permits this
("unless an actual visual need exists"), so they become their own semantic
group rather than scale steps.

`50%` stays `50%` for true circles (`.edition-dot`, `.reel-dot`) and is not
forced into the card scale, per the brief.

---

## 6. Disposition summary

| Item | Disposition | Action |
|---|---|---|
| `:root` colour pairs | intentional theme override | preserve |
| `.bvx` double block | accidental | merge, keep effective values |
| font tokens | accidental | unify to metric-fallback stack |
| `poster.html --rule` | accidental | align to 0.12 |
| `--page-max` 1080 | intentional local semantic | rename, preserve |
| `--gutter` tighter | intentional local semantic | rename, preserve |
| device radii | intentional geometry | own semantic group |
| `50%` circles | intentional | preserve |
| six-file replication | structural | single canonical source |
