/* Measurement harness.
 *
 * WHY THIS FILE EXISTS
 *
 * Four measurement mistakes were made during this redesign, each of which
 * produced a confident, wrong number:
 *
 *   1. `du` on the working directory reported 291 MB of "deployed" video. The
 *      deployed figure was 7.7 MB — the rest was gitignored.
 *   2. One side read `content-length`, the other raced `response.body()` against
 *      context teardown. A 576 KB homepage was reported at 90 KB.
 *   3. A test typed, slept 400 ms, then read the DOM, and reported "warm search
 *      ~400 ms". The real figure was 2.6 ms of compute and render.
 *   4. A CPU-throttle check used a loop short enough to be JIT noise and
 *      concluded throttling was not applying. It was, at exactly 4.00x.
 *
 * Every one of those was the instrument, not the product. So the instrument
 * lives here now, is used by every phase, and carries the fixes:
 *
 *   - both sides of a comparison go through the SAME function
 *   - every body promise is awaited before the context closes
 *   - nothing sleeps inside a timing window; a MutationObserver marks the end
 *   - throttling is proven with a workload long enough to be stable, and
 *     refuses to report throttled numbers if the ratio is not what was asked
 *
 * Usage:
 *   import { withSite, weigh, timeInteraction, VIEWPORTS } from './lib.mjs';
 */
import { chromium, devices } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PRODUCTION = 'https://www.picklecue.com';

/* The two controls every phase reports. Adding a third is fine; changing these
   two breaks comparison with every previous phase. */
export const VIEWPORTS = [
  { tag: '390', width: 390, height: 844, label: 'mobile 390' },
  { tag: '1440', width: 1440, height: 900, label: 'desktop 1440' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
};

/**
 * Serve the working tree the way Cloudflare Pages does: /x from x.html and
 * /dir/ from dir/index.html. `block` lets a test 404 a specific path to prove a
 * failure path — that is how the reveal watchdog, the search-index failure and
 * the journey fallback were all verified.
 */
export async function withSite(fn, { block = null, headers = null } = {}) {
  const srv = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (block && block(p)) { res.writeHead(404, { 'Content-Length': 0 }).end(); return; }
    for (const c of (p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html', p + '/index.html'])) {
      const f = normalize(join(ROOT, c));
      if (!f.startsWith(ROOT)) continue;
      try {
        if ((await stat(f)).isFile()) {
          const b = await readFile(f);
          res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Content-Length': b.length });
          res.end(b);
          return;
        }
      } catch { /* fall through */ }
    }
    res.writeHead(404, { 'Content-Length': 0 }).end();
  });
  await new Promise(r => srv.listen(0, r));
  const origin = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { return await fn({ origin, browser }); }
  finally { await browser.close(); srv.close(); }
}

/**
 * Initial page transfer.
 *
 * Counts only first-party responses, and AWAITS EVERY BODY PROMISE before the
 * context closes — the omission that once reported a 576 KB page at 90 KB.
 * `settle` is dwell time after load, outside the numbers, for lazy work to
 * settle; it is not part of any latency figure.
 */
export async function weigh(browser, origin, path, viewport, { settle = 1500, watch = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const pending = [], rows = [];
  const hits = Object.fromEntries(watch.map(w => [w, 0]));
  page.on('response', r => {
    const u = r.url();
    for (const w of watch) if (u.includes(w)) hits[w]++;
    if (!u.startsWith(origin)) return;
    pending.push(r.body().then(b => rows.push({ bytes: b.length, url: u.replace(origin, '').split('?')[0], type: r.request().resourceType() }), () => {}));
  });
  const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(settle);
  await Promise.all(pending);
  await ctx.close();
  rows.sort((a, b) => b.bytes - a.bytes);
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + r.bytes;
  return { path, viewport: viewport.tag, status: resp?.status() ?? 0, kb: Math.round(total / 1024), requests: rows.length, byType, heaviest: rows.slice(0, 6), hits };
}

/** The same function against production and the working tree. Never two. */
export async function compare(browser, origin, path, viewport, opts) {
  const before = await weigh(browser, PRODUCTION, path, viewport, opts);
  const after = await weigh(browser, origin, path, viewport, opts);
  const delta = before.kb ? Math.round((after.kb - before.kb) / before.kb * 100) : 0;
  return { path, viewport: viewport.tag, before: before.kb, after: after.kb, deltaPct: delta, after_detail: after };
}

/** Static compression sizes for a file that is fetched later, not on load. */
export async function compressed(relPath) {
  const buf = await readFile(join(ROOT, relPath));
  return { path: relPath, rawKB: +(buf.length / 1024).toFixed(1), gzipKB: +(gzipSync(buf, { level: 9 }).length / 1024).toFixed(1), brotliKB: +(brotliCompressSync(buf).length / 1024).toFixed(1) };
}

/**
 * Prove a CPU throttle before reporting anything as throttled.
 *
 * The workload is long enough that JIT warmup is not the signal, runs five
 * times and takes the median, and discards a warmup pass. A first version used
 * a loop so short it reported a real 4x throttle as 1.6x.
 */
export async function verifyThrottle(browser, rate) {
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('about:blank');
  const bench = async () => {
    const runs = [];
    for (let k = 0; k < 5; k++) runs.push(await page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 4e7; i++) x += i % 7; return performance.now() - t; }));
    runs.sort((a, b) => a - b);
    return runs[2];
  };
  await bench();                                   // warmup, discarded
  const base = await bench();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const thr = await bench();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
  const ratio = thr / base;
  return { rate, baseMs: Math.round(base), throttledMs: Math.round(thr), ratio: +ratio.toFixed(2), applied: ratio > rate * 0.75 };
}

/**
 * Interaction latency, measured on the real code path.
 *
 * `act` fires the interaction inside the page. The clock stops when a
 * MutationObserver sees `doneSelector` appear. NOTHING SLEEPS inside the
 * window. `knownDelayMs` (a debounce the code owns) is reported separately so
 * compute and render are never hidden inside it.
 */
export async function timeInteraction(browser, origin, path, viewport, {
  setup = null, act, doneSelector, watchSelector, samples = 10, knownDelayMs = 0, cpuThrottle = 0, resetMs = 200,
} = {}) {
  const ctx = await browser.newContext(cpuThrottle
    ? { ...devices['iPhone 15'] }
    : { viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const cdp = cpuThrottle ? await ctx.newCDPSession(page) : null;
  await page.goto(origin + path, { waitUntil: 'load' });
  if (setup) await setup(page);
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });

  const times = await page.evaluate(async ({ actSrc, doneSelector, watchSelector, samples, resetMs }) => {
    const act = new Function('i', 'return (' + actSrc + ')(i)');
    const watch = document.querySelector(watchSelector);
    const out = [];
    for (let i = 0; i < samples; i++) {
      await act(-1);                                   // reset, outside the window
      await new Promise(r => setTimeout(r, resetMs));
      const t0 = performance.now();
      const painted = new Promise(res => {
        const mo = new MutationObserver(() => {
          if (watch.querySelector(doneSelector)) { mo.disconnect(); res(performance.now()); }
        });
        mo.observe(watch, { childList: true, subtree: true });
      });
      await act(i);
      out.push((await painted) - t0);
    }
    return out;
  }, { actSrc: act.toString(), doneSelector, watchSelector, samples, resetMs });

  await ctx.close();
  const s = times.slice().sort((a, b) => a - b);
  const pick = q => s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)];
  return {
    path, viewport: cpuThrottle ? `390 @${cpuThrottle}x cpu` : viewport.tag, samples: times.length,
    totalMedianMs: +pick(0.5).toFixed(1), totalP95Ms: +pick(0.95).toFixed(1),
    knownDelayMs,
    computeRenderMedianMs: +(pick(0.5) - knownDelayMs).toFixed(1),
    computeRenderP95Ms: +(pick(0.95) - knownDelayMs).toFixed(1),
  };
}

export function table(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = vals => vals.map((v, i) => String(v ?? '').padEnd(w[i])).join('  ');
  return [line(cols), line(w.map(n => '-'.repeat(n))), ...rows.map(r => line(cols.map(c => r[c])))].join('\n');
}
