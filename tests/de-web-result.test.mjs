// node tests/de-web-result.test.mjs
// Double-elimination results from the web (s38). The scorekeeper and organizer
// pages finish a match with PCLive.recordScoreEvent('match_completed'). On a
// double-elimination bracket that RPC only advanced the winner, so the loser
// never dropped to the losers' bracket. live-core.js must send DE results to
// record_tournament_match_result_v2 (p_source 'web'), which moves both.
// Local only: every *.supabase.co call is answered by an in-process mock.
//  1. scorekeeper "Submit final" on a DE match -> v2 (winner = seat 1, '11-7', web); no match_completed event
//  2. single elimination still goes through record_score_event('match_completed')
//  3. no cached snapshot + server answers DE_RESULT_RPC -> looks up the seats and retries through v2
//  4. server without the migration (v2 refuses 'web') -> a plain message, no raw INVALID_SOURCE text
//  5. DE winner change (RESULT_CONFLICT) -> tells the organizer to reopen the bracket in the app
//  6. live points on a DE match still use record_score_event
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

const DE = 'de000000-0000-4000-8000-000000000001', SE = '5e000000-0000-4000-8000-000000000001';
const P1 = 'a0000000-0000-4000-8000-000000000001', P2 = 'a0000000-0000-4000-8000-000000000002';
const M_DE = 'de000000-0000-4000-8000-0000000000m1'.replace('m', 'a'), M_SE = '5e000000-0000-4000-8000-0000000000a1';
const participants = [{ id: P1, name: 'Rivera', seed: 1, members: [] }, { id: P2, name: 'Chen', seed: 2, members: [] }];
const snapshot = (tid, mid, format) => ({
  tournament: { id: tid, name: format === 'double_elimination' ? 'Harbor DE' : 'Harbor SE', format, is_public: true, status: 'in_progress' },
  participants,
  matches: [{ id: mid, round: 1, match_number: 1, status: be.completed ? 'completed' : 'in_progress', score_summary: be.completed ? '11-7' : null, participant1_id: P1, participant2_id: P2, live: { score1: 11, score2: 7 } }],
});
// be.migrated: the server has 20261114150000 (v2 accepts 'web'; record_score_event refuses DE match_completed)
const be = { migrated: true, conflict: false, completed: false, calls: [] };
const USER = { id: '55555555-5555-4555-8555-555555555555', aud: 'authenticated', role: 'authenticated', email: 'org@example.test' };
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
  if (url.pathname === '/rest/v1/tournament_matches') {
    be.calls.push({ rpc: 'select tournament_matches', q: url.search });
    const de = url.search.includes(M_DE);
    return json({ participant1_id: P1, participant2_id: P2, tournaments: { format: de ? 'double_elimination' : 'single_elimination' } });
  }
  const rpc = url.pathname.replace('/rest/v1/rpc/', '');
  const body = route.request().postData() ? JSON.parse(route.request().postData()) : {};
  be.calls.push({ rpc, body });
  if (rpc === 'is_tournament_scorer') return json(true);
  if (rpc === 'live_tournament_snapshot') return json(body.p_tournament_id === DE ? snapshot(DE, M_DE, 'double_elimination') : snapshot(SE, M_SE, 'single_elimination'));
  if (rpc === 'record_score_event') {
    if (be.migrated && body.p_event_type === 'match_completed' && body.p_match_id === M_DE)
      return json({ code: '22023', message: 'double-elimination results must be recorded with record_tournament_match_result_v2', hint: 'DE_RESULT_RPC', details: null }, 400);
    if (be.failDE && body.p_match_id === M_DE) return json({ code: 'P0001', message: 'network down', hint: null, details: null }, 400);
    return json({ seq: 1, live: { score1: body.p_score1, score2: body.p_score2 } });
  }
  if (rpc === 'record_tournament_match_result_v2') {
    if (be.failDE) return json({ code: 'P0001', message: 'network down', hint: null, details: null }, 400);
    if (!be.migrated) return json({ code: '22023', message: 'INVALID_SOURCE: unsupported source web', hint: 'INVALID_SOURCE', details: null }, 400);
    if (be.conflict) return json({ code: 'P0001', message: 'RESULT_CONFLICT: match already completed with a different winner', hint: null, details: null }, 400);
    if (be.completed) return json({ status: 'already_recorded', match_id: body.p_match_id });
    return json({ status: 'recorded' });
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
const writes = () => be.calls.filter(c => c.rpc === 'record_tournament_match_result_v2' || (c.rpc === 'record_score_event'));

async function finalOnScorekeeper(tid, mid) {
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(`${BASE}/scorekeeper.html?t=${tid}`);
  await page.click(`[data-pick="${mid}"]`);
  await page.waitForSelector('#finalBtn');
  be.calls = [];
  await page.click('#finalBtn');
  await page.waitForTimeout(800);
  return page;
}

// 1. DE final from the scorekeeper
let page = await finalOnScorekeeper(DE, M_DE);
let w = writes();
const v2 = w.find(c => c.rpc === 'record_tournament_match_result_v2');
check(!!v2 && v2.body.p_match_id === M_DE && v2.body.p_winner_id === P1 && v2.body.p_score_summary === '11-7'
  && v2.body.p_score1 === 11 && v2.body.p_score2 === 7 && v2.body.p_source === 'web',
  `1. DE final -> record_tournament_match_result_v2(winner seat 1, '11-7', web) [${w.map(c => c.rpc + ':' + (c.body.p_event_type || c.body.p_source)).join(', ')}]`);
check(!w.some(c => c.rpc === 'record_score_event' && c.body.p_event_type === 'match_completed'), '1. DE final does not send record_score_event(match_completed)');
await page.close();

// 2. SE final unchanged
page = await finalOnScorekeeper(SE, M_SE);
w = writes();
check(w.length === 1 && w[0].rpc === 'record_score_event' && w[0].body.p_event_type === 'match_completed', `2. SE final -> record_score_event(match_completed) only [${w.map(c => c.rpc).join(', ')}]`);

// 3-6 drive PCLive directly on a page that never loaded the DE snapshot
const call = (opts) => page.evaluate(async o => { try { const r = await window.PCLive.recordScoreEvent(o); return { ok: true, r }; } catch (e) { return { ok: false, msg: e.message }; } }, opts);
be.calls = [];
let r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'match_completed', score1: 4, score2: 11 });
w = writes();
check(r.ok && w.map(c => c.rpc).join(',') === 'record_score_event,record_tournament_match_result_v2'
  && w[1].body.p_winner_id === P2 && w[1].body.p_score_summary === '4-11',
  `3. uncached DE match: DE_RESULT_RPC -> v2 with winner seat 2 [${JSON.stringify(r)} ${w.map(c => c.rpc).join(', ')}]`);

be.migrated = false; be.calls = [];
await page.evaluate(id => window.PCLive.tournamentSnapshot(id), DE);
r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'match_completed', score1: 11, score2: 7 });
check(!r.ok && !/INVALID_SOURCE/.test(r.msg) && /app/i.test(r.msg), `4. old server: plain message, nothing written as SE [${r.msg}]`);
check(!writes().some(c => c.rpc === 'record_score_event'), '4. old server: no record_score_event(match_completed) fallback');

be.migrated = true; be.conflict = true;
r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'match_completed', score1: 7, score2: 11, note: 'organizer web correction' });
check(!r.ok && /reopen/i.test(r.msg) && /app/i.test(r.msg), `5. DE winner change: points to Reopen bracket in the app [${r.msg}]`);
be.conflict = false;

be.calls = [];
r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'point_added', score1: 5, score2: 3 });
w = writes();
check(r.ok && w.length === 1 && w[0].rpc === 'record_score_event' && w[0].body.p_event_type === 'point_added', '6. DE live point still uses record_score_event');

// 7-8. completed DE match (organizer correction / retry)
be.completed = true;
await page.evaluate(id => window.PCLive.tournamentSnapshot(id), DE);
be.calls = [];
r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'match_completed', score1: 11, score2: 9, note: 'organizer web correction' });
w = writes();
check(r.ok && w.map(c => c.rpc + ':' + (c.body.p_event_type || c.body.p_source)).join(',') === 'record_tournament_match_result_v2:web,record_score_event:score_corrected'
  && w[1].body.p_score1 === 11 && w[1].body.p_score2 === 9,
  `7. same-winner correction 11-7 -> 11-9 on a completed DE match is saved as score_corrected [${w.map(c => c.rpc + ':' + (c.body.p_event_type || c.body.p_source)).join(', ')}]`);
be.calls = [];
r = await call({ scope: 'tournament', matchId: M_DE, eventType: 'match_completed', score1: 11, score2: 7 });
w = writes();
check(r.ok && w.length === 1 && w[0].rpc === 'record_tournament_match_result_v2', `8. retry with the stored score writes nothing else [${w.map(c => c.rpc).join(', ')}]`);
be.completed = false;

// 9. scorekeeper: a refused DE final keeps the match open and shows why
be.failDE = true;
const sk = await ctx.newPage();
sk.on('dialog', d => d.accept());
await sk.goto(`${BASE}/scorekeeper.html?t=${DE}`);
await sk.click(`[data-pick="${M_DE}"]`);
await sk.waitForSelector('#finalBtn');
await sk.click('#finalBtn');
await sk.waitForTimeout(800);
const skState = await sk.evaluate(() => ({ board: !!document.getElementById('finalBtn'), err: (document.getElementById('skErr') || {}).textContent || '' }));
check(skState.board && /network down/.test(skState.err), `9. refused final stays on the match with its message [${JSON.stringify(skState)}]`);
be.failDE = false;
// 10. the message belongs to that attempt: back to the list and into the match again, it is gone
await sk.click('#backBtn');
await sk.click(`[data-pick="${M_DE}"]`);
await sk.waitForSelector('#finalBtn');
await sk.waitForTimeout(400);
const sk2 = await sk.evaluate(() => (document.getElementById('skErr') || {}).textContent || '');
check(sk2 === '', `10. a refused final's message does not come back after leaving the match [${JSON.stringify(sk2)}]`);

await browser.close(); srv.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll DE web-result checks passed');
