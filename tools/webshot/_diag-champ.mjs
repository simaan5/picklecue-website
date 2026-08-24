import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { serveSite, fixtureKey, SUPABASE_HOST } from './lib.mjs';

const doc = JSON.parse(await readFile(new URL('./fixtures/mkt-results-phone.json', import.meta.url),'utf8'));
const site = await serveSite();
const b = await chromium.launch({ channel:'chrome', headless:true });
const c = await b.newContext({ viewport:{width:402,height:874}, deviceScaleFactor:2 });
const p = await c.newPage();
p.on('console', m => { if (m.type()==='error') console.log('  [console error]', m.text().slice(0,120)); });
p.on('requestfailed', r => console.log('  [req failed]', r.url().slice(0,90), r.failure()?.errorText));
await c.route(`**://${SUPABASE_HOST}/**`, async (route) => {
  const req = route.request(); const url = req.url();
  if (!url.includes('/rest/v1/')) return route.abort();
  const hit = doc.exchanges[fixtureKey(req.method(), url, req.postData())];
  return hit ? route.fulfill({status:hit.status, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:hit.body}) : route.abort();
});
await p.goto(`${site.origin}/live.html?t=c1000002-0000-4000-8000-000000000001&view=results`, {waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('main')?.children.length>0, {timeout:15000});
await p.waitForTimeout(1500);

const info = await p.evaluate(() => {
  const q = s => document.querySelector(s);
  const box = el => el ? (r => ({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(el.getBoundingClientRect()) : null;
  const champ = q('.bv-champion');
  return {
    hasChampion: !!champ,
    championBox: box(champ),
    championText: champ ? champ.innerText.replace(/\s+/g,' ').trim().slice(0,90) : null,
    championHTML: champ ? champ.innerHTML.slice(0,200) : null,
    imgs: [...(champ?.querySelectorAll('img')||[])].map(i=>({src:i.src.slice(-46), w:i.naturalWidth, h:i.naturalHeight, complete:i.complete})),
    sectionBox: box(q('#main section')),
    mainBox: box(q('#main')),
    barBox: box(q('.bar')),
  };
});
console.log(JSON.stringify(info,null,2));
await b.close(); site.close();
