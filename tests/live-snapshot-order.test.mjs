// node tests/live-snapshot-order.test.mjs
// Two overlapping refetches on live.html: the slow one (older score) must not
// overwrite the fast one (newer score) when it lands last (s27 sweep).
// Local only: *.supabase.co and the realtime socket are mocked.
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
let score1 = 4; const delays = [];
const snap = s1 => ({ tournament: { id: T_ID, name: 'Harbor Fall Classic', is_public: true, status: 'in_progress', format: 'round_robin' },
  participants: [{ id: 'p1', name: 'Rivera / Chen', members: [] }, { id: 'p2', name: 'Okafor / Lindqvist', members: [] }],
  matches: [{ id: 'm1', round: 1, match_number: 1, court: 'Court 1', status: 'in_progress', participant1_id: 'p1', participant2_id: 'p2', live: { score1: s1, score2: 3, game: 1 } }] });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 600 } });
await ctx.addInitScript(() => { try { localStorage.setItem('pc_consent', 'denied'); } catch (_) {} });
await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === BASE) return route.continue();
  if (!url.hostname.endsWith('.supabase.co')) return route.abort();
  const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.pathname.includes('live_tournament_snapshot')) { const s = score1; await sleep(delays.shift() ?? 50); return json(snap(s)); }
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
score1 = 5; delays.push(900); ping();   // point 1: its refetch is slow
await sleep(400);
score1 = 6; delays.push(100); ping();   // point 2: its refetch is fast
await sleep(1600);
const shown = await page.evaluate(() => document.querySelector('.match-card.live-now .pts').textContent);
await browser.close(); srv.close();
const ok = shown === '6';
console.log((ok ? 'ok   ' : 'FAIL ') + `score after two overlapping refetches shows ${shown} (server 6)`);
process.exit(ok ? 0 : 1);
