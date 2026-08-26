import { withSite } from '../measure/lib.mjs';
import { chromium } from 'playwright-core';
const TARGETS = [
  ['/', 390, 'light', ['.strip-t', '.strip']],
  ['/', 1440, 'light', ['#ch-game .chapter-no', '#ch-game h3', '#ch-game p']],
  ['/', 1440, 'dark', ['#ch-game .chapter-no', '#ch-game h3', '#ch-game p', '.chapter.is-active p', '.chapter.is-active h3']],
  ['/courts/', 390, 'light', ['form button[type="submit"]', 'form']],
  ['/courts/', 390, 'dark', ['form button[type="submit"]']],
  ['/404', 1440, 'light', ['.site']],
  ['/demo/', 390, 'dark', ['.tour-intro-card .tour-meta', '.weather-feels', '.pill-purple']],
];
const lum = c => { const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return .2126*r+.7152*g+.0722*b; };
await withSite(async ({ origin }) => {
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const [path, w, theme, sels] of TARGETS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, colorScheme: theme });
    const p = await ctx.newPage();
    await p.goto(origin + path, { waitUntil: 'load' });
    await p.waitForTimeout(700);
    await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
    const r = await p.evaluate(sels => sels.map(s => {
      const el = document.querySelector(s);
      if (!el) return { s, missing: true };
      const cs = getComputedStyle(el);
      const parse = x => { const m = x.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { c: [+m[1],+m[2],+m[3]], a: m[4]===undefined?1:+m[4] } : null; };
      let n = el, bg = null;
      while (n && !bg) { const q = parse(getComputedStyle(n).backgroundColor); if (q && q.a === 1) bg = q.c; n = n.parentElement; }
      return { s, color: cs.color, bg: cs.backgroundColor, opacity: cs.opacity, fontSize: cs.fontSize, resolvedBg: bg, parsedFg: parse(cs.color) };
    }), sels);
    console.log(`\n  ${path}  ${w}  ${theme}`);
    for (const x of r) {
      if (x.missing) { console.log(`     ${x.s}  NOT FOUND`); continue; }
      let ratio = '';
      if (x.parsedFg && x.resolvedBg) {
        const o = +x.opacity;
        const comp = x.parsedFg.c.map((v,i)=> v*x.parsedFg.a*o + x.resolvedBg[i]*(1-x.parsedFg.a*o));
        const L1 = lum(comp), L2 = lum(x.resolvedBg);
        ratio = ((Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05)).toFixed(2) + ':1';
      }
      console.log(`     ${x.s.padEnd(32)} color=${x.color.padEnd(22)} opacity=${x.opacity.padEnd(5)} size=${x.fontSize.padEnd(8)} bg=${JSON.stringify(x.resolvedBg)}  composited ${ratio}`);
    }
    await ctx.close();
  }
  await b.close();
});
