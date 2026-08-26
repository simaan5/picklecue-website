#!/usr/bin/env node
/**
 * Event freshness gate.
 *
 * WHY THIS EXISTS
 * The Pickle for a Purpose page advertised "$60 early bird" with an InStock
 * offer and a sticky "Register · $60 Early Bird" button for fifteen days after
 * that tier vanished from the organizer's own page — and four days before the
 * event. Every part of the site was internally consistent. Nothing knew the
 * claim had an expiry date.
 *
 * A claim about someone else's event is perishable. This makes the build refuse
 * to ship one that has gone off.
 *
 * TWO ENFORCEMENT LEVELS, because a development PR should not go red overnight
 * just because a clock advanced.
 *
 *   default    staleness is a WARNING. Prints the slug, the age and the exact
 *              command to fix it, and exits 0. This runs on every push and PR.
 *   --strict   staleness is a HARD FAIL. This runs before a production deploy,
 *              where "we last checked two days ago" is not good enough for an
 *              event somebody may be driving to.
 *
 * Three things fail in BOTH modes, because they are wrong rather than stale:
 * a finished event still reading as upcoming, a price the page shows that we
 * never observed, and the page claiming sold out on the organizer's behalf.
 *
 * Run:  node tools/gate-events.mjs
 *       node tools/gate-events.mjs --strict
 *       node tools/gate-events.mjs --now 2026-08-30T12:00:00Z   (time travel, for testing)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cfg = JSON.parse(readFileSync(join(ROOT, 'data/events.json'), 'utf8'));

const nowArg = process.argv.indexOf('--now');
const NOW = nowArg > -1 ? new Date(process.argv[nowArg + 1]) : new Date();
if (isNaN(NOW)) { console.error('--now is not a date'); process.exit(2); }

const STRICT = process.argv.includes('--strict');
const HOUR = 3600e3, DAY = 24 * HOUR;
const fails = [], warns = [];
/* Staleness: hard in strict mode, advisory otherwise. */
const stale = m => (STRICT ? fails : warns).push(m);

/* Language that only makes sense while an event is still ahead of the reader. */
const FORWARD_LOOKING = [
  'Register',
  'registration is currently unavailable',
  'Registration is currently unavailable',
  'before you travel',
  'if registration reopens',
];

for (const e of cfg.events) {
  const raw = readFileSync(join(ROOT, e.page), 'utf8');
  /* Scan what a READER sees. The first run of this gate flagged the page for
     saying "sold out" — in an HTML comment explaining why we deliberately do
     not say it. A gate that fires on its own rationale gets switched off. */
  const page = raw.replace(/<!--[\s\S]*?-->/g, ' ');
  const ends = new Date(e.endsAt);
  const starts = new Date(e.startsAt);
  const verified = new Date(e.statusVerifiedAt);
  const daysOut = (starts - NOW) / DAY;
  const verifiedAgoH = (NOW - verified) / HOUR;

  const label = `${e.slug}`;

  if (isNaN(ends) || isNaN(starts) || isNaN(verified)) {
    fails.push(`${label}: startsAt / endsAt / statusVerifiedAt is not a valid date`);
    continue;
  }

  /* 1. An event that has finished must not still be sold. */
  if (NOW > ends) {
    const still = FORWARD_LOOKING.filter(p => page.includes(p));
    if (still.length) {
      const agoD = (NOW - ends) / DAY;
      fails.push(
        `${label}: ended ${agoD < 1 ? Math.round(agoD * 24) + 'h' : agoD.toFixed(1) + ' day(s)'} ago but the page still reads as upcoming ` +
        `(found: ${still.map(s => JSON.stringify(s.slice(0, 34))).join(', ')}). ` +
        `Move it to the ${e.afterTheEvent?.requirement || 'ended'} state.`);
    }
    continue;   // freshness of a finished event is moot
  }

  /* 2. Inside the window, the organizer's state must have been re-checked
        recently. Someone may be about to drive there. */
  if (daysOut <= cfg.rules.windowDays) {
    if (verifiedAgoH > cfg.rules.reverifyWithinHours) {
      const imminent = daysOut <= 2;
      stale(
        `${label}: starts in ${daysOut.toFixed(1)} day(s)${imminent ? ' — INSIDE 48 HOURS' : ''} but registration ` +
        `state was last verified ${verifiedAgoH.toFixed(1)}h ago (limit ${cfg.rules.reverifyWithinHours}h).\n` +
        `      Fix: node tools/verify-event.mjs ${e.slug} --write` +
        (STRICT ? '' : '\n      (warning here; this is a hard failure in --strict, which gates deployment)'));
    } else {
      console.log(`  ${label}: starts in ${daysOut.toFixed(1)}d, verified ${verifiedAgoH.toFixed(1)}h ago — fresh`);
    }
  } else if (verifiedAgoH > 30 * 24) {
    warns.push(`${label}: ${daysOut.toFixed(0)} days out, last verified ${(verifiedAgoH / 24).toFixed(0)} days ago`);
  }

  /* 3. The prices on the page must be the ones we recorded observing. A silent
        edit to either side is the failure mode this whole file is about. */
  for (const o of e.observed?.offers || []) {
    if (!/Registration|Admission/.test(o.name)) continue;    // ticket tiers only
    const dollars = '$' + String(Math.round(parseFloat(o.price)));
    if (!page.includes(dollars)) {
      fails.push(`${label}: observed ${o.name} at ${dollars} but the page does not show that price`);
    }
  }

  /* 4. Nothing may claim sold out on our behalf. We cannot tell a sell-out from
        a closed ticket widget, and saying so about a charity is not ours to do. */
  if (/sold\s*out/i.test(page)) {
    fails.push(`${label}: the page says "sold out". Only the organizer can say that.`);
  }
}

for (const w of warns) console.warn('\n  ⚠ ' + w);
if (warns.length) console.warn(`\n  ${warns.length} warning(s). Not blocking this run; --strict blocks a deploy.\n`);
if (fails.length) {
  console.error(`\nEVENT GATE: ${fails.length} problem(s)\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  console.error('\nSource of truth: data/events.json\n');
  process.exit(1);
}
console.log(`Event gate holds (${STRICT ? 'strict' : 'advisory'}). ` +
            `${cfg.events.length} event(s) checked at ${NOW.toISOString()}.`);
