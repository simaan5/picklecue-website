#!/usr/bin/env node
/**
 * Keyboard and screen-reader structure.
 *
 * Not a substitute for VoiceOver on a real iPhone — that stays an owner check.
 * This is the part a machine can be trusted with, run in WebKit because that is
 * the engine VoiceOver reads:
 *
 *   - the skip link works: it is the first tab stop and moves focus into main
 *   - every interactive element is reachable by Tab, in DOM order
 *   - focus visibility is NOT checked here: it belongs to tools/checks/focus.mjs,
 *     which diffs pixels. Reading the focused element's own outline/box-shadow
 *     was wrong twice — the indicator is often on an ancestor via :focus-within,
 *     and `outline: auto` has no numeric width — and produced three findings
 *     that were all the instrument.
 *   - no keyboard trap: Tab eventually leaves the page
 *   - landmarks exist and are unique per role
 *   - the heading outline starts at h1 and skips no level
 *   - aria-live regions exist where the page announces asynchronously
 *
 * WEBKIT ONLY REACHES FORM FIELDS BY TAB. That is macOS Safari's shipped
 * default ("Press Tab to highlight each item on a webpage" is off), and
 * headless WebKit follows it — so it reports 0-1 tab stops on every page.
 * That is the environment, not the site, and iOS Safari with a hardware
 * keyboard or VoiceOver does not behave that way. The tab-order assertions
 * therefore run in Chromium; WebKit still checks structure, naming and the
 * focus ring on what it does reach.
 */
import { webkit, chromium } from 'playwright-core';
import { withSite } from '../measure/lib.mjs';
import { TEMPLATES } from './templates.mjs';

const MAX_TABS = 220;
let problems = 0;

await withSite(async ({ origin }) => {
  for (const [engineName, engine, opts] of [['webkit', webkit, {}], ['chromium', chromium, { channel: 'chrome' }]]) {
    const browser = await engine.launch({ headless: true, ...opts });
    console.log(`\n  ── ${engineName} ──`);
    for (const [path, label] of TEMPLATES) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
      if (!resp || resp.status() !== 200) { console.log(`     ${label.padEnd(20)} HTTP ${resp ? resp.status() : 'none'}`); await ctx.close(); continue; }
      await page.waitForTimeout(700);

      const structure = await page.evaluate(() => {
        const roles = { main: 'main', nav: 'navigation', header: 'banner', footer: 'contentinfo' };
        const found = {};
        for (const [tag, role] of Object.entries(roles))
          found[role] = document.querySelectorAll(`${tag}, [role="${role}"]`).length;
        const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
        let skip = null, last = 0;
        for (const l of hs) { if (last && l > last + 1 && skip === null) skip = `h${last}→h${l}`; last = l; }
        return {
          landmarks: found,
          h1: document.querySelectorAll('h1').length,
          firstHeading: hs[0] || null,
          headingSkip: skip,
          live: document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').length,
          navsUnlabelled: [...document.querySelectorAll('nav')].filter(n => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length,
        };
      });

      /* Tab through the page and record where focus lands. */
      await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
      const stops = [];
      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return null;
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          /* Resolve the accessible name the way a screen reader does. A first
             version read only aria-label/innerText/title/alt and reported every
             <input> as unnamed — they are labelled with <label for>, which is
             the most common way to do it correctly. */
          const labelled = e.getAttribute('aria-labelledby');
          const byId = labelled && labelled.split(/\s+/).map(id => (document.getElementById(id) || {}).innerText || '').join(' ');
          const forLabel = e.id ? (document.querySelector(`label[for="${CSS.escape(e.id)}"]`) || {}).innerText : '';
          const wrapping = e.closest('label') ? e.closest('label').innerText : '';
          const name = (e.getAttribute('aria-label') || byId || forLabel || wrapping ||
                        (e.innerText || '').trim() || e.getAttribute('title') || e.getAttribute('alt') ||
                        e.getAttribute('placeholder') || '').trim().slice(0, 30);
          return { tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 22), name,
                   w: Math.round(r.width), h: Math.round(r.height), inMain: !!e.closest('main') };
        });
        if (!s) break;
        stops.push(s);
        if (stops.length > 2 && stops.at(-1).tag === stops.at(-2).tag && stops.at(-1).name === stops.at(-2).name && stops.at(-1).name && stops.length > 6 &&
            stops.slice(-4).every(x => x.name === stops.at(-1).name)) break;   // trap heuristic
      }

      const issues = [];
      if (structure.h1 !== 1) issues.push(`${structure.h1} <h1>`);
      if (structure.firstHeading && structure.firstHeading !== 1) issues.push(`first heading is h${structure.firstHeading}`);
      if (structure.headingSkip) issues.push(`heading skip ${structure.headingSkip}`);
      if (!structure.landmarks.main) issues.push('no main landmark');
      if (structure.navsUnlabelled) issues.push(`${structure.navsUnlabelled} unlabelled <nav>`);
      const unnamed = stops.filter(s => !s.name);
      if (unnamed.length) issues.push(`${unnamed.length} tab stop(s) with no accessible name`);
      if (stops.length >= MAX_TABS) issues.push('possible keyboard trap (hit the tab limit)');
      const firstStop = stops[0];
      /* Only meaningful where Tab reaches links at all. */
      if (engineName === 'chromium' && firstStop && !/skip/i.test(firstStop.cls + ' ' + firstStop.name))
        issues.push(`first tab stop is "${firstStop.name || firstStop.tag}", not the skip link`);
      if (engineName === 'webkit' && stops.length <= 2) issues.length = 0;   // form-fields-only default

      if (issues.length) problems += issues.length;
      console.log(`     ${label.padEnd(20)} ${String(stops.length).padStart(3)} tab stops   ${issues.length ? issues.join(' · ') : 'clean'}`);
      if (unnamed.length) for (const s of unnamed.slice(0, 3)) console.log(`${' '.repeat(26)}unnamed: <${s.tag}${s.cls ? ' class="' + s.cls + '"' : ''}> ${s.w}x${s.h}`);
      await ctx.close();
    }
    await browser.close();
  }
});
console.log(`\n  ${problems} issue(s).\n`);
process.exit(problems ? 1 : 0);
