/* live-core.js subscribeLive() 'score' broadcast (instant-sync Option 1).
 *
 * Loads assets/live-core.js in a node:vm sandbox with a fake Supabase client
 * (no network) and asserts:
 *   - a 'score' message is handed to onScore with NO refetch
 *   - versions apply per match: an older / repeated seq is dropped
 *   - a skipped seq paints, then heals with one refetch
 *   - lifecycle events (match_completed …) paint and refetch
 *   - with onScore, the legacy score_events 'change' ping is ignored, but a
 *     tournament_matches ping still refetches
 *   - without onScore (other pages), behaviour is unchanged: pings refetch
 *   - onScore returning false (match not on page) falls back to a refetch
 *
 * Run: node tests/live-score-broadcast.test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = await readFile(join(ROOT, 'assets', 'live-core.js'), 'utf8');

const handlers = {};
const channel = {
  on(kind, filter, cb) { if (kind === 'broadcast') handlers[filter.event] = cb; return channel; },
  subscribe(cb) { channel._status = cb; return channel; },
};
const ctx = {
  window: {
    supabase: {
      createClient() {
        return {
          channel: () => channel,
          removeChannel() {},
          rpc() { return Promise.resolve({ data: null, error: null }); },
          auth: {
            onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
            getSession() { return Promise.resolve({ data: { session: null }, error: null }); },
            getUser() { return Promise.resolve({ data: { user: null }, error: null }); },
          },
        };
      },
    },
  },
  document: {
    visibilityState: 'visible', addEventListener() {}, removeEventListener() {},
    createElement() { return { style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }; },
    body: { appendChild() {} }, head: { appendChild() {} }, querySelector() { return null; },
  },
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  Date, Math, JSON, Promise, Array, Object, Error, URL, console,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'assets/live-core.js' });
const PC = ctx.window.PCLive;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const score = (match, seq, s1, s2, type = 'point_added') => ({
  event: 'score',
  payload: { match_id: match, seq, event_type: type, game_number: 1, live: { score1: s1, score2: s2, game: 1, event_type: type }, at: 'x' },
});

async function scenario(name, { withOnScore = true, onScoreResult = true, steps }) {
  for (const k of Object.keys(handlers)) delete handlers[k];
  let refetches = 0;
  const painted = [];
  const onScore = withOnScore ? (p) => { painted.push(p.live ? p.live.score1 + '-' + p.live.score2 : 'null'); return onScoreResult; } : undefined;
  const unsub = PC.subscribeLive('t', 'id-' + name, true, () => refetches++, () => {}, onScore);
  // No SUBSCRIBED callback here: we test message handling, not the catch-up ping.
  for (const step of steps) {
    handlers[step.event](step);
    await sleep(300); // past the 250 ms coalesce window so every refetch is counted
  }
  unsub();
  return { refetches, painted };
}

{
  const r = await scenario('paint-no-refetch', { steps: [score('m1', 4, 5, 3), score('m1', 5, 6, 3)] });
  check('score messages paint without refetching', r.refetches === 0 && r.painted.join() === '5-3,6-3', JSON.stringify(r));
}
{
  const r = await scenario('stale', { steps: [score('m1', 7, 6, 3), score('m1', 6, 5, 3), score('m1', 7, 6, 3)] });
  check('older and repeated versions are dropped (newer wins)', r.painted.join() === '6-3' && r.refetches === 0, JSON.stringify(r));
}
{
  const r = await scenario('per-match', { steps: [score('m1', 9, 6, 3), score('m2', 1, 1, 0)] });
  check('versions are tracked per match', r.painted.join() === '6-3,1-0' && r.refetches === 0, JSON.stringify(r));
}
{
  const r = await scenario('gap', { steps: [score('m1', 2, 1, 0), score('m1', 5, 4, 0)] });
  check('skipped version paints then refetches once', r.painted.join() === '1-0,4-0' && r.refetches === 1, JSON.stringify(r));
}
{
  const r = await scenario('lifecycle', { steps: [score('m1', 3, 11, 9, 'match_completed')] });
  check('lifecycle event paints and refetches', r.painted.join() === '11-9' && r.refetches === 1, JSON.stringify(r));
}
{
  const r = await scenario('pre-migration-pings-still-refetch', {
    steps: [{ event: 'change', payload: { table: 'score_events', op: 'INSERT' } },
            { event: 'change', payload: { table: 'score_events', op: 'INSERT' } }],
  });
  check('before any score message (migration not applied) score_events pings still refetch', r.refetches === 2, JSON.stringify(r));
}
{
  const r = await scenario('legacy-ping-ignored', {
    steps: [score('m1', 1, 1, 0),
            { event: 'change', payload: { table: 'score_events', op: 'INSERT' } },
            { event: 'change', payload: { table: 'tournament_matches', op: 'UPDATE' } }],
  });
  check('after a score message: score_events ping ignored, match-row ping refetches', r.refetches === 1 && r.painted.join() === '1-0', JSON.stringify(r));
}
{
  const r = await scenario('no-onScore', {
    withOnScore: false,
    steps: [{ event: 'change', payload: { table: 'score_events', op: 'INSERT' } }, score('m1', 1, 1, 0)],
  });
  check('pages without onScore refetch on the ping and ignore the score message (no double refetch)', r.refetches === 1, JSON.stringify(r));
}
{
  const r = await scenario('not-on-page', { onScoreResult: false, steps: [score('m9', 1, 1, 0)] });
  check('onScore=false (match not on page) falls back to refetch', r.refetches === 1, JSON.stringify(r));
}

let failed = 0;
for (const r of results) {
  console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.ok ? '' : ' — ' + r.detail));
  if (!r.ok) failed++;
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' ok');
process.exit(failed ? 1 : 0);
