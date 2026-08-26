import { withSite } from '../measure/lib.mjs';
const PAGES = ['/community','/events/pickle-for-a-purpose/','/support','/terms','/privacy','/licenses','/404','/bracket/','/organizer-templates'];
await withSite(async ({ origin, browser }) => {
  console.log('\n  page                              preloads Fraunces  renders Fraunces  wasted');
  console.log('  ' + '-'.repeat(84));
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    let bytes = 0;
    const pend = [];
    page.on('response', r => { if (/fraunces/.test(r.url())) pend.push(r.body().then(b => bytes += b.length, () => {})); });
    const resp = await page.goto(origin + p, { waitUntil: 'load' }).catch(() => null);
    if (!resp || resp.status() !== 200) { console.log(`  ${p.padEnd(33)} (${resp ? resp.status() : 'no response'})`); await ctx.close(); continue; }
    await page.waitForTimeout(900);
    await Promise.all(pend);
    const uses = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (!el.checkVisibility || !el.checkVisibility()) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        if (/Fraunces/i.test(getComputedStyle(el).fontFamily)) return true;
      }
      return false;
    });
    const preloads = await page.evaluate(() => !!document.querySelector('link[rel="preload"][href*="fraunces"]'));
    console.log(`  ${p.padEnd(33)} ${String(preloads).padEnd(18)} ${String(uses).padEnd(17)} ${uses ? '-' : Math.round(bytes / 1024) + ' KB'}`);
    await ctx.close();
  }
});
