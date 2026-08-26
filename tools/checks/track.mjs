#!/usr/bin/env node
/* Runtime proof that one click produces exactly one GA4 event.
 *
 * The static gate (tools/gate-analytics.mjs) catches the shapes that caused the
 * bug. This catches the OUTCOME on the real code path: click a real tracked
 * element and count the gtag('event', ...) commands that reach dataLayer.
 *
 * TWO INSTRUMENT MISTAKES MADE HERE, BOTH CORRECTED:
 *   1. Counting GTM-shaped {event:...} objects in dataLayer. That is the very
 *      shape that does not work, so the correct pages all read as zero.
 *   2. Stubbing window.gtag in an init script. Every page's head declares
 *      `function gtag(){dataLayer.push(arguments);}` — a global function
 *      declaration that overwrites the stub the moment the page parses. All
 *      eight pages read as zero, including the ones that were fine.
 *
 * What actually works: gtag() pushes its `arguments` object into dataLayer, so
 * a real GA4 event is an array-like entry whose [0] is 'event'. gtag.js itself
 * never loads here (googletagmanager.com is not served locally) and does not
 * need to — the command queue is the observable.
 *
 *   node tools/checks/track.mjs            (add --git-stash-check to compare HEAD)
 */
import { withSite, ROOT } from '../measure/lib.mjs';

const PAGES = ['/', '/community', '/events/pickle-for-a-purpose/', '/players', '/organizers', '/clubs', '/courts/', '/live-scores'];

const rows = await withSite(async ({ origin, browser }) => {
  const out = [];
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(origin + path, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const el = document.querySelector('a[data-track]');
      if (!el) return { name: '(none on page)', events: 0, params: null, dl: 0 };
      const name = el.getAttribute('data-track');
      el.addEventListener('click', e => e.preventDefault());
      const dl = window.dataLayer || [];
      const before = dl.length;
      el.click();
      const added = Array.prototype.slice.call(dl, before);
      const fired = added.filter(a => a && a[0] === 'event' && a[1] === name);
      /* Anything else added by the click is a push nothing reads — the exact
         GTM-shaped object that made three pages report zero for months. */
      const inert = added.filter(a => !(a && a[0] === 'event'));
      return { name, events: fired.length, params: fired[0] ? fired[0][2] : null, inert: inert.length };
    });
    out.push({ path, ...r });
    await ctx.close();
  }
  return out;
});

let bad = 0;
console.log('\n  page                              tracked event            GA4 evt  inert dl  params');
console.log('  ' + '-'.repeat(104));
for (const r of rows) {
  const ok = r.name === '(none on page)' || (r.events === 1 && !r.inert);
  if (!ok) bad++;
  const p = r.params ? Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  console.log(`  ${r.path.padEnd(33)} ${r.name.padEnd(24)} ${String(r.events).padEnd(8)} ${String(r.inert ?? 0).padEnd(9)} ${p.slice(0, 52)}${ok ? '' : '   <-- WRONG'}`);
}
console.log('');
if (bad) { console.error(`  ${bad} page(s) do not fire exactly one GA4 event per click.\n`); process.exit(1); }
console.log('  Every tracked click produces exactly one GA4 event.\n');
