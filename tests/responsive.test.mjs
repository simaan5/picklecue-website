/* Responsive regression tests for the PickleCue website shell.
   Run: npm test  (requires: npm i, plus Google Chrome installed — uses
   playwright-core with channel:'chrome', no browser download needed).

   Guards against the July 2026 mobile defects:
   - desktop-style header overflowing phone viewports (privacy/terms/support)
   - "Get early access" pill leaking above the header from the old
     translateY(-100%) :target mobile menu (homepage)
   - clipped legal-page SECTIONS sidebar / horizontal panning
*/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = [
  'index.html', 'privacy.html', 'terms.html', 'support.html',
  'organizer-templates.html', 'players.html', 'organizers.html',
  'clubs.html', '404.html', 'community.html',
  'events/pickle-for-a-purpose/index.html',
];
const WIDTHS = [320, 344, 360, 375, 390, 393, 402, 414, 430, 768, 820, 1024, 1280, 1440];
const MOBILE_MAX = 860;           // shell breakpoint: <=860 burger, >=861 desktop nav
const LEGAL = new Set(['privacy.html', 'terms.html']);

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function serve() {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      try {
        const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
        const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
        if (!file.startsWith(ROOT)) throw new Error('traversal');
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let failures = 0;
function check(cond, label) {
  if (cond) return;
  failures++;
  console.error('  ✗ ' + label);
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const pageName of PAGES) {
  for (const width of WIDTHS) {
    const mobile = width <= MOBILE_MAX;
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/${pageName}`, { waitUntil: 'load' });
    const tag = `${pageName}@${width}`;

    // 1. Never any horizontal overflow.
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      // Two shells are in play: the legacy pages use .masthead-logo + .btn-pill,
      // the V2 pages use a .brand lockup + .btn-primary. Accept either, so the
      // suite covers both instead of silently skipping the newer one.
      wordmark: !!document.querySelector('.masthead-logo img.masthead-wordmark, .masthead-logo img.wm-light, .masthead .brand'),
      burger: (e => e ? getComputedStyle(e).display !== 'none' : null)(document.querySelector('.masthead-burger')),
      // "Visible" means it actually occupies space and offers reachable links.
      // Some shells keep the <nav> displayed but hide every link inside it, so
      // reading display alone reports a desktop nav that no one can see.
      nav: (e => {
        if (!e) return null;
        if (getComputedStyle(e).display === 'none') return false;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return [...e.querySelectorAll('a')].some(a =>
          getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().width > 0);
      })(document.querySelector('.masthead-nav, .masthead nav[aria-label="Primary"]')),
      headerCta: (e => e ? getComputedStyle(e).display !== 'none' : null)(document.querySelector('.masthead .btn-pill:not(.btn-discord), .masthead .btn-primary')),
      menuHidden: (e => e ? e.hidden : null)(document.getElementById('siteMenu')),
      tocOpen: (e => e ? e.open : null)(document.querySelector('details.article-toc')),
    }));
    check(m.scrollWidth <= m.innerWidth, `${tag}: horizontal overflow (scrollWidth ${m.scrollWidth} > ${m.innerWidth})`);
    check(m.wordmark, `${tag}: approved wordmark missing from masthead`);

    if (m.burger !== null) {
      if (mobile) {
        check(m.burger === true, `${tag}: hamburger not visible at mobile width`);
        if (m.nav !== null) check(m.nav === false, `${tag}: desktop nav visible at mobile width`);
        if (m.headerCta !== null) check(m.headerCta === false, `${tag}: header CTA visible at mobile width`);
        check(m.menuHidden === true, `${tag}: site menu not hidden on load`);
      } else {
        check(m.burger === false, `${tag}: hamburger visible at desktop width`);
        if (m.nav !== null) check(m.nav === true, `${tag}: desktop nav hidden at desktop width`);
      }
    }

    // 2. Legal TOC: collapsed on mobile, expanded sidebar on desktop.
    if (LEGAL.has(pageName)) {
      check(m.tocOpen === !((width <= 960)), `${tag}: TOC open=${m.tocOpen}, expected ${!(width <= 960)}`);
    }

    // 3. Menu interaction + CTA fully inside viewport (mobile, one width per page).
    if (mobile && width === 390 && m.burger) {
      await page.click('.masthead-burger');
      await page.waitForTimeout(400);
      const menu = await page.evaluate(() => {
        const el = document.getElementById('siteMenu');
        const cta = el.querySelector('.btn-pill, .btn-primary');
        const r = cta && cta.getBoundingClientRect();
        return {
          open: !el.hidden,
          expanded: document.querySelector('.masthead-burger').getAttribute('aria-expanded'),
          hasCta: !!cta,
          ctaInside: !!r && r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth
            && r.bottom <= el.getBoundingClientRect().bottom,
          scrollable: el.scrollHeight <= el.clientHeight || getComputedStyle(el).overflowY === 'auto',
        };
      });
      check(menu.open, `${tag}: menu did not open`);
      check(menu.expanded === 'true', `${tag}: aria-expanded not true`);
      check(menu.hasCta, `${tag}: mobile menu has no primary CTA`);
      check(menu.ctaInside, `${tag}: menu CTA outside viewport/menu`);
      check(menu.scrollable, `${tag}: menu content can clip without scrolling`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
      const closed = await page.evaluate(() => document.getElementById('siteMenu').hidden);
      check(closed, `${tag}: Escape did not close menu`);
    }

    // 4. Theme toggle round-trip (one combo only).
    if (pageName === 'index.html' && width === 1440) {
      const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await page.click('#themeToggle');
      const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      check(before !== after && (after === 'light' || after === 'dark'), `${tag}: theme toggle did not switch (${before} -> ${after})`);
    }

    await ctx.close();
  }
  console.log(`✓ ${pageName}`);
}

await browser.close();
srv.close();

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log(`\nAll responsive checks passed: ${PAGES.length} pages × ${WIDTHS.length} widths`);
