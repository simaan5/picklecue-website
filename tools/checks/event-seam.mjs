#!/usr/bin/env node
/* The seam cover, under a fake browser clock.
 *
 * The seam script exists for the hours between an event ending and the next
 * deploy. It has exactly two jobs: stay silent before endsAt, and speak after.
 *
 * It failed the first one, invisibly. The end time was written into the page
 * through an HTML-comment marker INSIDE a JavaScript string literal — and HTML
 * comments are not comments inside <script>, they are characters. `new
 * Date('<!-- ... -->2026-08-29T20:00:00-07:00<!-- ... -->')` is an Invalid
 * Date, `new Date() <= InvalidDate` is false, so the guard never returned and
 * the page announced "This event has taken place" FOUR DAYS EARLY, directly
 * above a paragraph saying the event was still scheduled.
 *
 * Neither gate could catch it: the markup was right, the state was right, the
 * copy was right. Only a browser with a clock shows it. So: a browser with a
 * clock.
 */
import { withSite } from '../measure/lib.mjs';

const PATH = '/events/pickle-for-a-purpose/';
/* endsAt is 2026-08-29T20:00:00-07:00 = 2026-08-30T03:00:00Z */
const CLOCKS = [
  ['2026-08-26T12:00:00Z', false, 'three days before'],
  ['2026-08-30T02:59:00Z', false, 'one minute before the end'],
  ['2026-08-30T03:01:00Z', true,  'one minute after the end'],
  ['2026-09-05T12:00:00Z', true,  'a week after'],
];

let bad = 0;
await withSite(async ({ origin, browser }) => {
  console.log('\n  SEAM BANNER — fake browser clock\n');
  for (const [iso, wantBanner, label] of CLOCKS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`{
      const fixed = new Date(${JSON.stringify(iso)}).valueOf();
      const R = Date;
      Date = class extends R { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
      Date.parse = R.parse; Date.UTC = R.UTC;
    }`);
    const page = await ctx.newPage();
    await page.goto(origin + PATH, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const got = await page.evaluate(() => ({
      banner: !!document.querySelector('.event-ended-banner'),
      overClass: document.documentElement.classList.contains('event-over'),
      sticky: !!document.getElementById('stickyCta'),
      clock: new Date().toISOString(),
    }));
    const ok = got.banner === wantBanner && got.overClass === wantBanner;
    if (!ok) bad++;
    console.log(`    ${label.padEnd(26)} clock=${got.clock.slice(0, 16)}  banner=${String(got.banner).padEnd(5)} event-over=${String(got.overClass).padEnd(5)} sticky=${String(got.sticky).padEnd(5)} want banner=${String(wantBanner).padEnd(5)} ${ok ? 'ok' : '<-- WRONG'}`);
    await ctx.close();
  }
});
/* And the other half: once the page has actually been REBUILT as ended, the
   seam must stand down. Its .event-over rules hide .limited — which in the
   built ended state holds the paragraph explaining the event is over. Build
   the ended page for real, serve it, and read what a browser gets. */
{
  const { execFileSync } = await import('node:child_process');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ROOT } = await import('../measure/lib.mjs');
  const files = ['events/pickle-for-a-purpose/index.html', 'community.html'].map(f => [join(ROOT, f), readFileSync(join(ROOT, f), 'utf8')]);
  try {
    execFileSync('node', ['tools/build-event.mjs', 'pickle-for-a-purpose', '--now', '2026-09-05T12:00:00Z'], { cwd: ROOT, stdio: 'ignore' });
    await withSite(async ({ origin, browser }) => {
      console.log('  BUILT ENDED PAGE — the seam must stand down, not fight the built copy\n');
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(`{
        const fixed = new Date('2026-09-05T12:00:00Z').valueOf();
        const R = Date;
        Date = class extends R { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
        Date.parse = R.parse; Date.UTC = R.UTC;
      }`);
      const page = await ctx.newPage();
      await page.goto(origin + PATH, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const note = document.querySelector('.limited');
        return {
          state: document.body.dataset.eventState,
          duplicateBanner: !!document.querySelector('.event-ended-banner'),
          overClass: document.documentElement.classList.contains('event-over'),
          noteVisible: !!(note && note.offsetParent !== null),
          noteText: note ? note.textContent.trim().slice(0, 58) : null,
        };
      });
      const ok = r.state === 'ended' && !r.duplicateBanner && !r.overClass && r.noteVisible;
      if (!ok) bad++;
      console.log(`    state=${r.state}  seam banner=${r.duplicateBanner}  .event-over=${r.overClass}  pricing note visible=${r.noteVisible}  ${ok ? 'ok' : '<-- WRONG'}`);
      console.log(`    note reads: "${r.noteText}…"\n`);
      await ctx.close();
    });
  } finally {
    for (const [f, body] of files) writeFileSync(f, body);
    execFileSync('node', ['tools/build-event.mjs', 'pickle-for-a-purpose'], { cwd: ROOT, stdio: 'ignore' });
  }
}

if (bad) { console.error(`\n  ${bad} clock(s) wrong.\n`); process.exit(1); }
console.log('\n  Seam banner silent before endsAt, present after.\n');
