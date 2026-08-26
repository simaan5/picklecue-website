#!/usr/bin/env node
/* The three event utilities, on the real page.
 *
 * Share is progressive enhancement: the button ships hidden and only appears
 * when the browser can do something. So the check runs THREE capability
 * profiles — Web Share, clipboard-only, and neither — and asserts the button
 * is visible in the first two and absent from the accessibility tree in the
 * third. A share control that cannot share is worse than no control.
 */
import { withSite } from '../measure/lib.mjs';

const PATH = '/events/pickle-for-a-purpose/';
/* `delete navigator.share` is a no-op when the property lives on
   Navigator.prototype, which is how a first version of this check reported the
   button visible under all three profiles — including the one where nothing
   should reveal it. Shadow with an own property instead. */
const set = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
const PROFILES = {
  'Web Share API':  { init: () => { const set = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); set('share', () => Promise.resolve()); set('clipboard', undefined); }, expect: 'Share' },
  'clipboard only': { init: () => { const set = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); set('share', undefined); set('clipboard', { writeText: () => Promise.resolve() }); }, expect: 'Link copied' },
  'neither':        { init: () => { const set = (k, v) => Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true }); set('share', undefined); set('clipboard', undefined); }, expect: null },
};

await withSite(async ({ origin, browser }) => {
  console.log('\n  SHARE BUTTON — capability profiles\n');
  let bad = 0;
  for (const [name, { init, expect }] of Object.entries(PROFILES)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.goto(origin + PATH, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const btn = page.locator('.ev-util-share');
    const visible = await btn.isVisible();
    let clicked = null;
    if (visible) {
      await btn.click();
      await page.waitForTimeout(150);
      clicked = (await btn.innerText()).trim();
    }
    const ok = expect === null ? !visible : (visible && clicked === expect);
    if (!ok) bad++;
    console.log(`    ${name.padEnd(16)} visible=${String(visible).padEnd(6)} after click: ${(clicked ?? '(n/a)').padEnd(13)} expected ${expect === null ? 'hidden' : JSON.stringify(expect)}  ${ok ? 'ok' : '<-- WRONG'}`);
    await ctx.close();
  }
  if (bad) { console.error(`\n  ${bad} share profile(s) behaved wrongly.\n`); process.exitCode = 1; }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(origin + PATH, { waitUntil: 'load' });
  console.log('\n  UTILITY ROW\n');
  for (const li of await page.locator('.ev-utils li > *').all()) {
    const box = await li.boundingBox();
    console.log(`    ${(await li.innerText()).trim().padEnd(18)} ${(await li.evaluate(e => e.tagName.toLowerCase() + (e.getAttribute('href') ? ' → ' + e.getAttribute('href') : ''))).padEnd(46)} ${box ? Math.round(box.height) + 'px tall' : 'hidden'}`);
  }
  const dupes = await page.locator('a[href*="maps.google.com"]').count();
  console.log(`\n    directions links on the page: ${dupes} (must be 1 — one interaction owner)`);
  const ics = await page.request.get(origin + PATH + 'pickle-for-a-purpose.ics');
  console.log(`    .ics fetch: ${ics.status()} ${ics.headers()['content-type']}, ${(await ics.body()).length} bytes\n`);
  await ctx.close();
});
