// node tests/checkin-instant.test.mjs
// The check-in desk paints a tap at once and saves in the background (s27).
// Local only: every *.supabase.co call is answered by an in-process mock
// with LAT ms per request; nothing else leaves the machine.
//  1. tap "Check in" -> row shows READY in < 100 ms while the save takes 300 ms
//  2. a refused save rolls the row back and shows the server's message
//  3. quick check-in / undo / check-in taps (500 ms apart) with jittery latency: the server
//     and the screen both end on the last tap
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
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

const T_ID = '7a1c2e90-5b3d-4f6a-9c8e-1d2f3a4b5c6d';
const teams = ['Rivera / Chen', 'Okafor / Lindqvist', 'Patel / Moreno', 'Nguyen / Brooks', 'Haddad / Kowalski', 'Silva / Thompson']
  .map((n, i) => ({ id: 'a0000000-0000-4000-8000-00000000000' + (i + 1), name: n, seed: i + 1, members: [] }));
const be = { st: {}, failNext: false, latency: () => 300 };
teams.forEach((t, i) => { be.st[t.id] = i < 2 ? 'checked_in' : 'not_checked_in'; });
const USER = { id: '55555555-5555-4555-8555-555555555555', aud: 'authenticated', role: 'authenticated', email: 'desk@example.test' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER.id, role: 'authenticated', exp: 4102444800 }) + '.sig';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('pc_consent', 'denied'); },
  ['sb-uejmhtdfbqbotvbqvfja-auth-token', JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: USER })]);
await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === BASE) return route.continue();
  if (!url.hostname.endsWith('.supabase.co')) return route.abort();
  const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.pathname === '/auth/v1/user') return json(USER);
  if (url.pathname.startsWith('/auth/')) return json({});
  const rpc = url.pathname.replace('/rest/v1/rpc/', '');
  const seen = { ...be.st };
  await sleep(be.latency());
  if (rpc === 'is_tournament_scorer') return json(true);
  if (rpc === 'live_tournament_snapshot') return json({ tournament: { id: T_ID, name: 'Harbor Fall Classic', is_public: true, status: 'in_progress' }, participants: teams, matches: [] });
  if (rpc === 'event_readiness') return json(teams.map(t => ({ id: t.id, check_in_status: seen[t.id], waiver_status: 'signed' })));
  if (rpc === 'set_check_in_status') {
    const body = JSON.parse(route.request().postData());
    if (be.failNext) { be.failNext = false; return json({ code: 'P0001', message: 'Check-in is closed for this event.' }, 400); }
    be.st[body.p_participant_id] = body.p_status;
  }
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
const dialogs = [];
page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
await page.goto(`${BASE}/checkin.html?t=${T_ID}`);
await page.waitForSelector('[data-ci]');
await sleep(1000);

const rowState = pid => page.evaluate(pid => {
  const r = [...document.querySelectorAll('.event-row')].find(r => r.querySelector(`[data-ci^="${pid}:"]`));
  return r && /READY/.test(r.textContent) ? 'checked_in' : 'not_checked_in';
}, pid);

// 1. instant paint
const ms = await page.evaluate(sel => new Promise(res => {
  const t0 = performance.now();
  const mo = new MutationObserver(() => {
    const r = [...document.querySelectorAll('.event-row')].find(r => r.querySelector('[data-ci^="' + sel.split(':')[0].slice(10) + ':"]'));
    if (r && /READY/.test(r.textContent)) { mo.disconnect(); res(performance.now() - t0); }
  });
  mo.observe(document.getElementById('main'), { childList: true, subtree: true });
  document.querySelector(sel).click();
  setTimeout(() => res(99999), 5000);
}), `[data-ci="${teams[2].id}:checked_in"]`);
check(ms < 100, `tap -> READY in ${Math.round(ms)} ms (save takes 300 ms)`);
await sleep(1500);
check(be.st[teams[2].id] === 'checked_in', 'server saved the check-in');

// 2. refused save rolls back
be.failNext = true;
await page.click(`[data-ci="${teams[3].id}:checked_in"]`);
check(await rowState(teams[3].id) === 'checked_in', 'refused tap still paints at once');
await sleep(1500);
check(await rowState(teams[3].id) === 'not_checked_in', 'refused save rolled the row back');
check(dialogs.includes('Check-in is closed for this event.'), 'server message shown');

// 2b. a fast double tap on "Check in" checks in ONE player, not the next row too
be.latency = () => 300;
const doubleTarget = teams.find(t => be.st[t.id] === 'not_checked_in' && t.id !== teams[3].id);
const others = teams.filter(t => t.id !== doubleTarget.id && be.st[t.id] === 'not_checked_in').map(t => t.id);
await page.dblclick(`[data-ci="${doubleTarget.id}:checked_in"]`, { delay: 120 });
await sleep(1500);
check(be.st[doubleTarget.id] === 'checked_in', 'double tap: the tapped player is checked in');
check(others.every(id => be.st[id] === 'not_checked_in'), 'double tap: no other player was checked in');

// 3. rapid toggles, jittery latency
be.latency = () => 30 + Math.random() * 500;
let bad = 0;
for (let k = 0; k < 6; k++) {
  const pid = teams[2 + (k % 4)].id;
  const first = be.st[pid] === 'checked_in' ? 'not_checked_in' : 'checked_in';
  for (const st of [first, first === 'checked_in' ? 'not_checked_in' : 'checked_in', first]) {
    await page.waitForSelector(`[data-ci="${pid}:${st}"]`, { timeout: 3000 }).catch(() => {});
    await page.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, `[data-ci="${pid}:${st}"]`);
    await sleep(500);
  }
  await sleep(2200);
  if (be.st[pid] !== first || await rowState(pid) !== first) bad++;
}
check(bad === 0, `rapid toggles: server and screen end on the last tap (${6 - bad}/6)`);

await browser.close(); srv.close();
console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
