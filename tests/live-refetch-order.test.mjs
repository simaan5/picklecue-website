// node tests/live-refetch-order.test.mjs
// Leading-edge ping + trailing refetch on live.html (PR #59 review P3): a
// burst of two pings 50 ms apart fires the leading refetch at once (older
// score, slow reply) and the trailing one 250 ms later (newer score, fast
// reply). The slow leading reply lands last and must not paint over the
// newer score. Same request-counter approach as tests/live-snapshot-order.
// Local only: *.supabase.co and the realtime socket are mocked.
// Optional: PC_SHOT=/path.png saves a screenshot of the final state.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T_ID = '7a1c2e90-5b3d-4f6a-9c8e-1d2f3a4b5c6d';
let score1 = 4; const delays = []; const requested = [];
const snap = s1 => ({ tournament: { id: T_ID, name: 'Harbor Fall Classic', is_public: true, status: 'in_progress', format: 'round_robin' },
  participants: [{ id: 'p1', name: 'Rivera / Chen', members: [] }, { id: 'p2', name: 'Okafor / Lindqvist', members: [] }],
  matches: [{ id: 'm1', round: 1, match_number: 1, court: 'Court 1', status: 'in_progress', participant1_id: 'p1', participant2_id: 'p2', live: { score1: s1, score2: 3, game: 1 } }] });

let browser, shown = null, err = null;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 600 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('pc_consent', 'denied'); } catch (_) {} });
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === BASE) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.includes('live_tournament_snapshot')) {
      const s = score1; requested.push(s);
      await sleep(delays.shift() ?? 50);
      return json(snap(s));
    }
    return json(null);
  });
  let wsSend = null, joinRef = null;
  await ctx.routeWebSocket(/\.supabase\.co\/realtime\//, ws => {
    let arr = /vsn=2/.test(ws.url());
    const send = (j, r, t, e, p) => ws.send(arr ? JSON.stringify([j, r, t, e, p]) : JSON.stringify({ topic: t, event: e, payload: p, ref: r, join_ref: j }));
    wsSend = send;
    ws.onMessage(raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      let j, r, t, e; if (Array.isArray(m)) { arr = true; [j, r, t, e] = m; } else ({ join_ref: j, ref: r, topic: t, event: e } = m);
      if (e === 'phx_join') joinRef = j ?? r;
      if (r != null) send(j ?? r, r, t, 'phx_reply', { status: 'ok', response: {} });
    });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/live.html?t=${T_ID}`);
  await page.waitForSelector('.match-card.live-now');
  await sleep(1200);
  const ping = () => wsSend(joinRef, null, 'realtime:live:t:' + T_ID, 'broadcast', { type: 'broadcast', event: 'change', payload: { table: 'score_events' } });
  score1 = 5; delays.push(900); ping();   // leading edge: fires now, reply is slow
  await sleep(50);
  score1 = 6; delays.push(100); ping();   // inside the 250 ms window: trailing refetch, fast reply
  await sleep(1600);                      // leading reply (900 ms) has landed after the trailing one
  shown = await page.evaluate(() => document.querySelector('.match-card.live-now .pts').textContent);
  if (process.env.PC_SHOT) {
    await page.evaluate(([s, ok]) => {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:10px 12px;font:600 13px/1.35 system-ui;color:#fff;background:' + (ok ? '#167a3e' : '#b3261e');
      b.textContent = (ok ? 'OK: ' : 'BUG: ') + 'burst of 2 pings (leading slow 5, trailing fast 6). Server score 6, page shows ' + s + '.';
      document.body.appendChild(b);
    }, [shown, shown === '6']);
    await page.screenshot({ path: process.env.PC_SHOT });
  }
} catch (e) { err = e; }
await browser?.close(); srv.close();
if (err) { console.error('FAIL ', err); process.exit(1); }
const ok = shown === '6' && requested.slice(-2).join(',') === '5,6';
console.log(`snapshot requests (score at request time): ${requested.join(',')}`);
console.log((ok ? 'ok   ' : 'FAIL ') + `score after leading + trailing refetch shows ${shown} (server 6)`);
process.exit(ok ? 0 : 1);
