#!/usr/bin/env node
/**
 * One analytics owner.
 *
 * WHY THIS EXISTS
 * assets/acquire.js carries this comment above its click handler:
 *
 *     One delegated listener for the document. Pages must not add their own —
 *     two listeners on nested elements is how an event gets counted twice.
 *
 * Three pages in production added their own anyway, and they failed in TWO
 * different ways:
 *
 *   index.html          a second delegated listener, but acquire.js's own
 *                       gtag-shaped `track`. Both listeners fired it, so every
 *                       CTA click on the busiest page counted TWICE in GA4.
 *                       (Already removed during the Phase B acquisition pass;
 *                       the fallback that remains is byte-equivalent to
 *                       acquire.js's and is guarded with `||`.)
 *
 *   community.html      a second listener AND their own `window.track`, defined
 *   the event page      before acquire.js loaded — so acquire.js's
 *                       `window.track || ...` kept the page's version. That
 *                       version pushed a GTM-shaped object,
 *
 *                           dataLayer.push({ event: 'app_store_click', ... })
 *
 *                       into a dataLayer owned by GTAG.JS. The site loads
 *                       gtag/js?id=G-XCV417L0J8 with no GTM container, and
 *                       gtag.js only interprets the `arguments` objects gtag()
 *                       itself pushes. A bare {event:...} sits there unread.
 *                       Measured: 0 GA4 events and 2 inert pushes per click.
 *
 * So the community event link — the whole point of that page — reported nothing
 * at all, while the pages that simply trusted acquire.js reported normally.
 * Nobody would find that by reading either file alone. Hence a gate.
 *
 *   node tools/gate-analytics.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'videos', 'images', 'assets', 'tools', 'Website']);

function html(dir = ROOT, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n) || n.startsWith('.')) continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) html(f, out);
    else if (n.endsWith('.html')) out.push(f);
  }
  return out;
}

const fails = [];
let scanned = 0, tracked = 0;

for (const f of html()) {
  const rel = relative(ROOT, f);
  const s = readFileSync(f, 'utf8');
  scanned++;

  /* Poster/export pages are print artefacts, not site pages. */
  if (/^poster|^organizer-templates/.test(rel)) continue;

  /* One assignment shape is allowed: a `||`-guarded fallback whose body calls
     gtag directly. index.html needs it because its inline IIFE parses before
     the deferred acquire.js and calls window.track itself (stage_select,
     screenshot_zoom, theme_change, role_select, waitlist_success). Anything
     else — above all a fallback that pushes to dataLayer instead of calling
     gtag — wins the `||` in acquire.js and silently replaces the real path.

     Checked semantically, not by string match. A first version compared
     normalised source and rejected `function(name, params)` for not being
     `function (name, params)`; a second used a negative lookahead that `\s*`
     backtracking walked straight past, and flagged `window.track === 'function'`
     as an assignment. Both were the instrument, not the code. */
  for (const m of s.matchAll(/window\.track\s*=[^=][\s\S]{0,320}?\};/g)) {
    const stmt = m[0];
    const guarded = /window\.track\s*=\s*window\.track\s*\|\|/.test(stmt);
    const callsGtag = /gtag\(\s*['"]event['"]/.test(stmt);
    const pushes = /dataLayer\s*\.\s*push/.test(stmt);
    if (!guarded)
      fails.push(`${rel}: assigns window.track unconditionally — it wins the "||" in acquire.js. Guard it with \`window.track = window.track || ...\` or delete it.`);
    else if (pushes || !callsGtag)
      fails.push(`${rel}: window.track fallback does not call gtag('event', ...)${pushes ? ' and pushes to dataLayer instead' : ''}. This site runs gtag.js with no GTM container, so a raw dataLayer push is never read.`);
  }

  if (/addEventListener\(\s*['"]click['"][\s\S]{0,200}?closest\(\s*['"]\[data-track\]['"]/.test(s))
    fails.push(`${rel}: adds its own delegated [data-track] listener. acquire.js already has one; two listeners means two events per click.`);

  if (/dataLayer\.push\(\s*\{\s*event\s*:/.test(s))
    fails.push(`${rel}: pushes a GTM-shaped {event:...} object. This site runs gtag.js with no GTM container, so nothing reads it. Use gtag('event', name, params) — which is what acquire.js does.`);

  if (/\sdata-track=/.test(s)) {
    tracked++;
    if (!/assets\/acquire\.js/.test(s))
      fails.push(`${rel}: has [data-track] elements but never loads /assets/acquire.js, so none of them are tracked.`);
  }
}

if (fails.length) {
  console.error(`\nANALYTICS GATE: ${fails.length} problem(s)\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  console.error('\n  assets/acquire.js is the single owner of window.track and of the\n  [data-track] click listener. Pages supply markup, not wiring.\n');
  process.exit(1);
}
console.log(`Analytics gate holds: ${scanned} page(s) scanned, ${tracked} carry [data-track], all routed through assets/acquire.js.`);
