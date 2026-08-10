/**
 * Export the Pickle for a Purpose Instagram STORIES to 1080x1920 PNGs.
 *
 * Uses the same launcher as responsive.test.mjs (playwright-core with
 * channel:'chrome', no browser download needed).
 *
 * Usage:  node tests/export-stories.mjs
 * Output: images/social/pickle-for-a-purpose-story1..4.png
 *
 * Why a Node script rather than in-page canvas export: rasterising a DOM node
 * via <foreignObject> requires the cloned markup to be well-formed XML, which
 * HTML5 void tags (<img>, <br>) are not — the SVG parser rejects the document
 * and the export silently fails. Driving a real browser avoids the whole class
 * of problem and renders with the actual font stack.
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'images', 'social');
const SLIDES = ['st1', 'st2', 'st3', 'st4'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 2000 },
  deviceScaleFactor: 1,
});

await page.goto(`${base}/poster-p4p-stories.html`, { waitUntil: 'networkidle' });
// Neutralise the preview downscale so each slide rasterises at native 1080.
await page.addStyleTag({
  content: '.frame{transform:none !important} .slot{width:auto !important;height:auto !important}',
});
await page.evaluate(() => document.fonts.ready);

let failures = 0;
for (const id of SLIDES) {
  const el = page.locator(`#${id}`);
  const box = await el.boundingBox();
  if (!box) {
    console.error(`  ${id}: FAILED — element not found`);
    failures++;
    continue;
  }
  if (Math.round(box.width) !== 1080 || Math.round(box.height) !== 1920) {
    console.error(`  ${id}: FAILED — expected 1080x1920, got ${Math.round(box.width)}x${Math.round(box.height)}`);
    failures++;
    continue;
  }
  const file = join(OUT, `pickle-for-a-purpose-story${id.slice(2)}.png`);
  await el.screenshot({ path: file });
  console.log(`  ${id}: ${Math.round(box.width)}x${Math.round(box.height)} -> images/social/pickle-for-a-purpose-story${id.slice(2)}.png`);
}

await browser.close();
server.close();

if (failures) {
  console.error(`\n${failures} slide(s) failed to export.`);
  process.exit(1);
}
console.log(`\nExported ${SLIDES.length} slides to images/social/`);
