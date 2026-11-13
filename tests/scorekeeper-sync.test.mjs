/* Scorekeeper sync harness — tap-to-UI and web<->web timings + offline /
   lost-reply / out-of-order scenarios, against an IN-PROCESS MOCK backend.

   Nothing leaves this machine: every request to *.supabase.co is answered by
   the mock below (auth user, is_tournament_scorer, live_tournament_snapshot,
   record_score_event with client_event_id idempotency) and the Realtime
   websocket is a tiny Phoenix-protocol fake that broadcasts `change` on the
   live:t:<id> topic after every accepted write — the same ping the real
   backend sends. All other third-party requests are aborted.

   Run:  node tests/scorekeeper-sync.test.mjs           (site = repo root)
         SITE_ROOT=/path/to/other/checkout node tests/scorekeeper-sync.test.mjs
         SHOTS=/dir  -> saves screenshots of each scenario
   Requires Google Chrome (playwright-core, channel 'chrome').
   Exit code 0 = all assertions passed. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(process.env.SITE_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = process.env.SHOTS || '';
const PFX = process.env.SHOT_PREFIX || '';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };

const T_ID = '11111111-1111-4111-8111-111111111111';
const M_ID = '22222222-2222-4222-8222-222222222222';
const A_ID = '33333333-3333-4333-8333-333333333333';
const B_ID = '44444444-4444-4444-8444-444444444444';
const USER = { id: '55555555-5555-4555-8555-555555555555', aud: 'authenticated', role: 'authenticated', email: 'scorer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

function serve() {
  return new Promise(res => {
    const srv = createServer(async (req, out) => {
      try {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
        const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
        if (!file.startsWith(ROOT)) throw new Error('traversal');
        const body = await readFile(file);
        out.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        out.end(body);
      } catch { out.writeHead(404); out.end('nf'); }
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Mock backend shared by every tab in a context. */
function makeBackend() {
  const be = {
    live: { score1: 0, score2: 0 },
    seen: new Map(),          // client_event_id -> reply
    calls: [],                // every record_score_event body received
    applied: 0,               // events that changed state
    plan: [],                 // per-call behaviour queue: {delayIn, delayOut, fail:'network'|'lost-reply'}
    defaultDelay: 0,
    sockets: new Set(),
    online: true,
    inFlight: 0,              // concurrent record_score_event requests right now
    maxInFlight: 0,
  };
  be.snapshot = () => ({
    tournament: { id: T_ID, name: 'QA Mock Cup', is_public: true },
    participants: [{ id: A_ID, name: 'Team Alpha', members: [] }, { id: B_ID, name: 'Team Bravo', members: [] }],
    matches: [{ id: M_ID, round: 1, court: 'Court 1', status: 'in_progress', participant1_id: A_ID, participant2_id: B_ID, live: { ...be.live } }],
  });
  be.broadcast = () => {
    for (const s of be.sockets) s.sendChange();
  };
  return be;
}

function fakeJwt() {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: 4102444800 }) + '.sig';
}

async function newContext(browser, be, projectRef) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const token = fakeJwt();
  await ctx.addInitScript(([key, session]) => {
    try { localStorage.setItem(key, session); } catch (_) {}
  }, [`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'mock-refresh', user: USER })]);

  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/auth/')) return json({}, 200);
    const rpc = url.pathname.replace('/rest/v1/rpc/', '');
    if (rpc === 'is_tournament_scorer') {
      if (!be.online) return route.abort('internetdisconnected');
      return json(true);
    }
    if (rpc === 'live_tournament_snapshot') {
      if (!be.online) return route.abort('internetdisconnected');
      return json(be.snapshot());
    }
    if (rpc === 'record_score_event') {
      const body = JSON.parse(route.request().postData() || '{}');
      const step = be.plan.shift() || {};
      be.calls.push({ ...body, at: Date.now() });
      be.inFlight++; be.maxInFlight = Math.max(be.maxInFlight, be.inFlight);
      try {
      if (!be.online || step.fail === 'network') { await sleep(step.delayIn || 5); return route.abort('internetdisconnected'); }
      if (step.fail === 'refuse') { await sleep(5); return json({ code: 'P0001', message: 'Match is already completed', details: null, hint: null }, 400); }
      if (step.fail === 'auth') { await sleep(5); return json({ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }, 401); }
      if (step.fail === 'server-bug') { await sleep(5); return json({ code: 'XX000', message: 'internal error', details: null, hint: null }, 500); }
      await sleep(step.delayIn ?? be.defaultDelay);
      let reply;
      const key = body.p_client_event_id;
      if (key && be.seen.has(key)) {
        reply = { ...be.seen.get(key), idempotent: true };
      } else {
        be.live = { score1: body.p_score1 ?? be.live.score1, score2: body.p_score2 ?? be.live.score2 };
        be.applied += 1;
        reply = { event_id: 'ev-' + be.applied, seq: be.applied, live: { ...be.live } };
        if (key) be.seen.set(key, reply);
        be.broadcast();
      }
      await sleep(step.delayOut ?? 0);
      if (step.fail === 'lost-reply') return route.abort('connectionreset');
      return json(reply);
      } finally { be.inFlight--; }
    }
    if (rpc === 'undo_last_score_event') return json({ live: { ...be.live } });
    return json(null);
  });

  // Fake Realtime (Phoenix). Handles both the v1 object and v2 array serializer.
  await ctx.routeWebSocket(/\.supabase\.co\/realtime\//, ws => {
    const topics = new Map(); // topic -> join_ref
    let arrayMode = /vsn=2/.test(ws.url());
    const send = (joinRef, ref, topic, event, payload) => ws.send(arrayMode
      ? JSON.stringify([joinRef, ref, topic, event, payload])
      : JSON.stringify({ topic, event, payload, ref, join_ref: joinRef }));
    const sock = {
      sendChange() {
        for (const [topic, joinRef] of topics) {
          if (!topic.startsWith('realtime:live:')) continue;
          send(joinRef, null, topic, 'broadcast', { type: 'broadcast', event: 'change', payload: {} });
        }
      },
    };
    be.sockets.add(sock);
    ws.onMessage(raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      let joinRef, ref, topic, event, payload;
      if (Array.isArray(m)) { arrayMode = true; [joinRef, ref, topic, event, payload] = m; }
      else ({ join_ref: joinRef, ref, topic, event, payload } = m);
      if (event === 'phx_join') { topics.set(topic, joinRef ?? ref); send(joinRef ?? ref, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: [] } }); }
      else if (event === 'phx_leave') { topics.delete(topic); send(joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }); }
      else if (ref != null) send(joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} });
    });
    ws.onClose(() => be.sockets.delete(sock));
  });
  return ctx;
}

async function openScorer(ctx, base) {
  const page = await ctx.newPage();
  await page.goto(`${base}/scorekeeper.html?t=${T_ID}`);
  await page.waitForSelector('[data-pick]', { timeout: 15000 });
  await page.click('[data-pick]');
  await page.waitForSelector('#score1');
  return page;
}

const scoreOf = async (page, n = 1) => parseInt(await page.textContent('#score' + n), 10);

/** Click +1 on side 1 from inside the page and time sync DOM update + next paint. */
async function timedTap(page, side = 1) {
  return page.evaluate(side => new Promise(res => {
    const el = document.getElementById('score' + side);
    const before = el.textContent;
    const t0 = performance.now();
    document.querySelector('[data-plus="' + side + '"]').click();
    const tSync = performance.now();
    const changedSync = document.getElementById('score' + side).textContent !== before;
    requestAnimationFrame(() => requestAnimationFrame(() => res({ syncMs: tSync - t0, paintMs: performance.now() - t0, changedSync, wallAt: Date.now() })));
  }), side);
}

async function waitScore(page, n, want, timeout = 8000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    try { if (await scoreOf(page, n) === want) return Date.now(); } catch (_) {}
    await sleep(5);
  }
  return null;
}

const results = { site: ROOT, scenarios: {} };
let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const coreSrc = await readFile(join(ROOT, 'assets/live-core.js'), 'utf8');
const projectRef = (coreSrc.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

try {
  // 1. tap -> local UI, and web -> web (second tab) via mock realtime ping.
  for (const rtt of [0, 150]) {
    const be = makeBackend(); be.defaultDelay = rtt / 2;
    const ctxA = await newContext(browser, be, projectRef);
    const ctxB = await newContext(browser, be, projectRef);
    const a = await openScorer(ctxA, base);
    const b = await openScorer(ctxB, base);
    await sleep(800);
    const local = [], remote = [];
    for (let i = 1; i <= 6; i++) {
      const t = await timedTap(a, 1);
      local.push(t);
      const seen = await waitScore(b, 1, i);
      remote.push(seen ? seen - t.wallAt : null);
      await sleep(400);
    }
    results.scenarios['latency_rtt' + rtt] = {
      tapToLocalSyncMs: local.map(x => +x.syncMs.toFixed(2)),
      tapToLocalPaintMs: local.map(x => +x.paintMs.toFixed(1)),
      tapToOtherTabMs: remote,
      medianOtherTabMs: median(remote.filter(x => x != null)),
    };
    check(`rtt${rtt}: tap updates local score synchronously`, local.every(x => x.changedSync));
    check(`rtt${rtt}: other tab received all 6 taps`, remote.every(x => x != null), JSON.stringify(remote));
    if (SHOTS && rtt === 0) { await a.screenshot({ path: `${SHOTS}/${PFX}web-tabA-scorer.png` }); await b.screenshot({ path: `${SHOTS}/${PFX}web-tabB-viewer.png` }); }
    await ctxA.close(); await ctxB.close();
  }

  // 2. Offline: 3 taps while the network is down, then it comes back.
  {
    const be = makeBackend();
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    be.online = false;
    for (let i = 0; i < 3; i++) { await timedTap(p, 1); await sleep(150); }
    await sleep(600);
    const uiWhileOffline = await scoreOf(p, 1);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${PFX}web-offline-3-taps.png` });
    be.online = true;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await sleep(3000);
    const uiAfter = await scoreOf(p, 1);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${PFX}web-offline-recovered.png` });
    results.scenarios.offline = { uiWhileOffline, uiAfterReconnect: uiAfter, serverScore1: be.live.score1, calls: be.calls.length };
    check('offline: UI keeps the 3 taps while offline', uiWhileOffline === 3, `ui=${uiWhileOffline}`);
    check('offline: all 3 points reach the server after reconnect', be.live.score1 === 3, `server=${be.live.score1}`);
    check('offline: UI matches server after reconnect', uiAfter === be.live.score1, `ui=${uiAfter} server=${be.live.score1}`);
    await ctx.close();
  }

  // 3. Lost reply: server applies the point but the response never arrives.
  {
    const be = makeBackend();
    be.plan.push({ fail: 'lost-reply' });
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    await timedTap(p, 1);
    await sleep(3000);
    const ui = await scoreOf(p, 1);
    const keys = be.calls.map(c => c.p_client_event_id);
    results.scenarios.lostReply = { serverApplied: be.applied, serverScore1: be.live.score1, ui, calls: be.calls.length, sameKeyRetried: keys.length > 1 && keys.every(k => k && k === keys[0]) };
    check('lost reply: point counted exactly once', be.applied === 1 && be.live.score1 === 1, `applied=${be.applied}`);
    check('lost reply: UI shows 1', ui === 1, `ui=${ui}`);
    check('lost reply: retried with the same client_event_id', results.scenarios.lostReply.sameKeyRetried, JSON.stringify(keys));
    await ctx.close();
  }

  // 4. Out of order: tap 1's request is slow, tap 2's is fast.
  {
    const be = makeBackend();
    be.plan.push({ delayIn: 600 }, { delayIn: 20 });
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    await timedTap(p, 1); await sleep(30); await timedTap(p, 1);
    await sleep(2500);
    const ui = await scoreOf(p, 1);
    results.scenarios.outOfOrder = { serverScore1: be.live.score1, ui, arrivalOrder: be.calls.map(c => c.p_score1), maxConcurrentWrites: be.maxInFlight };
    check('out of order: never more than one write in flight', be.maxInFlight === 1, `max=${be.maxInFlight}`);
    check('out of order: writes arrive in tap order', JSON.stringify(be.calls.map(c => c.p_score1)) === '[1,2]', JSON.stringify(be.calls.map(c => c.p_score1)));
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${PFX}web-out-of-order.png` });
    check('out of order: server ends at 2', be.live.score1 === 2, `server=${be.live.score1}`);
    check('out of order: UI ends at 2', ui === 2, `ui=${ui}`);
    await ctx.close();
  }

  // 5. Reload while offline: queued taps survive the reload and are sent after.
  {
    const be = makeBackend();
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    be.online = false;
    await timedTap(p, 1); await sleep(100); await timedTap(p, 2);
    await sleep(300);
    await p.reload();
    await sleep(800);
    const stored = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('pc_sk_outbox_v1') || '[]').length; } catch (_) { return -1; } });
    be.online = true;                 // no 'online' event: recovery must come from the backoff timers alone
    await sleep(9000);
    results.scenarios.reloadOffline = { queuedAfterReload: stored, serverLive: { ...be.live }, applied: be.applied };
    check('reload: queued taps persisted across reload', stored === 2, `stored=${stored}`);
    check('reload: both taps reach the server after reconnect (backoff only)', be.live.score1 === 1 && be.live.score2 === 1, JSON.stringify(be.live));
    check('reload: board shows the match again', (await scoreOf(p, 1).catch(() => null)) !== null || (await p.$('[data-pick]')) !== null);
    await ctx.close();
  }

  // 6. Permanent refusal: dropped (not retried forever) and the UI resyncs.
  {
    const be = makeBackend();
    be.plan.push({ fail: 'refuse' });
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    await timedTap(p, 1);
    await sleep(2500);
    const ui = await scoreOf(p, 1);
    const errText = (await p.textContent('#skErr').catch(() => '')) || '';
    results.scenarios.refusal = { calls: be.calls.length, ui, server: be.live.score1, errText };
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/${PFX}web-refused.png` });
    check('refusal: not retried', be.calls.length === 1, `calls=${be.calls.length}`);
    check('refusal: UI rolls back to server', ui === be.live.score1, `ui=${ui} server=${be.live.score1}`);
    check('refusal: error shown', errText.length > 0, errText);
    await ctx.close();
  }

  // 7. Expired sign-in: the change is kept (not dropped) and sent once auth works.
  {
    const be = makeBackend();
    be.plan.push({ fail: 'auth' });
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    await timedTap(p, 1);
    await sleep(200);
    const syncText = (await p.textContent('#skSync').catch(() => '')) || '';
    await sleep(2500);
    results.scenarios.authExpired = { calls: be.calls.length, server: be.live.score1, syncText };
    check('auth expired: change kept and sent after auth recovers', be.live.score1 === 1, `server=${be.live.score1} calls=${be.calls.length}`);
    check('auth expired: scorer told to sign in', /sign/i.test(syncText), syncText);
    await ctx.close();
  }

  // 8. Undo of a change that never left the device is local only.
  {
    const be = makeBackend();
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    be.online = false;
    await timedTap(p, 1);             // attempted (fails) -> stays queued
    await sleep(100);
    await timedTap(p, 1);             // queued behind it, never attempted
    await p.click('#undoBtn');
    const uiAfterUndo = await scoreOf(p, 1);
    be.online = true;
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await sleep(2500);
    results.scenarios.localUndo = { uiAfterUndo, server: be.live.score1, calls: be.calls.map(c => c.p_score1) };
    check('local undo: UI goes back one point at once', uiAfterUndo === 1, `ui=${uiAfterUndo}`);
    check('local undo: the undone point never reaches the server', be.live.score1 === 1 && !be.calls.some(c => c.p_score1 === 2), JSON.stringify(results.scenarios.localUndo));
    await ctx.close();
  }

  // 9. A repeating server error (5xx with a SQLSTATE) gives up instead of blocking the queue forever.
  {
    const be = makeBackend();
    for (let i = 0; i < 5; i++) be.plan.push({ fail: 'server-bug' });
    const ctx = await newContext(browser, be, projectRef);
    const p = await openScorer(ctx, base);
    await sleep(500);
    await timedTap(p, 1);             // will fail 5 times, then be dropped
    await sleep(50);
    await timedTap(p, 2);             // must still get through afterwards
    await sleep(500 + 1000 + 2000 + 4000 + 2500);
    results.scenarios.serverBug = { calls: be.calls.length, live: { ...be.live } };
    check('server bug: queue unblocks after 5 tries', be.live.score2 === 1, JSON.stringify(results.scenarios.serverBug));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}

console.log('RESULTS ' + JSON.stringify(results, null, 1));
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
