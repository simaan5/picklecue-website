/**
 * Phase 2 — CAPTURE.
 *
 *   node tools/webshot/capture.mjs [sceneId ...]
 *
 * Replays the committed fixtures into the REAL pages and screenshots them.
 * No credentials, no network, deterministic: the same fixtures produce the
 * same pixels on any machine.
 *
 * FAIL-CLOSED. If the page asks for something the fixture does not contain,
 * the request is aborted and the scene fails. It never falls through to live
 * production and never renders a half-empty page that would silently become a
 * marketing screenshot showing an empty state. This mirrors the iOS rule in
 * CLAUDE.md §10: missing fixture -> refuse to render, never fall back.
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { serveSite, fixtureKey, sha256, SUPABASE_HOST } from './lib.mjs';
import { SCENES, VIEWPORTS } from './scenes.mjs';

const OUT = new URL('./out/', import.meta.url);
const only = process.argv.slice(2);
const scenes = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;

await mkdir(OUT, { recursive: true });
const have = new Set(
  (await readdir(new URL('./fixtures/', import.meta.url)).catch(() => []))
    .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
);

const site = await serveSite();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const manifest = [];
let failures = 0;

for (const scene of scenes) {
  process.stdout.write(`  ${scene.id.padEnd(22)} `);
  if (!have.has(scene.id)) { console.log('FAIL  no fixture — run record.mjs'); failures++; continue; }

  const doc = JSON.parse(
    await readFile(new URL(`./fixtures/${scene.id}.json`, import.meta.url), 'utf8'),
  );
  if (sha256(JSON.stringify(doc.exchanges)) !== doc.contentSHA256) {
    console.log('FAIL  fixture hash mismatch — hand-edited, not trusted');
    failures++; continue;
  }

  const ctx = await browser.newContext({ ...VIEWPORTS[scene.viewport] });
  const page = await ctx.newPage();
  const missing = [];

  await ctx.route(`**://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes('/rest/v1/')) {
      // Realtime websockets / auth. The live page treats an unavailable
      // socket as "reconnecting" and still renders its snapshot, which is a
      // real state, so aborting here is safe and keeps captures offline.
      return route.abort();
    }
    const hit = doc.exchanges[fixtureKey(req.method(), url, req.postData())];
    if (!hit) { missing.push(`${req.method()} ${new URL(url).pathname}`); return route.abort(); }
    return route.fulfill({
      status: hit.status,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: hit.body,
    });
  });

  const qs = new URLSearchParams(scene.query).toString();
  try {
    await page.goto(`${site.origin}/${scene.page}${qs ? `?${qs}` : ''}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    // The page renders from the snapshot; wait for real content, not a timer.
    await page.waitForFunction(
      () => { const m = document.getElementById('main'); return m && m.children.length > 0; },
      { timeout: 15000 },
    );
    // Real interactions against the real page, when a scene's payoff state is
    // only reachable by using it.
    //
    // A click that changes nothing must FAIL, not quietly produce a duplicate
    // of the pre-click screenshot. A selector that silently stops matching is
    // exactly how a stale capture survives a redesign.
    for (const step of scene.actions || []) {
      const before = await page.locator('#main').innerHTML();
      if (step.click) await page.locator(step.click).first().click();
      await page.waitForTimeout(300);
      const after = await page.locator('#main').innerHTML();
      if (before === after) throw new Error(`action changed nothing: ${JSON.stringify(step)}`);
    }

    await page.waitForTimeout(400); // fonts + avatar images settle

    if (missing.length) throw new Error(`unfixtured request: ${[...new Set(missing)].join(', ')}`);

    const file = fileURLToPath(new URL(`./out/${scene.id}.png`, import.meta.url));
    await page.screenshot({ path: file, fullPage: scene.viewport !== 'phone' });
    const h = (await page.title()) || '';
    manifest.push({ id: scene.id, feature: scene.feature, label: scene.label,
                    viewport: scene.viewport, page: scene.page, title: h });
    console.log('OK');
  } catch (err) {
    failures++;
    console.log(`FAIL  ${err.message.split('\n')[0]}`);
  }
  await ctx.close();
}

await browser.close();
site.close();
await writeFile(new URL('./out/manifest.json', import.meta.url),
  `${JSON.stringify(manifest, null, 2)}\n`);
console.log(failures ? `\n${failures} scene(s) failed` : `\n${manifest.length} capture(s) written`);
process.exit(failures ? 1 : 0);
