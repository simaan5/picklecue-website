/**
 * Phase 1 — RECORD.
 *
 *   node tools/webshot/record.mjs [sceneId ...]
 *
 * Drives the real pages against real production Supabase and saves every
 * /rest/v1/* exchange verbatim, then scrubs real identities out and writes the
 * result to tools/webshot/fixtures/.
 *
 * Run this only when the product's data shape changes. Day to day you want
 * capture.mjs, which replays what this produced and needs no network.
 *
 * The scrub gate is hard: if a recorded response contains a name this pipeline
 * does not know how to replace, the run FAILS rather than writing a fixture.
 * That is deliberate — a silent pass would put a real person's name into
 * marketing material.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import {
  serveSite, fixtureKey, skeleton, scrub, alignAvatars, assertClean, sha256,
  SUPABASE_HOST,
} from './lib.mjs';
import { SCENES, VIEWPORTS } from './scenes.mjs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const personas = JSON.parse(
  await readFile(new URL('./personas.json', import.meta.url), 'utf8'),
);

const only = process.argv.slice(2);
const scenes = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;
if (!scenes.length) { console.error('no matching scenes'); process.exit(1); }

await mkdir(FIXTURES, { recursive: true });
const site = await serveSite();
const browser = await chromium.launch({ channel: 'chrome', headless: true });

let failures = 0;

for (const scene of scenes) {
  const ctx = await browser.newContext({ ...VIEWPORTS[scene.viewport] });
  const page = await ctx.newPage();
  const exchanges = new Map();

  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes(SUPABASE_HOST) || !url.includes('/rest/v1/')) return;
    const req = res.request();
    let body;
    try { body = await res.text(); } catch { return; }
    exchanges.set(fixtureKey(req.method(), url, req.postData()), {
      status: res.status(),
      body,
    });
  });

  const qs = new URLSearchParams(scene.query).toString();
  const url = `${site.origin}/${scene.page}${qs ? `?${qs}` : ''}`;
  process.stdout.write(`  ${scene.id.padEnd(22)} `);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Give realtime/late RPCs a beat to land before we stop listening.
    await page.waitForTimeout(1200);

    if (!exchanges.size) throw new Error('no Supabase exchanges recorded');

    // Scrub every recorded body, asserting the shape is untouched.
    const clean = {};
    for (const [key, ex] of exchanges) {
      let outBody = ex.body;
      if (ex.body && (ex.body.startsWith('{') || ex.body.startsWith('['))) {
        const parsed = JSON.parse(ex.body);
        const before = JSON.stringify(skeleton(parsed));
        const scrubbed = alignAvatars(scrub(parsed, personas), personas);
        const after = JSON.stringify(skeleton(scrubbed));
        if (before !== after) {
          throw new Error(`scrub changed response SHAPE for ${key}`);
        }
        outBody = JSON.stringify(scrubbed);
      }
      assertClean(outBody, personas, `${scene.id} ${key}`);
      clean[key] = { status: ex.status, body: outBody };
    }

    const doc = {
      scene: scene.id,
      page: scene.page,
      query: scene.query,
      recorded_at: new Date().toISOString(),
      source: 'production Supabase, anon key; identities rewritten via personas.json',
      exchanges: clean,
    };
    doc.contentSHA256 = sha256(JSON.stringify(doc.exchanges));
    await writeFile(
      new URL(`./fixtures/${scene.id}.json`, import.meta.url),
      `${JSON.stringify(doc, null, 2)}\n`,
    );
    console.log(`OK  ${exchanges.size} exchange(s)`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${err.message}`);
  }
  await ctx.close();
}

await browser.close();
site.close();
console.log(failures ? `\n${failures} scene(s) failed` : '\nall scenes recorded');
process.exit(failures ? 1 : 0);
