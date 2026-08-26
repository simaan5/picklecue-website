#!/usr/bin/env node
/* Phase performance report — the same numbers, the same way, every phase.
 *
 *   node tools/measure/report.mjs                      all tracked pages
 *   node tools/measure/report.mjs /players /organizers only these
 *   node tools/measure/report.mjs --json               machine-readable
 *   node tools/measure/report.mjs --search             + court-search timings
 *
 * "before" is always live production, "after" is always the working tree, and
 * both go through the same weigh() call. Phase I compares like for like because
 * nothing here is re-implemented per phase.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withSite, compare, compressed, verifyThrottle, timeInteraction, table, VIEWPORTS, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const withSearch = args.includes('--search');
const paths = args.filter(a => a.startsWith('/'));

const TRACKED = ['/', '/players', '/organizers', '/clubs', '/community', '/live-scores',
                 '/courts/', '/courts/us/california', '/courts/us/texas/austin',
                 '/events/pickle-for-a-purpose/', '/demo/'];

const out = await withSite(async ({ origin, browser }) => {
  const result = { generated: new Date().toISOString(), pages: [], assets: [], search: null, throttle: null };

  for (const path of (paths.length ? paths : TRACKED)) {
    for (const vp of VIEWPORTS) {
      result.pages.push(await compare(browser, origin, path, vp, { watch: ['maplibre', 'courts-search-index'] }));
    }
  }

  /* Lazily fetched assets are not page weight, so they are reported apart from
     it — with the compressed sizes, because that is what crosses the wire. */
  for (const rel of ['assets/courts-search-index.json', 'assets/acquire.js', 'assets/courtsearch.js', 'assets/journey.js', 'assets/site-v2.css'])
    result.assets.push(await compressed(rel));

  if (withSearch) {
    result.throttle = await verifyThrottle(browser, 4);
    if (!result.throttle.applied) {
      console.error(`\n!! CPU throttle did not apply (ratio ${result.throttle.ratio}x). Throttled numbers are NOT reported.\n`);
    }
    const opts = {
      setup: async p => { await p.click('#courtSearchInput'); await p.fill('#courtSearchInput', 'warmup'); await p.waitForTimeout(1200); },
      act: (i) => { const q = ['austin', 'cal', 'san', 'pickleball', 'park', 'tex', 'a', 'riverside', 'north', 'court']; const el = document.getElementById('courtSearchInput'); el.value = i < 0 ? '' : q[i % q.length]; el.dispatchEvent(new Event('input')); },
      doneSelector: '.cs-list li, .cs-msg',
      watchSelector: '#courtSearchResults',
      knownDelayMs: 40,
      samples: 10,
    };
    result.search = [await timeInteraction(browser, origin, '/courts/', VIEWPORTS[1], opts)];
    if (result.throttle.applied) result.search.push(await timeInteraction(browser, origin, '/courts/', VIEWPORTS[0], { ...opts, cpuThrottle: 4 }));
  }
  return result;
});

if (asJson) {
  const f = join(ROOT, 'docs/evidence/performance.json');
  writeFileSync(f, JSON.stringify(out, null, 2) + '\n');
  console.log('wrote docs/evidence/performance.json');
} else {
  console.log('\nPAGE TRANSFER — first-party, decoded bytes, same function both sides\n');
  console.log(table(out.pages.map(p => ({
    page: p.path, vp: p.viewport, before: p.before + ' KB', after: p.after + ' KB',
    change: (p.deltaPct > 0 ? '+' : '') + p.deltaPct + '%',
    maplibre: p.after_detail.hits.maplibre, searchIndex: p.after_detail.hits['courts-search-index'],
  })), ['page', 'vp', 'before', 'after', 'change', 'maplibre', 'searchIndex']));

  console.log('\nASSETS — fetched on demand, so not page weight\n');
  console.log(table(out.assets.map(a => ({ asset: a.path, raw: a.rawKB + ' KB', gzip: a.gzipKB + ' KB', brotli: a.brotliKB + ' KB' })), ['asset', 'raw', 'gzip', 'brotli']));

  if (out.search) {
    console.log(`\nCPU THROTTLE — base ${out.throttle.baseMs} ms, throttled ${out.throttle.throttledMs} ms, ratio ${out.throttle.ratio}x (${out.throttle.applied ? 'applied' : 'NOT APPLIED'})`);
    console.log('\nCOURT SEARCH — real code path, MutationObserver end, no sleeps inside the window\n');
    console.log(table(out.search.map(s => ({
      viewport: s.viewport, samples: s.samples,
      'keystroke→painted': s.totalMedianMs + ' ms',
      'p95': s.totalP95Ms + ' ms',
      'debounce': s.knownDelayMs + ' ms',
      'compute+render': s.computeRenderMedianMs + ' ms',
    })), ['viewport', 'samples', 'keystroke→painted', 'p95', 'debounce', 'compute+render']));
  }
  console.log('');
}
