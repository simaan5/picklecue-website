/* Rebuild images/og-image.png from tests/og-image.source.html.
   Needs the site served on :8899 so /fonts.css and the brand mark resolve:
     python3 -m http.server 8899
     node tests/render-og.mjs
*/
import pw from 'playwright-core';
import { fileURLToPath } from 'node:url';
const { chromium } = pw;
const SRC = fileURLToPath(new URL('./og-image.source.html', import.meta.url));
const OUT = fileURLToPath(new URL('../images/og-image.png', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('file://' + SRC, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/og-2x.png' });
await browser.close();
console.log('Rendered /tmp/og-2x.png at 2400x1260.');
console.log(`Downscale to exactly 1200x630 (matches the og:image:width/height meta):
  python3 -c "from PIL import Image; Image.open('/tmp/og-2x.png').resize((1200,630), Image.LANCZOS).save('${OUT}', optimize=True)"`);
