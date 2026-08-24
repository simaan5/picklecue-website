import { chromium } from 'playwright-core';
import { serveSite } from './lib.mjs';
const site = await serveSite();
const b = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name,w,h,theme] of [['home-light',1440,900,'light'],['home-dark',1440,900,'dark'],['home-phone',402,874,'light']]) {
  const c = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1, colorScheme:theme });
  const p = await c.newPage();
  await p.goto(`${site.origin}/index.html`, { waitUntil:'networkidle', timeout:45000 });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(900);
  await p.screenshot({ path:`/tmp/${name}.png`, fullPage:true });
  console.log(`  ${name.padEnd(12)} height=${await p.evaluate(()=>document.body.scrollHeight)}px  h-overflow=${await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)}`);
  await c.close();
}
await b.close(); site.close();
