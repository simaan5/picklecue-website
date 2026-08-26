#!/usr/bin/env node
/* Capture every lifecycle state, from controlled clocks rather than a calendar.
 *
 * The whole point of deriving the state is that Saturday night does not need a
 * human awake for it. Proving that means rendering all four states now — so
 * this builds the page at four --now values, screenshots each, and restores the
 * working tree afterwards. Nothing here waits for the event.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withSite, VIEWPORTS, ROOT } from '../measure/lib.mjs';

const OUT = join(ROOT, 'docs/evidence/phase-g');
mkdirSync(OUT, { recursive: true });

const STATES = [
  ['2026-08-20T12:00:00-07:00', '01-upcoming-unavailable', 'nine days out — the state today'],
  ['2026-08-29T09:00:00-07:00', '02-event-day',            'the morning of the event'],
  ['2026-08-29T19:59:00-07:00', '03-event-day-last-minute','one minute before it ends'],
  ['2026-08-29T20:30:00-07:00', '04-ended',                'half an hour after it ends'],
];

const TOUCHED = ['events/pickle-for-a-purpose/index.html', 'community.html'].map(f => join(ROOT, f));
const ICS = join(ROOT, 'events/pickle-for-a-purpose/pickle-for-a-purpose.ics');
const saved = TOUCHED.map(f => [f, readFileSync(f, 'utf8')]);
const savedIcs = existsSync(ICS) ? readFileSync(ICS, 'utf8') : null;

const rows = [];
try {
  for (const [now, name, label] of STATES) {
    execFileSync('node', ['tools/build-event.mjs', 'pickle-for-a-purpose', '--now', now], { cwd: ROOT, stdio: 'ignore' });
    const page = readFileSync(TOUCHED[0], 'utf8');
    const state = page.match(/<body[^>]*data-event-state="([a-z-]*)"/)[1];
    rows.push({
      now, name, label, state,
      offers: (page.match(/"@type": "Offer"/g) || []).length,
      sticky: /class="sticky-cta"/.test(page),
      utilities: /class="ev-utils"/.test(page),
      ics: existsSync(ICS),
      cta: [...new Set([...page.matchAll(/<!-- EVENT:CTA -->(.*?)<!-- \/EVENT:CTA -->/g)].map(m => m[1]))].join(' / '),
      status: (page.match(/<!-- EVENT:STATUS -->([\s\S]*?)<!-- \/EVENT:STATUS -->/) || [])[1]
        ?.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/\s+/g, ' ').trim(),
    });
    await withSite(async ({ origin, browser }) => {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
        const p = await ctx.newPage();
        await p.goto(origin + '/events/pickle-for-a-purpose/', { waitUntil: 'load' });
        await p.waitForTimeout(700);
        await p.screenshot({ path: join(OUT, `${name}-event-${vp.tag}.png`), fullPage: true });
        await p.goto(origin + '/community', { waitUntil: 'load' });
        await p.waitForTimeout(700);
        await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
        await p.locator('article.event').screenshot({ path: join(OUT, `${name}-card-${vp.tag}.png`) });
        await ctx.close();
      }
    });
    console.log(`  ${name}: ${state}`);
  }
} finally {
  for (const [f, body] of saved) writeFileSync(f, body);
  if (savedIcs !== null) writeFileSync(ICS, savedIcs); else if (existsSync(ICS)) unlinkSync(ICS);
  execFileSync('node', ['tools/build-event.mjs', 'pickle-for-a-purpose'], { cwd: ROOT, stdio: 'ignore' });
}

console.log('\n| --now | state | CTA label | Offer nodes | sticky bar | utilities | .ics |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows)
  console.log(`| \`${r.now}\` | \`${r.state}\` | ${r.cta} | ${r.offers} | ${r.sticky ? 'yes' : 'removed'} | ${r.utilities ? 'yes' : 'removed'} | ${r.ics ? 'present' : 'deleted'} |`);
console.log('');
for (const r of rows) console.log(`**${r.state}** — ${r.status}\n`);
