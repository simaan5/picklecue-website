#!/usr/bin/env node
/**
 * Core Web Vitals on the real code path.
 *
 * Lighthouse would answer this too, but it brings a large dependency tree into
 * a repo whose whole argument is that it ships almost nothing — and the three
 * numbers that matter are observable directly. LCP and CLS come from the
 * browser's own PerformanceObserver, not from a model of it.
 *
 * INP cannot be measured without a real interaction stream, so this reports
 * TOTAL BLOCKING TIME instead — long tasks over 50 ms — which is what makes an
 * interaction feel late, and says so rather than implying it measured INP.
 *
 * The CPU throttle is PROVEN before any throttled number is printed
 * (verifyThrottle), because a first version of that check reported a real 4x
 * throttle as 1.6x and would have made everything look fine.
 *
 *   node tools/checks/vitals.mjs             mobile, 4x CPU
 *   node tools/checks/vitals.mjs --desktop   also unthrottled desktop
 */
import { chromium, devices } from 'playwright-core';
import { withSite, verifyThrottle, table } from '../measure/lib.mjs';
import { TEMPLATES } from './templates.mjs';

/* Google's "good" thresholds. */
const GOOD = { lcp: 2500, cls: 0.1, tbt: 200 };

const collect = () => new Promise(resolve => {
  const out = { lcp: 0, cls: 0, tbt: 0, longest: 0, ttfb: 0 };
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) out.ttfb = nav.responseStart;
  new PerformanceObserver(l => { for (const e of l.getEntries()) out.lcp = Math.max(out.lcp, e.startTime); })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) { out.tbt += Math.max(0, e.duration - 50); out.longest = Math.max(out.longest, e.duration); } })
    .observe({ type: 'longtask', buffered: true });
  setTimeout(() => resolve(out), 3500);
});

const desktop = process.argv.includes('--desktop');
const rows = [];

await withSite(async ({ origin }) => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const throttle = await verifyThrottle(browser, 4);
  console.log(`\n  CPU throttle: base ${throttle.baseMs} ms, throttled ${throttle.throttledMs} ms, ratio ${throttle.ratio}x — ${throttle.applied ? 'APPLIED' : 'NOT APPLIED'}`);
  if (!throttle.applied) { console.error('  Throttled numbers are not reported when the throttle cannot be proven.'); await browser.close(); process.exit(1); }

  const profiles = [['iPhone 15, 4x CPU', { ...devices['iPhone 15'] }, 4]];
  if (desktop) profiles.push(['desktop 1440, no throttle', { viewport: { width: 1440, height: 900 } }, 0]);

  for (const [profile, ctxOpts, rate] of profiles) {
    for (const [path, label] of TEMPLATES) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      const cdp = rate ? await ctx.newCDPSession(page) : null;
      if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.addInitScript(`window.__vitals = ${collect.toString()}()`);
      const r = await page.goto(origin + path, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
      if (!r || r.status() !== 200) { await ctx.close(); continue; }
      const v = await page.evaluate(() => window.__vitals);
      rows.push({
        profile, page: label,
        LCP: Math.round(v.lcp), CLS: +v.cls.toFixed(3), TBT: Math.round(v.tbt),
        longest: Math.round(v.longest), TTFB: Math.round(v.ttfb),
      });
      await ctx.close();
    }
  }
  await browser.close();
});

const flag = r => [r.LCP > GOOD.lcp && 'LCP', r.CLS > GOOD.cls && 'CLS', r.TBT > GOOD.tbt && 'TBT'].filter(Boolean).join(' ');
for (const p of [...new Set(rows.map(r => r.profile))]) {
  console.log(`\n  ${p}   (good: LCP < ${GOOD.lcp} ms · CLS < ${GOOD.cls} · TBT < ${GOOD.tbt} ms)\n`);
  console.log(table(rows.filter(r => r.profile === p).map(r => ({
    page: r.page, LCP: r.LCP + ' ms', CLS: r.CLS, TBT: r.TBT + ' ms', 'longest task': r.longest + ' ms', TTFB: r.TTFB + ' ms', over: flag(r) || '',
  })), ['page', 'LCP', 'CLS', 'TBT', 'longest task', 'TTFB', 'over']));
}
const over = rows.filter(r => flag(r));
console.log(`\n  ${over.length} page/profile combination(s) outside Google's "good" range.\n`);
/* TTFB here is a local static server, so it is reported for completeness and
   is not comparable to production — Cloudflare's edge is the real number. */
console.log('  TTFB is from a local static server and is NOT a production figure.\n');
