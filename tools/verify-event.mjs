#!/usr/bin/env node
/**
 * Re-verify a community event against the organizer's own page, and write what
 * was actually observed back into data/events.json.
 *
 * gate-events.mjs fails the build when an event inside seven days has not been
 * re-checked in 24 hours. A gate that takes ten minutes of manual JSON editing
 * to satisfy gets switched off, so this makes it one command:
 *
 *     node tools/verify-event.mjs pickle-for-a-purpose
 *     node tools/verify-event.mjs pickle-for-a-purpose --write
 *
 * Without --write it prints the diff and changes nothing. That is the default
 * on purpose: this file decides what the public site claims about somebody
 * else's charity event, and it should not move without a human reading it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PATH = join(ROOT, 'data/events.json');
const cfg = JSON.parse(readFileSync(PATH, 'utf8'));

const slug = process.argv[2];
const write = process.argv.includes('--write');
const e = cfg.events.find(x => x.slug === slug);
if (!e) {
  console.error(`Unknown event ${JSON.stringify(slug)}. Known: ${cfg.events.map(x => x.slug).join(', ')}`);
  process.exit(2);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/151.0 Safari/537.36';

console.log(`Fetching ${e.sourceUrl}`);
const res = await fetch(e.sourceUrl, { headers: { 'User-Agent': UA } });
if (!res.ok) { console.error(`HTTP ${res.status} — not updating anything.`); process.exit(1); }
const html = await res.text();

/* Their page publishes a SportsEvent JSON-LD graph. Parse that rather than
   scraping rendered text: the markup is theirs to change, the schema is not. */
const offers = [...html.matchAll(/\{"@type":"Offer"[^}]*\}/g)].map(m => JSON.parse(m[0]))
  .map(o => ({ name: o.name, price: o.price, availability: String(o.availability).split('/').pop() }));
const status = (html.match(/"eventStatus":"([^"]+)"/) || [])[1];

if (!offers.length) {
  console.error('No Offer objects found. Their page shape may have changed — check by hand, do not guess.');
  process.exit(1);
}

const ticketNames = /Registration|Admission/;
const tickets = offers.filter(o => ticketNames.test(o.name));
const anyBuyable = tickets.some(o => o.availability === 'InStock' || o.availability === 'LimitedAvailability');
const state = anyBuyable ? 'open' : 'unavailable';

console.log(`\n  eventStatus : ${status ? status.split('/').pop() : '(none)'}`);
for (const o of offers) console.log(`  ${o.name.padEnd(22)} $${String(o.price).padEnd(8)} ${o.availability}`);
console.log(`\n  registrationState: ${e.registrationState}  ->  ${state}`);

const changes = [];
if (state !== e.registrationState) changes.push(`registrationState ${e.registrationState} -> ${state}`);
const before = JSON.stringify(e.observed.offers);
if (before !== JSON.stringify(offers)) changes.push('offers changed');

if (changes.length) {
  console.log('\n  CHANGED: ' + changes.join('; '));
  console.log('  The page copy may now be wrong. Read it before shipping.');
} else {
  console.log('\n  No change since the last verification.');
}

if (!write) {
  console.log('\nDry run. Re-run with --write to record this verification.');
  process.exit(0);
}

e.observed.offers = offers;
e.observed.eventStatus = status ? status.split('/').pop() : null;
e.registrationState = state;
e.statusVerifiedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
writeFileSync(PATH, JSON.stringify(cfg, null, 2) + '\n');
console.log(`\nWrote data/events.json — statusVerifiedAt = ${e.statusVerifiedAt}`);

/* Re-render immediately. The page, the community card, the schema and the .ics
   are all derived from this record — the calendar file's DTSTAMP is
   statusVerifiedAt itself — so a verification that does not rebuild leaves the
   tree in a state the build gate rejects, and leaves whoever ran this staring
   at a failure they did not cause. One command, whole job. */
console.log('\nRebuilding from the updated record:');
const { execFileSync } = await import('node:child_process');
try {
  execFileSync('node', ['tools/build-event.mjs', e.slug], { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error('  Rebuild failed. Run `node tools/build-event.mjs ' + e.slug + '` and read the error.');
  process.exit(1);
}
if (changes.length) {
  console.log('\nState changed. Read the rendered page before shipping — the gate checks\nstructure, not whether the new wording is the wording you want.');
}
