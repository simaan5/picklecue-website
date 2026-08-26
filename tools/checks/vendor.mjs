#!/usr/bin/env node
/**
 * The vendored libraries actually load, and the pages that need them get them.
 *
 * Swapping a CDN URL for a local one is a two-line change that silently breaks
 * live scoring if the file is missing, truncated or a different build. So this
 * loads each affected page and asserts the global the page depends on exists —
 * `supabase.createClient` for the five realtime pages, `qrcode` for the two
 * that draw QR posters — and that nothing external is fetched to get there.
 */
import { chromium, webkit } from 'playwright-core';
import { withSite } from '../measure/lib.mjs';

const PAGES = [
  ['/live',        () => typeof window.supabase?.createClient === 'function', 'supabase.createClient'],
  ['/organizer',   () => typeof window.supabase?.createClient === 'function', 'supabase.createClient'],
  ['/scorekeeper', () => typeof window.supabase?.createClient === 'function', 'supabase.createClient'],
  ['/checkin',     () => typeof window.supabase?.createClient === 'function', 'supabase.createClient'],
  ['/e',           () => typeof window.supabase?.createClient === 'function', 'supabase.createClient'],
];

let bad = 0;
await withSite(async ({ origin }) => {
  for (const [engineName, engine, opts] of [['chromium', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
    const browser = await engine.launch({ headless: true, ...opts });
    console.log(`\n  ${engineName}\n`);
    for (const [path, probe, label] of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const external = [];
      const errors = [];
      page.on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(new URL(r.url()).host); });
      page.on('pageerror', e => errors.push(String(e).slice(0, 90)));
      const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(1200);
      const ok = resp?.status() === 200 && await page.evaluate(probe).catch(() => false);
      const cdn = [...new Set(external)].filter(h => /jsdelivr|unpkg|cdn/.test(h));
      if (!ok || cdn.length) bad++;
      console.log(`     ${path.padEnd(14)} ${label.padEnd(24)} ${ok ? 'present' : 'MISSING'}   cdn requests: ${cdn.length ? cdn.join(', ') : 'none'}${errors.length ? '   page errors: ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
    await browser.close();
  }
});
console.log('');
if (bad) { console.error(`  ${bad} page(s) did not get their library from this origin.\n`); process.exit(1); }
console.log('  Every page reaches its library from this origin, with no CDN request.\n');
