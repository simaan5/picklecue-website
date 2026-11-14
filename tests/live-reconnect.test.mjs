// node tests/live-reconnect.test.mjs
// Regression: one realtime channel error must cause ONE rejoin, not a
// leave/join every 4 s forever (s27 sweep). Runs assets/live-core.js in a VM
// against a fake supabase client that mimics realtime-js 2.112: channel(topic)
// returns a still-registered channel with the same topic, removeChannel()
// resolves after the leave and fires CLOSED on the removed channel, and a
// channel error is followed by realtime-js's own rejoin.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../assets/live-core.js', import.meta.url), 'utf8');
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

function harness() {
  const timers = []; let now = 0;
  const setTimeout_ = (fn, ms) => { const t = { at: now + ms, fn, id: timers.length + 1 }; timers.push(t); return t.id; };
  const clearTimeout_ = id => { const t = timers.find(x => x.id === id); if (t) t.fn = null; };
  const stats = { joins: 0, created: 0, states: [] };
  const channels = [];
  function makeChannel(topic) {
    const ch = { topic, cb: null, closed: true, handlers: [],
      on(_t, _f, h) { this.handlers.push(h); return this; },
      subscribe(cb) { this.cb = cb; this.closed = false; stats.joins++; queue(() => this.cb && !this.closed && this.cb('SUBSCRIBED')); return this; },
      teardown() { const i = channels.indexOf(this); if (i !== -1) channels.splice(i, 1); },
      // realtime-js: an error schedules its own rejoin ~1 s later
      error() { this.cb('CHANNEL_ERROR'); setTimeout_(() => { if (!this.closed) { stats.joins++; this.cb('SUBSCRIBED'); } }, 1000); },
      serverClose() { this.closed = true; this.cb('CLOSED'); },
    };
    return ch;
  }
  const micro = [];
  const queue = fn => micro.push(fn);
  const client = {
    channel(topic) { const t = 'realtime:' + topic; const ex = channels.find(c => c.topic === t); if (ex) return ex; const c = makeChannel(t); channels.push(c); stats.created++; return c; },
    getChannels() { return channels.slice(); },
    removeChannel(ch) { return new Promise(res => queue(() => { ch.closed = true; ch.cb && ch.cb('CLOSED'); ch.teardown(); res('ok'); })); },
    rpc: async () => ({ data: null }), auth: {}, realtime: {},
  };
  const doc = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const ctx = { window: { supabase: { createClient: () => client } }, document: doc, setTimeout: setTimeout_, clearTimeout: clearTimeout_, setInterval: () => 0, clearInterval() {}, location: { origin: 'http://x', pathname: '/', search: '' }, Promise, console };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const flush = async () => { for (let i = 0; i < 50; i++) { while (micro.length) micro.shift()(); await null; } };
  const advance = async ms => { const end = now + ms; for (;;) { await flush(); const next = timers.filter(t => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!next) break; now = next.at; const f = next.fn; next.fn = null; f(); } now = end; await flush(); };
  return { PCLive: ctx.window.PCLive, channels, stats, advance };
}

{ // channel error: realtime-js rejoins in 1 s, no extra rejoin loop
  const h = harness(); let pings = 0;
  h.PCLive.subscribeLive('t', 'abc', true, () => pings++, s => h.stats.states.push(s));
  await h.advance(1000);
  check(h.stats.joins === 1, 'first join (' + h.stats.joins + ')');
  h.channels[0].error();
  const j0 = h.stats.joins;
  await h.advance(30000);
  check(h.stats.joins - j0 === 1, 'error -> exactly 1 rejoin in 30 s (got ' + (h.stats.joins - j0) + ')');
  check(h.stats.states[h.stats.states.length - 1] === 'live', 'state ends live (' + h.stats.states.join(',') + ')');
}
{ // server closes the channel: one fresh channel after 4 s, then quiet
  const h = harness();
  h.PCLive.subscribeLive('t', 'abc', true, () => {}, s => h.stats.states.push(s));
  await h.advance(1000);
  h.channels[0].serverClose();
  const j0 = h.stats.joins, c0 = h.stats.created;
  await h.advance(30000);
  check(h.stats.joins - j0 === 1, 'close -> exactly 1 rejoin in 30 s (got ' + (h.stats.joins - j0) + ')');
  check(h.stats.created - c0 === 1, 'close -> 1 new channel object (got ' + (h.stats.created - c0) + ')');
  check(h.channels.length === 1, 'one channel registered (' + h.channels.length + ')');
}
{ // unsubscribe cancels a pending retry
  const h = harness();
  const unsub = h.PCLive.subscribeLive('t', 'abc', true, () => {}, () => {});
  await h.advance(1000);
  h.channels[0].serverClose();
  unsub();
  const j0 = h.stats.joins;
  await h.advance(30000);
  check(h.stats.joins === j0, 'no rejoin after unsubscribe');
}
console.log(failures ? failures + ' failure(s)' : 'all passed');
process.exit(failures ? 1 : 0);
