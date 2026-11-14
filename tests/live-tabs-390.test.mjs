// node tests/live-tabs-390.test.mjs
// live.html tab row at 390 px (s39): with every tab present (Matches, Bracket, Courts, Results,
// My next match, Teams) the row is wider than the screen. It scrolled, but with the scrollbar
// hidden and no hint, "My next match" was cut mid-word and nothing said there was more.
//  1. Every tab is fully visible, or the row shows a fade hint on the side that has more.
//  2. Scrolled to the end: the end hint goes, the last tab is fully visible, a start hint shows.
//     A re-render (live update) keeps the user's scroll.
//  3. Tapping a tab that sits past the edge (re-render) leaves that tab fully in view.
//  4. 1280 px: the row fits; no hint.
// Local only: every *.supabase.co call is mocked.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = await new Promise(resolve => {
  const s = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error('traversal');
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const BASE = `http://127.0.0.1:${srv.address().port}`;
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };


const T = 'de000000-0000-4000-8000-000000000002';
const P = n => 'a0000000-0000-4000-8000-00000000000' + n;
const participants = [1, 2, 3, 4].map(n => ({ id: P(n), name: 'Player ' + n, seed: n, members: [] }));
const mk = (id, round, n, p1, p2, status, court, s1, s2) => ({ id: 'de000000-0000-4000-8000-0000000000' + id, round, match_number: n, status, participant1_id: p1, participant2_id: p2, court, participant1_score: s1, participant2_score: s2 });
const snapshot = {
  tournament: { id: T, name: 'Harbor Open', format: 'single_elimination', is_public: true, status: 'in_progress', start_date: '2026-11-14' },
  participants,
  matches: [mk('a1', 1, 1, P(1), P(4), 'completed', 'Court 1', 11, 6), mk('a2', 1, 2, P(2), P(3), 'in_progress', 'Court 2', 4, 3), mk('b1', 2, 1, P(1), null, 'pending', null)],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const state = page => page.evaluate(() => {
  const row = document.querySelector('.tabs'); const r = row.getBoundingClientRect();
  const tabs = [...row.querySelectorAll('.tab')].map(b => { const q = b.getBoundingClientRect(); return { text: b.textContent, full: q.left >= r.left - 0.5 && q.right <= r.right + 0.5, sel: b.getAttribute('aria-selected') === 'true' }; });
  const mask = getComputedStyle(row).maskImage || getComputedStyle(row).webkitMaskImage || 'none';
  return { fits: row.scrollWidth <= row.clientWidth, tabs, end: row.classList.contains('more-end'), start: row.classList.contains('more-start'), mask };
});
for (const width of [390, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('pc_consent', 'denied'));
await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === BASE) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.startsWith('/auth/')) return json({});
    const rpc = url.pathname.replace('/rest/v1/rpc/', '');
    if (rpc === 'live_tournament_snapshot') return json(snapshot);
    return json(null);
  });
  await ctx.routeWebSocket(/\.supabase\.co\/realtime\//, ws => {
    let arr = /vsn=2/.test(ws.url());
    ws.onMessage(raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      let j, r, t; if (Array.isArray(m)) { arr = true; [j, r, t] = m; } else ({ join_ref: j, ref: r, topic: t } = m);
      if (r != null) ws.send(arr ? JSON.stringify([j ?? r, r, t, 'phx_reply', { status: 'ok', response: {} }]) : JSON.stringify({ topic: t, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: r, join_ref: j }));
    });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/live.html?t=${T}`);
  await page.waitForSelector('.tab[data-tab="me"]');
  await page.waitForTimeout(100);
  let s = await state(page);
  const names = s.tabs.map(t => t.text).join(', ');
  if (width === 1280) {
    check(s.fits && s.tabs.every(t => t.full) && !s.end && !s.start, `4. 1280px: row fits, no hint (${names})`);
    await ctx.close(); continue;
  }
  check(s.tabs.length === 6, `390px: all six tabs rendered (${names})`);
  const hidden = s.tabs.filter(t => !t.full).map(t => t.text);
  check(s.fits || (s.end && s.mask !== 'none'), `1. 390px: tabs fit, or an end hint shows (cut: ${hidden.join(', ') || 'none'}; more-end=${s.end}; mask=${s.mask.slice(0, 40)})`);
  await page.evaluate(() => { const r = document.querySelector('.tabs'); r.scrollLeft = r.scrollWidth; });
  await page.waitForTimeout(150);
  s = await state(page);
  check(!s.end && s.tabs[s.tabs.length - 1].full && (s.fits || s.start), `2. scrolled to end: end hint gone (more-end=${s.end}), last tab visible (${s.tabs[s.tabs.length - 1].full}), start hint=${s.start}`);
  // A re-render with the same tab selected (what a live score update does) keeps the user's scroll.
  await page.evaluate(() => document.querySelector('.tab[aria-selected="true"]').click());
  await page.waitForTimeout(150);
  s = await state(page);
  check(!s.end && s.tabs[s.tabs.length - 1].full, `2b. re-render with the same tab keeps the row scrolled to the end (more-end=${s.end})`);
  await page.evaluate(() => { document.querySelector('.tabs').scrollLeft = 0; });
  await page.waitForTimeout(150);
  s = await state(page);
  check(!s.tabs.find(t => t.text === 'Teams').full, '3a. before the tap, Teams is cut off (so 3 tests the scroll-into-view)');
  // DOM click: Playwright's page.click would scroll Teams into view itself.
  await page.evaluate(() => document.querySelector('.tab[data-tab="players"]').click());
  await page.waitForTimeout(150);
  s = await state(page);
  const sel = s.tabs.find(t => t.sel);
  check(sel && sel.text === 'Teams' && sel.full, `3. after tapping Teams and re-render, it is fully in view (${JSON.stringify(sel)})`);
  await ctx.close();
}
await browser.close(); srv.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll live tab-row checks passed');
