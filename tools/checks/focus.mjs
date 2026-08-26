#!/usr/bin/env node
/**
 * Is focus visible? Answered by pixels, not by guessing which element draws it.
 *
 * Reading the focused element's computed outline/box-shadow is wrong twice
 * over: the indicator is often on an ancestor via :focus-within (the courts
 * search field), and `outline: auto` has no numeric width. Both produced false
 * findings here.
 *
 * So: screenshot the element's neighbourhood unfocused, focus it, screenshot
 * again, and count changed pixels. A focus indicator that changes nothing is
 * not an indicator.
 */
import { chromium } from 'playwright-core';
import { withSite } from '../measure/lib.mjs';
import { TEMPLATES } from './templates.mjs';

/* A screenshot per element per theme is slow, so this runs on demand over the
   controls that matter rather than as a gate over everything:
     node tools/checks/focus.mjs                 form controls, all templates
     node tools/checks/focus.mjs /courts/ /      only these pages
     node tools/checks/focus.mjs --all-elements  links and buttons too
*/
const argPaths = process.argv.slice(2).filter(a => a.startsWith('/'));
const ALL = process.argv.includes('--all-elements');
const LIST = argPaths.length ? argPaths.map(p => [p, p]) : TEMPLATES;
const SELECTOR = ALL
  ? 'a[href], button, input, select, textarea, [tabindex="0"]'
  : 'input, select, textarea, button[type="submit"]';

const PAD = 10;
const THRESHOLD = 0.004;   // fraction of pixels that must change

function changed(a, b) {
  if (a.length !== b.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
  }
  return n / (a.length / 4);
}

let bad = 0;
await withSite(async ({ origin }) => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const [path, label] of LIST) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
      const page = await ctx.newPage();
      const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
      if (!resp || resp.status() !== 200) { await ctx.close(); continue; }
      await page.waitForTimeout(600);

      const targets = await page.evaluate((sel) => [...document.querySelectorAll(sel)]
        .filter(e => e.checkVisibility && e.checkVisibility({ checkVisibilityCSS: true }))
        .map((e, i) => { e.dataset.focusProbe = String(i); return i; }), SELECTOR);

      const weak = [];
      for (const i of targets) {
        const el = page.locator(`[data-focus-probe="${i}"]`);
        const box = await el.boundingBox().catch(() => null);
        if (!box || box.width < 4 || box.height < 4 || box.y > 3000) continue;
        const clip = { x: Math.max(0, box.x - PAD), y: Math.max(0, box.y - PAD), width: box.width + PAD * 2, height: box.height + PAD * 2 };
        const before = await page.screenshot({ clip }).catch(() => null);
        if (!before) continue;
        await el.evaluate(e => e.focus());
        await page.waitForTimeout(60);
        const after = await page.screenshot({ clip }).catch(() => null);
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        if (!after) continue;
        const frac = changed(before, after);
        if (frac < THRESHOLD) {
          const d = await el.evaluate(e => `<${e.tagName.toLowerCase()}${e.className ? ' class="' + String(e.className).slice(0, 24) + '"' : ''}> "${(e.getAttribute('aria-label') || e.innerText || e.placeholder || '').trim().slice(0, 26)}"`);
          weak.push(d);
        }
      }
      if (weak.length) bad += weak.length;
      console.log(`  ${label.padEnd(20)} ${theme.padEnd(6)} ${targets.length} focusable   ${weak.length ? weak.length + ' with NO visible focus change' : 'all show focus'}`);
      for (const w of weak.slice(0, 4)) console.log(`${' '.repeat(30)}${w}`);
      await ctx.close();
    }
  }
  await browser.close();
});
console.log(`\n  ${bad} element(s) show no visible change on focus.\n`);
process.exit(bad ? 1 : 0);
