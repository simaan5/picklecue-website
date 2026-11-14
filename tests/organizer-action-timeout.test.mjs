// node tests/organizer-action-timeout.test.mjs
// s28 review P3s on PR #70 (organizer control room):
//  1. Start/Update/Complete/Correct for one match had separate in-flight
//     keys, so Update then Complete sent two writes for the same match at
//     once (they could land in either order). Now one write per match.
//  2. A request that never replies left its button disabled until a page
//     reload. Now after 15 s the buttons come back, the bar says so, and the
//     page re-reads the server.
//  3. (review P2) Time spent in the Complete confirm() dialog doesn't count:
//     a 16 s think before OK must not show 'No reply' while the write is fine.
// Local only: *.supabase.co and the realtime socket are mocked.
// Optional SHOTS=<dir> TAG=<before|after> for screenshots.
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
const SHOTS = process.env.SHOTS; // optional dir for evidence screenshots
const TAG = process.env.TAG || 'run';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

const T_ID = '7a1c2e90-5b3d-4f6a-9c8e-1d2f3a4b5c6d';
const USER = { id: '55555555-5555-4555-8555-555555555555', aud: 'authenticated', role: 'authenticated', email: 'org@example.test' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER.id, role: 'authenticated', exp: 4102444800 }) + '.sig';
const P = (id, name) => ({ id, name, members: [] });
const parts = [P('p1', 'Rivera / Chen'), P('p2', 'Okafor / Lindqvist'), P('p3', 'Patel / Moreno'), P('p4', 'Nguyen / Brooks')];
const be = { a: 4, b: 2, delays: [], rpcs: [], rpcDelay: 30, snapFail: 0 };
const snapshot = (a, b) => ({
  tournament: { id: T_ID, name: 'Harbor Fall Classic', is_public: true, status: 'in_progress', format: 'round_robin' },
  participants: parts,
  matches: [
    { id: 'm1', round: 1, match_number: 1, court: 'Court 1', status: 'in_progress', participant1_id: 'p1', participant2_id: 'p2', live: { score1: a, score2: 3, game: 1 } },
    { id: 'm2', round: 1, match_number: 2, court: 'Court 2', status: 'in_progress', participant1_id: 'p3', participant2_id: 'p4', live: { score1: b, score2: 1, game: 1 } },
  ],
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('pc_consent', 'denied'); },
  ['sb-uejmhtdfbqbotvbqvfja-auth-token', JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: USER })]);
await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === BASE) return route.continue();
  if (!url.hostname.endsWith('.supabase.co')) return route.abort();
  const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.pathname === '/auth/v1/user') return json(USER);
  if (url.pathname.startsWith('/auth/')) return json({});
  if (url.pathname === '/rest/v1/tournaments') return json([{ id: T_ID, name: 'Harbor Fall Classic', status: 'in_progress', start_date: '2026-11-14', is_public: true }]);
  if (url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/')) return json(url.searchParams.get('select') && route.request().headers()['accept']?.includes('vnd.pgrst.object') ? null : []);
  if (url.pathname.endsWith('/live_tournament_snapshot') && be.snapFail > 0) {
    be.snapFail--; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'mock outage', code: 'XX000' }) });
  }
  if (url.pathname.endsWith('/live_tournament_snapshot')) { const a = be.a, b = be.b; await sleep(be.delays.shift() ?? 30); return json(snapshot(a, b)); }
  if (url.pathname.endsWith('/is_pro_subscriber')) return json(true);
  if (url.pathname.endsWith('/record_score_event')) {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    be.rpcs.push({ ...body, t: Date.now() }); if (be.hang) await new Promise(() => {}); await sleep(be.rpcDelay); return json({ ok: true });
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
const ping = () => wsSend(joinRef, null, 'realtime:live:t:' + T_ID, 'broadcast', { type: 'broadcast', event: 'change', payload: { table: 'score_events' } });

const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/organizer.html`);
await page.waitForSelector('[data-open]', { timeout: 15000 });
await page.click('[data-open]');
await page.waitForSelector('#s1-m1');
await sleep(1200);


const banner = async (ok, text, name) => {
  if (!SHOTS) return;
  await page.evaluate(([ok, t]) => { const b = document.createElement('div'); b.id = 'pcBanner';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:10px 14px;font:600 14px/1.35 system-ui;color:#fff;background:' + (ok ? '#167a3e' : '#b3261e');
    b.textContent = (ok ? 'OK: ' : 'BUG: ') + t; document.body.appendChild(b); }, [ok, text]);
  await page.screenshot({ path: `${SHOTS}/${TAG}-${name}.png` });
  await page.evaluate(() => document.getElementById('pcBanner')?.remove());
};
let dialogWait = 0;
page.on('dialog', async d => { if (dialogWait) await sleep(dialogWait); d.accept(); });

// 1. Update (slow reply) then Complete right away on the same match.
await page.fill('#s1-m1', '11'); await page.fill('#s2-m1', '7');
be.rpcs.length = 0; be.rpcDelay = 1500;
await page.click('[data-save="m1"]');
await sleep(150);
const completeDisabled = await page.evaluate(() => document.querySelector('[data-complete="m1"]').disabled);
await page.click('[data-complete="m1"]', { force: true, timeout: 2000 }).catch(() => {});
await sleep(300);
const overlap = be.rpcs.length;
await banner(overlap === 1, `clicked Update (reply takes 1.5 s), then Complete on the same match: ${overlap} score write(s) on the wire at once`, '1-update-then-complete');
check(overlap === 1, `Update then Complete on one match: ${overlap} write(s) in flight at once (want 1)`);
check(completeDisabled, `Complete is disabled while Update is in flight (${completeDisabled})`);
await sleep(2500); be.rpcDelay = 30;

// 2. A write that never replies.
await page.waitForSelector('[data-save="m2"]');
await page.fill('#s1-m2', '5');
be.hang = true; be.rpcs.length = 0;
const t0 = Date.now();
await page.click('[data-save="m2"]');
let back = null;
while (Date.now() - t0 < 18000) {
  const dis = await page.evaluate(() => { const b = document.querySelector('[data-save="m2"]'); return b ? b.disabled : true; });
  if (!dis) { back = Date.now() - t0; break; }
  await sleep(100);
}
be.hang = false;
const msg = await page.evaluate(() => (document.getElementById('barMsg') || {}).textContent || '');
await banner(back !== null, back !== null ? `Update got no reply; buttons came back after ${back} ms. Bar: "${msg}"` : 'Update got no reply; 18 s later the Update/Complete buttons are still disabled (reload needed)', '2-no-reply');
check(back !== null && back >= 14500, `a write with no reply re-enables its buttons after ~15 s (${back === null ? 'still disabled at 18 s' : back + ' ms'})`);
check(/No reply/.test(msg), `the bar explains it (${JSON.stringify(msg)})`);

// 3. organizer waits 16 s in the Complete confirm, then the write replies in 30 ms
await sleep(1000);
await page.waitForSelector('[data-complete="m2"]');
await page.evaluate(() => { const m = document.getElementById('barMsg'); if (m) m.textContent = ''; });
await page.fill('#s1-m2', '11'); await page.fill('#s2-m2', '6');
be.rpcDelay = 30; dialogWait = 16000; be.rpcs.length = 0;
await page.click('[data-complete="m2"]');
await sleep(1500); dialogWait = 0;
const msg3 = await page.evaluate(() => (document.getElementById('barMsg') || {}).textContent || '');
await banner(!/No reply/.test(msg3) && be.rpcs.length === 1, `16 s in the Complete confirm dialog, write replied in 30 ms. Bar: "${msg3}"; writes sent: ${be.rpcs.length}`, '3-slow-confirm');
check(!/No reply/.test(msg3), `16 s in the confirm dialog is not counted as a missing reply (bar: ${JSON.stringify(msg3)})`);
check(be.rpcs.length === 1, `one write sent (${be.rpcs.length})`);

await browser.close(); srv.close();
process.exit(failures ? 1 : 0);
