# Stage 3 inputs - findings locked, deferred from Stage 1 and 2

Not to be actioned during Stage 2. Recorded so nothing is lost.

## From the Stage 1 accessibility baseline

Baseline scores, desktop, `http://localhost:8899/index.html`:
Accessibility **92**, Best Practices **88**, SEO **100**.
Report: `.modernization/baseline/lighthouse-desktop.json`.

1. **Waitlist modal: `aria-hidden="true"` containing focusable content.**
   `#waitlistPopup` is `role="dialog" aria-modal="true" aria-hidden="true"`
   with focusable descendants. Keyboard users can tab into a dialog screen
   readers are told does not exist. Fix with real focus management, not by
   stripping interactivity.

2. **`.reel-phone` `aria-hidden` wrapping focusable video controls.**
   Same class of defect. Per Andrew: do NOT solve by disabling video
   accessibility. Fix the container semantics.

3. **Modal `h2` precedes the page `h1` in DOM order.**
   First heading in document is "First in line, at launch." (the modal),
   before "All the pickleball. One elegant app." Exactly one `h1` exists and
   landmarks are correct (`banner`, `nav`, `main`, `contentinfo`), so this is
   purely a source-order fix. Moving the modal markup later also helps item 1.

4. **`charset` declared missing or too late.** Lighthouse `charset` audit fails.

5. **Masthead wordmark aspect-ratio warning.**
   `<img class="masthead-wordmark wm-dark" ... height="21" aria-hidden="true">`
   rendered at a ratio that does not match its intrinsic size.

6. **Anstelias footer link: `label-content-name-mismatch`.**
   Visible text is not included in the accessible name on the `.made-by` link.

7. **Scroll and timer auto-open waitlist behaviour.**
   `window.addEventListener('scroll', onScroll, {passive:true})` plus
   `setTimeout(maybeOpen, FALLBACK_DELAY_MS)`. Remove the automatic opening
   entirely; keep intentional CTA-triggered opening.

8. **`ERR_CONNECTION_REFUSED` console error - DO NOT TOUCH YET.**
   Observed only against the local `python3 -m http.server` baseline.
   Before treating as a production defect, establish:
   - exact request URL and originating script
   - whether it reproduces on `https://www.picklecue.com`
   - whether CSP report-only or an analytics endpoint causes it
   - whether a browser extension or the test harness causes it
   Treat as a production defect only once reproduced in production.

## Contrast, carried into Stage 2 semantics but verify again in Stage 3

56 contrast failures at baseline, concentrated in a small number of pairs:

| count | foreground | background | ratio |
|---|---|---|---|
| 36 | `#6e7278` (`--ink-mute`) | `#f4f1ea` (`--paper`) | 4.28:1 |
| 5 | `#c5c5c2` | `#f4f1ea` | 1.53:1 |
| 5 | `#a3a29e` | `#f4f1ea` | 2.26:1 |
| 5 | `#b4b4b1` | `#f4f1ea` | 1.84:1 |
| 3 | `#7b7f83` | `#f4f1ea` | 3.57:1 |
| 2 | `#afbeb3` | `#f4f1ea` | 1.71:1 |

AA small-text floor is 4.5:1. Brand primitives must NOT be mutated to fix
this; semantic foreground tokens carry AA-safe values instead.

## Structural items explicitly OUT of Stage 2 scope

Not to be changed until authorized: waitlist popup behaviour, DOM heading
order, reel markup, persona layout, navigation IA, homepage section order,
modal focus behaviour, Anstelias footer link, charset placement, masthead
image sizing, analytics, videos, visible marketing copy, page titles, OG tags,
JSON-LD, routes, anchors, redirects.
