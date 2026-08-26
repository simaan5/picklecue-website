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
 * Four things fail in BOTH modes, because they are wrong rather than stale:
 * a page built for a lifecycle state the clock has left behind, forward-looking
 * copy surviving after the event, a price the page shows that we never
 * observed, and the page claiming sold out on the organizer's behalf.
 *
 * WHAT THIS GATE DOES NOT DEMAND
 * It does not require a recap. Photos, results and a write-up belong to the
 * organizer; a gate that stays red until one exists is a gate that pressures
 * somebody into inventing one. "This event has taken place" is complete and
 * true on its own, and `node tools/build-event.mjs <slug>` writes it in full.
 *
 * Run:  node tools/gate-events.mjs
 *       node tools/gate-events.mjs --strict
 *       node tools/gate-events.mjs --now 2026-08-30T12:00:00Z   (time travel, for testing)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateFor } from './build-event.mjs';

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

/* Language that only makes sense while an event is still ahead of the reader.
   The builder removes all of it in the ended state; this catches anything a
   later hand-edit adds OUTSIDE a marked region. */
const FORWARD_LOOKING = [
  'Register',
  'registration is currently unavailable',
  'Registration is currently unavailable',
  'before you travel',
  'if registration reopens',
];

for (const e of cfg.events) {
  const raw = readFileSync(join(ROOT, e.page), 'utf8');
  /* Scan what a READER sees.
     Two false positives shaped this. The first run flagged the page for saying
     "sold out" — in an HTML comment explaining why we deliberately do not say
     it. The second flagged "Register" inside the seam-cover script's string
     "Registration is closed", which is the opposite of forward-looking. So
     comments, <script> and <style> all come out before the scan. A gate that
     fires on its own rationale gets switched off, and a switched-off gate
     protects nothing. */
  const page = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
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

  /* 1. The page must be BUILT for the state the clock is actually in. One
        check covers every state transition, because the state is computed by
        the same function the builder uses — not re-derived here. */
  const want = stateFor(e, NOW);
  const built = (raw.match(/<body[^>]*data-event-state="([a-z-]*)"/) || [])[1];
  if (!built) {
    fails.push(`${label}: ${e.page} has no data-event-state on <body> — it is not built by tools/build-event.mjs`);
  } else if (built !== want) {
    fails.push(
      `${label}: the clock says "${want}" but the page is built as "${built}".\n` +
      `      Fix: node tools/build-event.mjs ${e.slug}\n` +
      `      That rewrites the copy, the CTAs and the schema from data/events.json.\n` +
      `      It needs no recap, no photos and no results.`);
  }

  /* 2. Belt and braces after the event: forward-looking copy that a hand-edit
        added outside a marked region would survive the builder. */
  if (NOW > ends) {
    const still = FORWARD_LOOKING.filter(p => page.includes(p));
    if (still.length) {
      const agoD = (NOW - ends) / DAY;
      fails.push(
        `${label}: ended ${agoD < 1 ? Math.round(agoD * 24) + 'h' : agoD.toFixed(1) + ' day(s)'} ago but the page still reads as upcoming ` +
        `(found: ${still.map(s => JSON.stringify(s.slice(0, 34))).join(', ')}). ` +
        `These sit OUTSIDE a marked region — the builder cannot reach them, so edit the page.`);
    }
    continue;   // freshness of a finished event is moot
  }

  /* 3. Inside the window, the organizer's state must have been re-checked
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

  /* 4. The prices on the page must be the ones we recorded observing. A silent
        edit to either side is the failure mode this whole file is about. */
  for (const o of e.observed?.offers || []) {
    if (!/Registration|Admission/.test(o.name)) continue;    // ticket tiers only
    const dollars = '$' + String(Math.round(parseFloat(o.price)));
    if (!page.includes(dollars)) {
      fails.push(`${label}: observed ${o.name} at ${dollars} but the page does not show that price`);
    }
  }

  /* 5. Nothing may claim sold out on our behalf. We cannot tell a sell-out from
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
