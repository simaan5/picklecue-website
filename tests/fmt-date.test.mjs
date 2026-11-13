/* live-core.js fmtDate / parseDate — date-only strings are calendar days.
 *
 * Bug: fmtDate('2026-11-14') showed "Nov 13, 2026" for every US viewer because
 * new Date('2026-11-14') is UTC midnight. This loads assets/live-core.js in a
 * vm sandbox (Supabase client stubbed, no network, no browser) and checks the
 * output in several time zones, including ones west and east of UTC.
 *
 * Run: node tests/fmt-date.test.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = await readFile(join(ROOT, 'assets', 'live-core.js'), 'utf8');

function loadPCLive() {
  const stubClient = { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}, rpc: async () => ({}), auth: { getSession: async () => ({ data: {} }), onAuthStateChange() {} } };
  const window = { supabase: { createClient: () => stubClient }, location: { origin: 'http://localhost', href: 'http://localhost/' } };
  const ctx = vm.createContext({ window, document: { addEventListener() {}, visibilityState: 'visible' }, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams });
  vm.runInContext(src, ctx, { filename: 'live-core.js' });
  if (!window.PCLive || typeof window.PCLive.fmtDate !== 'function') throw new Error('PCLive.fmtDate not exported');
  return window.PCLive;
}

let failed = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
};

const SHORT = { month: 'short', day: 'numeric', year: 'numeric' };
const fmt = (d, o = SHORT) => d.toLocaleDateString(undefined, o);

for (const tz of ['America/Los_Angeles', 'America/New_York', 'Pacific/Honolulu', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
  process.env.TZ = tz; // Node re-reads TZ on assignment
  const PC = loadPCLive();
  console.log(`-- TZ=${tz}`);
  // The calendar day must survive every zone.
  check('date-only 2026-11-14', PC.fmtDate('2026-11-14'), fmt(new Date(2026, 10, 14)));
  check('date-only 2026-01-01 (year edge)', PC.fmtDate('2026-01-01'), fmt(new Date(2026, 0, 1)));
  check('parseDate day', PC.parseDate('2026-11-14').getDate(), 14);
  check('long opts (results graphic)', PC.fmtDate('2026-11-14', { month: 'long', day: 'numeric', year: 'numeric' }), fmt(new Date(2026, 10, 14), { month: 'long', day: 'numeric', year: 'numeric' }));
  // Full timestamps are instants and keep their old meaning.
  const ts = '2026-11-14T20:00:00Z';
  check('timestamp unchanged', PC.fmtDate(ts), fmt(new Date(ts)));
  // Empty and junk input.
  check('empty', PC.fmtDate(''), '');
  check('null', PC.fmtDate(null), '');
  check('junk returns input', PC.fmtDate('not a date'), 'not a date');
}

// Sanity: the environment really reproduces the original bug in a US zone.
process.env.TZ = 'America/Los_Angeles';
check('sanity: raw new Date(date-only) is the day before in LA', new Date('2026-11-14').getDate(), 13);

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall fmtDate checks passed');
