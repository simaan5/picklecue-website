/* live-core.js ping() coalescer — leading-edge, trailing coalesce.
 *
 * Load assets/live-core.js inside an sandboxed page, stub the Supabase
 * client so subscribeLive can run, and assert the timing:
 *   - idle, 1 ping            → onPing fires at t ≈ 0 ms
 *   - 3 pings at t=0,30,60 ms → onPing fires at t ≈ 0 and t ≈ 250 ms (coalesced)
 *   - 1 ping, wait 300 ms, 1 → onPing fires at t ≈ 0 and t ≈ 300 ms (both leading)
 * Before the fix, every ping was trailing-only (250 ms floor on the first call).
 *
 * Run: node tests/live-ping-debounce.test.mjs
 * No network: Supabase client and channel are faked. Chrome not required.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = await readFile(join(ROOT, 'assets', 'live-core.js'), 'utf8');

function makeStubSupabase(onBroadcastHandler) {
  const channel = {
    on(kind, filter, cb) {
      if (kind === 'broadcast' && filter.event === 'change') onBroadcastHandler.current = cb;
      return channel;
    },
    subscribe(cb) { queueMicrotask(() => cb('SUBSCRIBED')); return channel; },
  };
  return {
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
  };
}

// Build a minimal window/document context for the IIFE in live-core.js.
const handlerRef = { current: null };
const ctx = {
  window: {},
  document: {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { style: {}, appendChild() {}, setAttribute() {}, classList: { add() {}, remove() {} } }; },
    body: { appendChild() {} },
    head: { appendChild() {} },
    querySelector() { return null; },
  },
  setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask,
  Date, Math, JSON, Promise, Array, Object, Error, Buffer, URL,
  console,
};
ctx.window.supabase = makeStubSupabase(handlerRef);
ctx.window.PCLive = null;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'assets/live-core.js' });

const PC = ctx.window.PCLive;
if (!PC || typeof PC.subscribeLive !== 'function') {
  console.error('fail: window.PCLive.subscribeLive not exported');
  process.exit(1);
}

const results = [];
function logFail(name, got, want) {
  results.push({ name, ok: false, got, want });
}
function logOk(name) { results.push({ name, ok: true }); }

async function runScenario(name, schedule, expectedCalls) {
  const fires = [];
  const start = Date.now();
  const unsub = PC.subscribeLive('t', 'test-' + name, true, () => fires.push(Date.now() - start), () => {});
  // wait a tick for subscribe
  await new Promise(r => setTimeout(r, 5));
  for (const { at, note } of schedule) {
    const wait = at - (Date.now() - start);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    handlerRef.current && handlerRef.current({ event: 'change' });
  }
  // wait for any trailing timer (COALESCE_MS = 250)
  await new Promise(r => setTimeout(r, 400));
  unsub();

  // assertions
  if (fires.length !== expectedCalls.length) {
    return logFail(name, 'fires=' + JSON.stringify(fires), 'count=' + expectedCalls.length);
  }
  for (let i = 0; i < expectedCalls.length; i++) {
    const [lo, hi] = expectedCalls[i];
    if (fires[i] < lo || fires[i] > hi) {
      return logFail(name, 'fires[' + i + ']=' + fires[i] + 'ms', '[' + lo + ',' + hi + ']ms');
    }
  }
  logOk(name + ' (fires at ' + fires.join('ms, ') + 'ms)');
}

// SUBSCRIBED fires one catch-up ping; it lands first. Then we fire our pings.
// Each scenario accounts for the catch-up ping at t≈5ms as fires[0].
await runScenario(
  'idle-then-one-ping',
  [{ at: 50 }],
  // fires[0]: catch-up at ~5ms (leading). fires[1]: our ping at 50ms → needs
  // to wait for COALESCE window after first, so trailing at ~250ms.
  [[0, 50], [240, 320]]
);

await runScenario(
  'burst-of-three',
  [{ at: 60 }, { at: 90 }, { at: 120 }],
  // fires[0]: catch-up ~5ms. fires[1]: coalesced trailing at ~250ms.
  [[0, 50], [240, 320]]
);

await runScenario(
  'spaced-pings-each-leading',
  [{ at: 300 }, { at: 600 }],
  // catch-up ~5ms (leading), then at 300ms (leading, >250ms since last),
  // then at 600ms (leading again).
  [[0, 50], [290, 340], [590, 650]]
);

const failed = results.filter(r => !r.ok);
for (const r of results) {
  if (r.ok) console.log('  ok ', r.name);
  else console.log('  FAIL', r.name, '— got', r.got, 'want', r.want);
}
if (failed.length) {
  console.log('\n' + failed.length + '/' + results.length + ' FAIL');
  process.exit(1);
}
console.log('\n' + results.length + '/' + results.length + ' ok');
process.exit(0);
