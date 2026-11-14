// node tests/organizer-live-edits.test.mjs
// Organizer control room (s27): a live re-render (another match scores) must
// not wipe a score the organizer is typing, nor their waiver text, nor their
// focus; and an older, slower snapshot reply must not paint over a newer one.
// s28: the same holds for the match panel opened from the bracket view, and a
// re-render during an in-flight Update/Complete keeps that button disabled
// (one RPC per click, on both the Bracket panel and the Matches tab).
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
const be = { a: 4, b: 2, delays: [], rpcs: [], rpcDelay: 30 };
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
  if (url.pathname.endsWith('/live_tournament_snapshot')) { const a = be.a, b = be.b; await sleep(be.delays.shift() ?? 30); return json(snapshot(a, b)); }
  if (url.pathname.endsWith('/is_pro_subscriber')) return json(true);
  if (url.pathname.endsWith('/record_score_event')) {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    be.rpcs.push(body); await sleep(be.rpcDelay); return json({ ok: true });
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

// 1. organizer types a final score for match 1, another match scores meanwhile
await page.fill('#s1-m1', '11');
await page.click('#s2-m1');
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('7');
be.b = 3; ping();                    // Court 2 scores: live re-render
await sleep(900);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/${TAG}-1-typing-11-7-after-court2-scores.png`, clip: { x: 0, y: 0, width: 1100, height: 900 } });
const typed = await page.evaluate(() => [document.getElementById('s1-m1').value, document.getElementById('s2-m1').value, document.activeElement && document.activeElement.id]);
check(typed[0] === '11' && typed[1] === '7', `typed score survives a live re-render (shows ${typed[0]}–${typed[1]})`);
check(typed[2] === 's2-m1', `focus stays in the field being typed (${typed[2]})`);
const court2 = await page.evaluate(() => document.body.textContent.includes('live 3–1'));
check(court2, 'the other match still updated (Court 2 live 3–1)');

// 2. overlapping refetches: slow reply for an older score lands last
be.a = 5; be.delays.push(900); ping();
await sleep(400);
be.a = 6; be.delays.push(50); ping();
await sleep(1500);
const shown = await page.evaluate(() => (document.body.textContent.match(/live (\d+)–3/) || [])[1]);
check(shown === '6', `older snapshot doesn't paint over newer (Court 1 shows ${shown}, server 6)`);

// 3. bracket view (s28): the match panel opened from the bracket must stay
// open across a live re-render and keep the score being typed + focus.
await page.click('[data-etab="bracket"]');
await page.waitForSelector('[data-bv-match="m2"]');
await page.click('[data-bv-match="m2"]');
await page.waitForSelector('#bvPanel #s1-m2');
await page.fill('#s1-m2', '9');
await page.click('#s2-m2');
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('4');
be.a = 7; ping();                    // Court 1 scores: live re-render of the bracket tab
await sleep(900);
if (SHOTS) {
  await page.evaluate(() => {
    const p = document.getElementById('bvPanel');
    const s1 = document.getElementById('s1-m2'), s2 = document.getElementById('s2-m2');
    const ok = !!(s1 && s2 && s1.value === '9' && s2.value === '4');
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:10px 14px;font:600 14px/1.35 system-ui;color:#fff;background:' + (ok ? '#167a3e' : '#b3261e');
    b.textContent = (ok ? 'OK: ' : 'BUG: ') + 'typed 9\u20134 in the bracket match panel (Court 2), then Court 1 scored (live re-render). Panel ' +
      (p && p.innerHTML ? 'open, shows ' + (s1 ? s1.value : '?') + '\u2013' + (s2 ? s2.value : '?') : 'gone (typed score lost)') + '.';
    document.body.appendChild(b);
  });
  await page.screenshot({ path: `${SHOTS}/${TAG}-2-bracket-panel-typing-9-4-after-court1-scores.png`, clip: { x: 0, y: 0, width: 1100, height: 900 } });
}
const bv = await page.evaluate(() => {
  const s1 = document.getElementById('s1-m2'), s2 = document.getElementById('s2-m2');
  return { open: !!(s1 && s2), v: s1 && s2 ? s1.value + '\u2013' + s2.value : null, focus: document.activeElement && document.activeElement.id };
});
check(bv.open, `bracket match panel stays open across a live re-render (${bv.open ? 'open' : 'gone'})`);
check(bv.v === '9\u20134', `typed score in the bracket panel survives (shows ${bv.v})`);
check(bv.focus === 's2-m2', `focus stays in the bracket panel field (${bv.focus})`);

// 4. actions in the reopened bracket panel (s28 review)
page.on('dialog', d => d.accept());   // accept every confirm(), so a double click would really send twice
const sent = type => be.rpcs.filter(r => r.p_event_type === type && r.p_match_id === 'm2');
// 4a. Update in the panel after a live re-render sends exactly one RPC with the typed score
await page.click('#bvPanel [data-save="m2"]');
await sleep(700);
const upd = sent('point_added');
check(upd.length === 1 && upd[0].p_score1 === 9 && upd[0].p_score2 === 4,
  `Update in the reopened bracket panel sends one RPC with 9–4 (sent ${upd.length}: ${upd.map(r => r.p_score1 + '–' + r.p_score2).join(', ')})`);
// 4b. Complete is slow; a live re-render while it is in flight must keep it disabled
await page.fill('#s1-m2', '11'); await page.fill('#s2-m2', '4');
be.rpcDelay = 2000;
await page.click('#bvPanel [data-complete="m2"]');
await sleep(200);
be.a = 8; ping();                    // live re-render mid-request
await sleep(700);
const midFlight = await page.evaluate(() => { const b = document.querySelector('#bvPanel [data-complete="m2"]'); if (!b) return 'gone'; const d = b.disabled; b.click(); return d; });
if (SHOTS) {
  await page.evaluate(d => {
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:10px 14px;font:600 14px/1.35 system-ui;color:#fff;background:' + (d === true ? '#167a3e' : '#b3261e');
    b.textContent = (d === true ? 'OK: ' : 'BUG: ') + 'Complete (11\u20134) in flight, then a live re-render reopened the panel. Complete button is ' + (d === true ? 'disabled' : 'ENABLED (a second Complete can be sent)') + '.';
    document.body.appendChild(b);
  }, midFlight);
  await page.screenshot({ path: `${SHOTS}/${TAG}-3-bracket-complete-in-flight-after-live-update.png`, clip: { x: 0, y: 0, width: 1100, height: 900 } });
  await page.evaluate(() => document.body.lastElementChild.remove());
}
await sleep(3000);                   // first (and any second) Complete has settled
be.rpcDelay = 30;
check(midFlight === true, `bracket panel Complete stays disabled while in flight across a live re-render (${midFlight})`);
check(sent('match_completed').length === 1, `one Complete RPC sent from the bracket panel (sent ${sent('match_completed').length})`);
const after4 = await page.evaluate(() => { const b = document.querySelector('#bvPanel [data-complete="m2"]'); return b ? b.disabled : 'gone'; });
check(after4 === false, `bracket panel Complete is enabled again after the request settles (${after4 === false ? 'enabled' : after4})`);

// 5. same on the Matches tab
await page.click('[data-etab="matches"]');
await page.waitForSelector('#s1-m1');
await page.fill('#s1-m1', '11'); await page.fill('#s2-m1', '9');
const sent1 = () => be.rpcs.filter(r => r.p_event_type === 'match_completed' && r.p_match_id === 'm1').length;
be.rpcDelay = 2000;
await page.click('[data-complete="m1"]');
await sleep(200);
be.b = 4; ping();
await sleep(700);
const mt = await page.evaluate(() => { const b = document.querySelector('[data-complete="m1"]'); if (!b) return 'gone'; const d = b.disabled; b.click(); return d; });
await sleep(3000);
be.rpcDelay = 30;
check(mt === true, `Matches tab Complete stays disabled while in flight across a live re-render (${mt})`);
check(sent1() === 1, `one Complete RPC sent from the Matches tab (sent ${sent1()})`);

await browser.close(); srv.close();
console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
