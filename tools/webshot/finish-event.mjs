/**
 * Finish the marketing event through the REAL scorekeeper UI.
 *
 *   PC_CAPTURE_EMAIL=... PC_CAPTURE_PASSWORD=... node tools/webshot/finish-event.mjs
 *
 * Deliberately drives the shipping scorekeeper page — clicking its own +1 and
 * "Submit final score" controls — rather than calling the RPC directly or
 * writing to the table. Every point below is a real rally recorded the way a
 * scorekeeper at a desk records it, and each one is its own request, so the
 * score events get genuinely distinct timestamps.
 *
 * Captures the ending as it happens: mid-match, match point, the completed
 * scorekeeper state, and the final.
 *
 * scorekeeper.html confirms the final submit with a native confirm(). A
 * browser dialog blocks every subsequent command, so the handler is registered
 * BEFORE anything can trigger one.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { serveSite } from './lib.mjs';
import { EVENTS } from './scenes.mjs';

const EMAIL = process.env.PC_CAPTURE_EMAIL;
const PASSWORD = process.env.PC_CAPTURE_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set PC_CAPTURE_EMAIL / PC_CAPTURE_PASSWORD'); process.exit(2); }

const EVENT = EVENTS.T_MARKETING;
const SF2 = 'c2000002-0000-4000-8000-000000000002';
const FINAL = 'c2000002-0000-4000-8000-000000000003';

await mkdir(new URL('./out/', import.meta.url), { recursive: true });
const site = await serveSite();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Must be registered before any click that can open one.
page.on('dialog', async (d) => { console.log(`    [dialog] ${d.message()}`); await d.accept(); });

const shot = async (id) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: fileURLToPath(new URL(`./out/${id}.png`, import.meta.url)), fullPage: true });
  console.log(`    captured ${id}`);
};

const score = async () => {
  const t = await page.locator('.sk-score, .sk-pts, [data-score]').allTextContents().catch(() => []);
  return t.join(' ').replace(/\s+/g, ' ').trim();
};

/** Add `n` points to side `side` by clicking the page's own +1 button. */
const addPoints = async (side, n) => {
  for (let i = 0; i < n; i++) {
    await page.locator(`button[data-plus="${side}"]`).click();
    await page.waitForTimeout(450); // one request per rally
  }
};

const openMatch = async (matchId) => {
  await page.goto(`${site.origin}/scorekeeper.html?t=${EVENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const pick = page.locator(`button[data-pick="${matchId}"]`);
  await pick.waitFor({ state: 'visible', timeout: 20000 });
  await pick.click();
  await page.waitForTimeout(1500);
};

try {
  // ---- sign in -----------------------------------------------------------
  await page.goto(`${site.origin}/organizer.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pcAuthEmail').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#pcAuthEmail').fill(EMAIL);
  await page.locator('#pcAuthPw').fill(PASSWORD);
  await page.locator('#pcAuthGo').click();
  await page.locator('#pcAuthEmail').waitFor({ state: 'detached', timeout: 30000 });
  console.log('  signed in');

  // ---- semifinal 2: 7-5 -> 11-7 -----------------------------------------
  console.log('  semifinal 2');
  await openMatch(SF2);
  await shot('sk-01-in-progress');          // the live state, 7-5

  await addPoints(2, 2);                    // 7-7
  await addPoints(1, 3);                    // 10-7  match point
  console.log(`    at match point: ${await score()}`);
  await shot('sk-02-match-point');

  await addPoints(1, 1);                    // 11-7
  console.log(`    final point: ${await score()}`);
  await page.locator('#finalBtn').click();  // confirm() handled above
  await page.waitForTimeout(2500);
  await shot('sk-03-submitted');
  console.log('  semifinal 2 complete');

  // ---- final: winner advanced automatically ------------------------------
  console.log('  final');
  await openMatch(FINAL);
  const start = page.locator('#startBtn');
  if (await start.count()) { await start.click(); await page.waitForTimeout(1200); }
  await shot('sk-04-final-start');

  // A close final: 11-9.
  for (let i = 0; i < 9; i++) { await addPoints(1, 1); await addPoints(2, 1); }  // 9-9
  await addPoints(1, 2);                    // 11-9
  console.log(`    final score: ${await score()}`);
  await shot('sk-05-final-point');

  await page.locator('#finalBtn').click();
  await page.waitForTimeout(2500);
  await shot('sk-06-final-submitted');
  console.log('  final complete — champion decided');
} catch (err) {
  console.log(`  FAILED: ${err.message.split('\n')[0]}`);
  await browser.close(); site.close();
  process.exit(1);
}

await browser.close();
site.close();
console.log('\n  event finished through the real scorekeeper');
