// node tests/de-round-names.test.mjs
// live.html Bracket tab, double elimination (s39): each side titled its rounds with the
// single-elimination names, so the losers' last round and the grand final both read "Final".
// The round headers must use the iPhone app's names (TournamentBracket.doubleEliminationRoundName):
// "Winners Round N" / "Winners Semifinals" / "Winners Final", "Losers Round N" / "Losers Final",
// "Grand Final", "Grand Final — Reset". Local only: every *.supabase.co call is mocked.
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


const DE = 'de000000-0000-4000-8000-000000000001';
const P = n => 'a0000000-0000-4000-8000-00000000000' + n;
const participants = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: P(n), name: 'Player ' + n, seed: n, members: [] }));
let seq = 0;
const mk = (side, round, n, status = 'pending') => Array.from({ length: n }, (_, i) => ({ id: 'de000000-0000-4000-8000-' + String(++seq).padStart(12, '0'), round, match_number: i + 1, bracket_side: side, status, participant1_id: null, participant2_id: null }));
const snapshot = {
  tournament: { id: DE, name: 'Harbor DE', format: 'double_elimination', is_public: true, status: 'in_progress', start_date: '2026-11-14' },
  participants,
  matches: [...mk('winners', 1, 4, 'in_progress'), ...mk('winners', 2, 2), ...mk('winners', 3, 1),
            ...mk('losers', 1, 2), ...mk('losers', 2, 2), ...mk('losers', 3, 1), ...mk('losers', 4, 1),
            ...mk('grand_final', 1, 1), ...mk('reset_final', 1, 1)],
};
// Three shapes: 8 teams; 4 teams; and 8 teams with rounds numbered from the final down
// (some app-built brackets store round=1 for the last round; orderRounds flips them).
const shapes = {
  eight: { m: () => snapshot.matches, x: {
    winners: ['Winners Round 1', 'Winners Semifinals', 'Winners Final'],
    losers: ['Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Final'],
    grand_final: ['Grand Final'], reset_final: ['Grand Final — Reset'] }, chips: { winners: 'W1 W2 W3', losers: 'L1 L2 L3 L4', grand_final: 'GF', reset_final: 'GF2' } },
  four: { m: () => [...mk('winners', 1, 2), ...mk('winners', 2, 1), ...mk('losers', 1, 1), ...mk('losers', 2, 1), ...mk('grand_final', 1, 1), ...mk('reset_final', 1, 1)], x: {
    winners: ['Winners Semifinals', 'Winners Final'], losers: ['Losers Round 1', 'Losers Final'],
    grand_final: ['Grand Final'], reset_final: ['Grand Final — Reset'] } },
  reversed: { m: () => [...mk('winners', 3, 4), ...mk('winners', 2, 2), ...mk('winners', 1, 1), ...mk('losers', 4, 2), ...mk('losers', 3, 2), ...mk('losers', 2, 1), ...mk('losers', 1, 1), ...mk('grand_final', 1, 1)], x: {
    winners: ['Winners Round 1', 'Winners Semifinals', 'Winners Final'],
    losers: ['Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Final'], grand_final: ['Grand Final'] } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [shape, def] of Object.entries(shapes)) for (const width of (shape === 'eight' ? [390, 1280] : [390])) {
  snapshot.matches = def.m();
  const EXPECT = def.x;
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
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
  await page.goto(`${BASE}/live.html?t=${DE}`);
  await page.click('text=Bracket');
  await page.waitForSelector('.bc-stack[data-side="grand_final"] .bc-roundhead');
  const got = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bc-stack[data-side]')].map(s =>
    [s.dataset.side, [...s.querySelectorAll('.bc-roundhead > span')].map(x => x.textContent)])));
  for (const side of Object.keys(EXPECT)) {
    check(JSON.stringify(got[side]) === JSON.stringify(EXPECT[side]), `${shape} ${width}px ${side}: ${JSON.stringify(got[side])}`);
  }
  if (def.chips) {
    const chips = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bc-stack[data-side]')].map(s =>
      [s.dataset.side, [...s.querySelectorAll('.bc-chip')].map(x => x.textContent).join(' ')])));
    check(JSON.stringify(chips) === JSON.stringify(def.chips), `${shape} ${width}px rail chips: ${JSON.stringify(chips)}`);
  }
  const anyBareFinal = Object.values(got).flat().filter(t => t === 'Final');
  check(anyBareFinal.length === 0, `${shape} ${width}px no round header reads a bare "Final" (${anyBareFinal.length})`);
  await ctx.close();
}
await browser.close(); srv.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll DE round-name checks passed');
