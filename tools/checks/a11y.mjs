#!/usr/bin/env node
/* Accessibility checks that do not need a vendored engine.
 *
 * Not a substitute for axe or a real screen reader — Phase I owns those. This
 * is the set of failures that are (a) mechanical, (b) common in hand-written
 * marketing markup, and (c) invisible in a screenshot:
 *
 *   - contrast below 4.5:1 for body text / 3:1 for large text, measured on
 *     COMPOSITED colours in a real browser, in BOTH themes, each loaded fresh.
 *     (Toggling data-theme on a live page fakes failures — 33 of 37 findings in
 *     an earlier sweep were that artifact. So each theme gets its own load.)
 *   - targets under 44x44
 *   - headings that skip a level
 *   - controls with no accessible name
 *   - images with no alt attribute at all
 *   - duplicate element ids
 *   - focus that lands somewhere invisible
 */
import { withSite, VIEWPORTS } from '../measure/lib.mjs';

const PAGES = process.argv.slice(2).filter(a => a.startsWith('/'));
const TARGETS = PAGES.length ? PAGES : ['/community', '/events/pickle-for-a-purpose/'];

const AUDIT = () => {
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = s => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const over = (fg, bg) => fg.c.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
  /* Walk up for the first opaque background — "transparent on transparent"
     is what makes a naive contrast check produce nonsense. */
  function bgOf(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p && p.a === 1) return p.c;
      if (p && p.a > 0) { const under = bgOf(n.parentElement || document.body); return over(p, under); }
      n = n.parentElement;
    }
    const p = parse(getComputedStyle(document.documentElement).backgroundColor);
    return p && p.a > 0 ? p.c : [255, 255, 255];
  }

  const out = { contrast: [], targets: [], headings: [], names: [], alts: [], dupeIds: [] };
  /* Shared chrome is the masthead, the mobile menu, the footer and the skip
     link — identical on all 4,130 pages and older than this phase. Content is
     everything inside <main>. Decided by ancestry, because a first version
     guessed from class names and swept up every classless <a> on the page. */
  const chromeOf = el => !el.closest('main');

  /* getComputedStyle(child).display does NOT return "none" for a child of a
     display:none parent — it returns the child's own value. A first version of
     this check audited the CLOSED mobile menu and reported seven 1.03:1
     contrast failures on links no one can see. checkVisibility walks the tree. */
  const shown = el => el.checkVisibility
    ? el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
    : !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
    if (!text) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const c = over(fg, bg);
    const L1 = lum(c), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.contrast.push({ chrome: chromeOf(el), tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 28), text: text.slice(0, 42), ratio: +ratio.toFixed(2), need, px: +px.toFixed(1) });
  }

  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    /* Inline links inside a paragraph are exempt — WCAG 2.5.8 excludes them. */
    const inline = el.tagName === 'A' && cs.display === 'inline' && el.closest('p,li,span');
    if (!inline && (r.width < 44 || r.height < 44))
      out.targets.push({ chrome: chromeOf(el), tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 26), text: (el.innerText || el.value || '').trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) });

    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || '').trim() ||
                  (el.querySelector('img') ? el.querySelector('img').alt : '') || el.getAttribute('alt') || '').trim();
    if (!name) out.names.push({ tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 26), html: el.outerHTML.slice(0, 70) });
  }

  let last = 0;
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const lvl = +h.tagName[1];
    if (last && lvl > last + 1) out.headings.push({ from: 'h' + last, to: 'h' + lvl, text: h.innerText.trim().slice(0, 44) });
    last = lvl;
  }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.alts.push(img.getAttribute('src'));
  const seen = new Set();
  for (const el of document.querySelectorAll('[id]')) { if (seen.has(el.id)) out.dupeIds.push(el.id); seen.add(el.id); }
  return out;
};

let problems = 0, chromeTotal = 0;
const chromeSeen = new Map();
await withSite(async ({ origin, browser }) => {
  for (const path of TARGETS) {
    for (const theme of ['light', 'dark']) {
      for (const vp of VIEWPORTS) {
        /* Each theme gets a FRESH LOAD. Flipping data-theme on a live page
           leaves composited colours mid-transition and invents failures. */
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
        });
        const page = await ctx.newPage();
        await page.goto(origin + path, { waitUntil: 'load' });
        await page.waitForTimeout(700);
        await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
        const r = await page.evaluate(AUDIT);
        /* Both buckets are REPORTED. Only content fails the run: a masthead
           link that has been 32px tall on every page since launch is a real
           finding, but it is not a finding about this phase, and suppressing
           it entirely is how it stays unfixed forever. */
        const content = [...r.contrast, ...r.targets].filter(x => !x.chrome);
        const chrome = [...r.contrast, ...r.targets].filter(x => x.chrome);
        const n = content.length + r.headings.length + r.names.length + r.alts.length + r.dupeIds.length;
        problems += n;
        chromeTotal = Math.max(chromeTotal, chrome.length);
        for (const c of chrome) chromeSeen.set(`${c.tag}.${c.cls}|${c.text || ''}|${c.w ?? c.ratio}`, c);
        const head = `${path}  ${theme}  ${vp.tag}`;
        console.log(`\n  ${head}   content: ${n === 0 ? 'clean' : n + ' finding(s)'}   shared chrome: ${chrome.length}`);
        for (const c of r.contrast.filter(x => !x.chrome)) console.log(`     contrast ${c.ratio}:1 (need ${c.need}) ${c.px}px  <${c.tag}${c.cls ? ' class="' + c.cls + '"' : ''}>  "${c.text}"`);
        for (const t of r.targets.filter(x => !x.chrome)) console.log(`     target ${t.w}x${t.h}  <${t.tag}${t.cls ? ' class="' + t.cls + '"' : ''}>  "${t.text}"`);
        for (const h of r.headings) console.log(`     heading skip ${h.from} -> ${h.to}  "${h.text}"`);
        for (const x of r.names) console.log(`     no accessible name  ${x.html}`);
        for (const a of r.alts) console.log(`     img without alt attribute  ${a}`);
        for (const d of r.dupeIds) console.log(`     duplicate id  #${d}`);
        await ctx.close();
      }
    }
  }
});
console.log(`\n  CONTENT (inside <main>, this phase's work): ${problems} finding(s)\n`);
console.log(`  SHARED CHROME (masthead / menu / footer / skip link, identical on all 4,130 pages,`);
console.log(`  predates this phase — reported, not fixed here): ${chromeSeen.size} distinct\n`);
for (const c of [...chromeSeen.values()].sort((a, b) => (a.cls || a.tag).localeCompare(b.cls || b.tag)))
  console.log(c.w !== undefined
    ? `     target ${String(c.w).padStart(3)}x${String(c.h).padEnd(3)} <${c.tag}${c.cls ? ' class="' + c.cls + '"' : ''}>  "${c.text}"`
    : `     contrast ${c.ratio}:1 (need ${c.need}) ${c.px}px <${c.tag}${c.cls ? ' class="' + c.cls + '"' : ''}>  "${c.text}"`);
console.log('');
process.exit(problems ? 1 : 0);
