/**
 * Authenticated LIVE capture — organizer control room, check-in desk,
 * scorekeeper.
 *
 *   PC_CAPTURE_EMAIL=... PC_CAPTURE_PASSWORD=... node tools/webshot/capture-auth.mjs
 *
 * WHY THIS IS SEPARATE FROM capture.mjs
 *
 * The public pages are captured by replaying committed fixtures, which keeps
 * them deterministic and offline. These pages cannot work that way without
 * storing an authenticated session: they call /auth/v1/* and their responses
 * carry access and refresh tokens plus the account email. Committing that to a
 * repo to make screenshots reproducible would be a bad trade.
 *
 * So this tool signs in for real, drives the real authenticated pages against
 * production, screenshots, and writes NOTHING but PNGs. No fixture, no token,
 * no credential ever touches the working tree.
 *
 * Credentials come from the environment. They are never defaulted, never
 * logged, and never written to the manifest.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { serveSite } from './lib.mjs';
import { EVENTS } from './scenes.mjs';

const EMAIL = process.env.PC_CAPTURE_EMAIL;
const PASSWORD = process.env.PC_CAPTURE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('set PC_CAPTURE_EMAIL and PC_CAPTURE_PASSWORD');
  process.exit(2);
}

const EVENT = EVENTS.T_MARKETING;
const EVENT_NAME = 'Foothill Fall Shootout';
const OUT = new URL('./out/', import.meta.url);
await mkdir(OUT, { recursive: true });

const site = await serveSite();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const shots = [];
let failures = 0;

const shot = async (id, opts = {}) => {
  const file = fileURLToPath(new URL(`./out/${id}.png`, import.meta.url));
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, fullPage: opts.fullPage !== false });
  shots.push(id);
  console.log(`  ${id.padEnd(24)} OK`);
};

try {
  // ---- sign in through the product's own auth card ------------------------
  await page.goto(`${site.origin}/organizer.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pcAuthEmail').waitFor({ state: 'visible', timeout: 20000 });
  await shot('org-signin', { fullPage: false });

  await page.locator('#pcAuthEmail').fill(EMAIL);
  await page.locator('#pcAuthPw').fill(PASSWORD);
  await page.locator('#pcAuthGo').click();

  // Signed in when the organizer's event list replaces the auth card.
  await page.locator('#pcAuthEmail').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1500);

  // ---- event list --------------------------------------------------------
  await shot('org-events');

  // ---- CRM / player book (lives on the list page, across all events) ------
  const pbList = page.locator('#playerBookBtn');
  if (await pbList.count()) {
    await pbList.click();
    await page.waitForTimeout(1800);
    await shot('org-player-book');
    await page.goto(`${site.origin}/organizer.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  // ---- control room ------------------------------------------------------
  // The event title is a heading, not a control — clicking it does nothing.
  // Open the row's own "Manage" button, scoped to this event's row so a
  // reordered list cannot silently open the wrong event.
  // Address the exact event by id rather than by row position or label text,
  // so a reordered list cannot open the wrong control room.
  const manage = page.locator(`button[data-open="t:${EVENT}"]`);
  await manage.waitFor({ state: 'visible', timeout: 20000 });
  await manage.click();
  await page.waitForTimeout(3000);

  // Prove we actually left the list.
  if (await page.locator('text=Your events').count()) {
    throw new Error('still on the event list — Manage did not open the control room');
  }
  await shot('org-control-room');

  // ---- QR / short code panel --------------------------------------------
  const qr = page.locator('#qrBtn');
  if (await qr.count()) {
    await qr.click();
    await page.waitForTimeout(900);
    await shot('org-qr-poster');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }

  // ---- CRM / player book -------------------------------------------------
  const pb = page.locator('#playerBookBtn');
  if (await pb.count()) {
    await pb.click();
    await page.waitForTimeout(1400);
    await shot('org-player-book');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }

  // ---- check-in desk -----------------------------------------------------
  await page.goto(`${site.origin}/checkin.html?t=${EVENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot('org-checkin');

  // ---- scorekeeper -------------------------------------------------------
  await page.goto(`${site.origin}/scorekeeper.html?t=${EVENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot('org-scorekeeper');

  // The scoring pad itself is behind the row's Score button — that is the
  // screen a scorekeeper actually spends the match looking at.
  const scoreBtn = page.getByRole('button', { name: /^score$/i }).first();
  if (await scoreBtn.count()) {
    await scoreBtn.click();
    await page.waitForTimeout(1600);
    await shot('org-scorekeeper-pad');
  }
} catch (err) {
  failures++;
  console.log(`  FAILED: ${err.message.split('\n')[0]}`);
}

await writeFile(new URL('./out/auth-manifest.json', import.meta.url),
  `${JSON.stringify({ event: EVENT, event_name: EVENT_NAME, shots }, null, 2)}\n`);

await browser.close();
site.close();
console.log(failures ? '\nauth capture failed' : `\n${shots.length} authenticated capture(s)`);
process.exit(failures ? 1 : 0);
