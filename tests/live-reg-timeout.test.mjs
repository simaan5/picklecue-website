// node tests/live-reg-timeout.test.mjs
// s28 review P3 on PR #59: refetch() awaits registration_status (the
// "you're registered" chip) before it paints. A reply that never comes
// (stalled mobile connection) used to hold the paint back forever:
// case 1 the first load sat on "Loading…"; case 2 a later score ping
// never showed the new score. After: the chip RPC gets 5 s, then the
// scores paint without it. Local only: *.supabase.co and realtime mocked.
// Optional: PC_SHOT / PC_SHOT2=/path.png screenshots of each state.
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
const REG = { waitlisted: { status: 'waitlisted', display_name: 'Sam Rivera', waitlist_position: 3 },
              registered: { status: 'registered', display_name: 'Sam Rivera' } };
let reg = REG.waitlisted; const regDelays = [];
const snap = s1 => ({ tournament: { id: T_ID, name: 'Harbor Fall Classic', is_public: true, status: 'in_progress', format: 'round_robin' },
  participants: [{ id: 'p1', name: 'Rivera / Chen', members: [] }, { id: 'p2', name: 'Okafor / Lindqvist', members: [] }],
  matches: [{ id: 'm1', round: 1, match_number: 1, court: 'Court 1', status: 'in_progress', participant1_id: 'p1', participant2_id: 'p2', live: { score1: s1, score2: 3, game: 1 } }] });

let browser, first = null, firstMs = null, later = null, laterMs = null, err = null;
const HANG = new Promise(() => {});
// PC_CASE2_ONLY=1: first load answers normally, only the later ping's chip RPC hangs.
const CASE2_ONLY = process.env.PC_CASE2_ONLY === '1';
let hangReg = !CASE2_ONLY;
const banner = async (page, ok, text, path) => {
  if (!path) return;
  await page.evaluate(([ok, t]) => {
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:10px 12px;font:600 13px/1.35 system-ui;color:#fff;background:' + (ok ? '#167a3e' : '#b3261e');
    b.textContent = (ok ? 'OK: ' : 'BUG: ') + t; document.body.appendChild(b);
  }, [ok, text]);
  await page.screenshot({ path }); await page.evaluate(() => document.body.lastElementChild.remove());
};
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 600 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('pc_consent', 'denied'); localStorage.setItem('pc_reg_' + id, 'r1'); } catch (_) {} }, T_ID);
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === BASE) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.pathname.includes('live_tournament_snapshot')) { const s = score1; await sleep(40); return json(snap(s)); }
    if (url.pathname.endsWith('/registration_status')) { if (hangReg) await HANG; return json(reg); }
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
  const pts = () => page.evaluate(() => document.querySelector('.match-card.live-now .pts')?.textContent ?? null);
  // Case 1: first load, registration_status never answers.
  const t0 = Date.now();
  await page.goto(`${BASE}/live.html?t=${T_ID}`);
  while (Date.now() - t0 < 8000 && (first = await pts()) === null) await sleep(50);
  firstMs = first === null ? null : Date.now() - t0;
  await banner(page, first === '4', first === null ? 'registration_status never replied; after 8 s the page still shows Loading\u2026' : `registration_status never replied; scores painted after ${firstMs} ms`, process.env.PC_SHOT);
  if (first !== null) {
    // Case 2: a later score ping whose registration_status also hangs.
    await sleep(1200);
    hangReg = true; score1 = 7;
    const t1 = Date.now();
    wsSend(joinRef, null, 'realtime:live:t:' + T_ID, 'broadcast', { type: 'broadcast', event: 'change', payload: { table: 'score_events' } });
    while (Date.now() - t1 < 8000 && (later = await pts()) !== '7') await sleep(50);
    laterMs = later === '7' ? Date.now() - t1 : null;
    await banner(page, later === '7', later === '7' ? `server score 7 painted ${laterMs} ms after the ping (chip RPC hung)` : `server score 7; page still shows ${later} 8 s after the ping (chip RPC hung)`, process.env.PC_SHOT2);
  }
} catch (e) { err = e; }
await browser?.close(); srv.close();
if (err) { console.error('FAIL ', err); process.exit(1); }
const ok1 = first === '4' && (CASE2_ONLY || firstMs < 7000);
const ok2 = later === '7' && laterMs < 7000;
console.log((ok1 ? 'ok   ' : 'FAIL ') + `first load with a hung registration_status paints scores: ${first === null ? 'never (8 s)' : firstMs + ' ms'}`);
console.log((ok2 ? 'ok   ' : 'FAIL ') + `score ping with a hung registration_status paints the new score: ${laterMs == null ? 'never (8 s)' : laterMs + ' ms'}`);
process.exit(ok1 && ok2 ? 0 : 1);
