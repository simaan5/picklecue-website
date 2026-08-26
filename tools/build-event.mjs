#!/usr/bin/env node
/* Render a community event page from data/events.json.
 *
 * WHY
 * The page used to hold its own truth. Prose said one thing, the sticky CTA
 * said another, the JSON-LD said a third, and the community card said a fourth.
 * That is how "$60 early bird" and an InStock Offer survived fifteen days past
 * the tier disappearing from the organizer's own page, four days out.
 *
 * Now one record decides all of them. The state is DERIVED from startsAt,
 * endsAt and registrationState — never from how the page happens to read.
 *
 *   node tools/build-event.mjs pickle-for-a-purpose
 *   node tools/build-event.mjs pickle-for-a-purpose --now 2026-08-29T18:00:00-07:00
 *   node tools/build-event.mjs pickle-for-a-purpose --check    exit 1 if stale
 *   node tools/build-event.mjs --all --check                   CI form
 *
 * FACTS live in data/events.json. VOICE lives in COPY below. Splitting them
 * that way keeps prose reviewable as prose instead of as escaped HTML inside
 * JSON, and keeps a fact from being edited in two places.
 *
 * THERE IS NO "RECAP" STATE. A recap needs real photos, real results, real
 * words from the organizer. A gate that stays red until one exists is a gate
 * that pressures somebody into inventing one — the exact failure this whole
 * system was built to prevent. "This event has taken place" is complete and
 * true on its own.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CFG = JSON.parse(readFileSync(join(ROOT, 'data/events.json'), 'utf8'));

/* ---------------------------------------------------------------- state --- */

/**
 * The only place a lifecycle state is decided.
 *
 * "event day" is the whole calendar day in the EVENT's timezone, not a window
 * around startsAt: someone reading at 9am on the 29th is reading about
 * something happening today, and "starts in 0.3 days" is not how a person
 * thinks about it.
 */
export function stateFor(ev, now) {
  const end = new Date(ev.endsAt);
  if (now > end) return 'ended';
  const dayOf = ymd(new Date(ev.startsAt), ev.timeZone);
  if (ymd(now, ev.timeZone) === dayOf) return 'event-day';
  return ev.registrationState === 'open' ? 'upcoming-open' : 'upcoming-unavailable';
}

const ymd = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const fmt = (d, tz, o) => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(d);

/* ----------------------------------------------------------------- copy --- */

/** Escape for HTML text, and use the site's typographic apostrophe. */
const t = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&rsquo;');

/**
 * Every string a reader sees that depends on the state, in one table.
 *
 * `c` carries the derived facts: the formatted date, the two link forms, the
 * venue. Nothing here invents anything — if a sentence needs a fact, the fact
 * comes from data/events.json.
 */
const COPY = {
  'upcoming-open': c => ({
    metaDescription: `Join ${c.organizer}’s ${c.name} charity pickleball tournament on ${c.monthDay} in ${c.city}, supported through community promotion by PickleCue.`,
    heroStatus: `<strong>Registration is open on the organizer&rsquo;s site.</strong> Registration and payment are handled entirely on ${c.officialLink}, not here.`,
    cta: 'Register on the organizer&rsquo;s site',
    expectHead: 'What to expect',
    callout: c.calloutUpcoming,
    utilities: c.utilities,
    entryCard: 'Register solo or bring a partner',
    includes: 'includes',
    pricingHead: 'Published prices',
    pricingNote: `These are the prices the organizer published. We are not the organizer and cannot take a registration &mdash; that happens on ${c.goLink('availability_note')}.`,
    cardStatus: 'Registration is open on the organizer&rsquo;s site.',
  }),

  'upcoming-unavailable': c => ({
    metaDescription: `${c.name}: ${c.organizer}’s charity pickleball tournament on ${c.monthDay} in ${c.city}, supported through community promotion by PickleCue.`,
    heroStatus: `<strong>Registration is currently unavailable on the organizer&rsquo;s site.</strong> The event is still scheduled. Registration and payment are handled entirely on ${c.officialLink}, and only they can confirm whether it reopens.`,
    cta: 'View official event page',
    expectHead: 'What to expect',
    callout: c.calloutUpcoming,
    utilities: c.utilities,
    entryCard: 'Register solo or bring a partner',
    includes: 'includes',
    pricingHead: 'Published prices',
    pricingNote: `<strong>Registration is currently unavailable on the organizer&rsquo;s site.</strong> These are the prices they last published, shown so you know what the event costs if registration reopens. We are not the organizer and cannot take a registration &mdash; check ${c.goLink('availability_note')} before you travel.`,
    cardStatus: 'Registration is currently unavailable on the organizer&rsquo;s site.',
  }),

  'event-day': c => ({
    metaDescription: `${c.name} is today, ${c.monthDay}, at ${c.venue} in ${c.city}. A charity pickleball tournament by ${c.organizer}, supported through community promotion by PickleCue.`,
    heroStatus: `<strong>Happening today.</strong> ${c.timeRange} at ${t(c.venue)}. PickleCue is not running this event &mdash; for anything about entry, timing or last-minute changes, ${c.goLink('day_of_note')} is the only source that can answer.`,
    cta: 'View official event page',
    expectHead: 'What to expect',
    callout: c.calloutUpcoming,
    utilities: c.utilities,
    entryCard: 'Register solo or bring a partner',
    includes: 'includes',
    pricingHead: 'Published prices',
    pricingNote: `These are the prices the organizer published. We are not the organizer and cannot take a registration &mdash; check ${c.goLink('availability_note')} before you travel.`,
    cardStatus: 'Happening today.',
  }),

  ended: c => ({
    metaDescription: `${c.name}, ${c.organizer}’s charity pickleball tournament, was held on ${c.monthDay} at ${c.venue} in ${c.city}. PickleCue supported the event through community promotion.`,
    /* Past tense, no CTA language, nothing purchasable, and no claim about how
       it went — we were not there and it is not our event to summarise. */
    heroStatus: `<strong>This event has taken place.</strong> ${t(c.name)} was held on ${c.longDate} at ${t(c.venue)} in ${t(c.city)}. Anything the organizers publish afterwards will be on ${c.officialLink}.`,
    cta: 'View official event page',
    expectHead: 'What the event included',
    callout: '',
    utilities: '',
    entryCard: 'Solo and partner entry',
    includes: 'included',
    pricingHead: 'Prices the organizer published',
    pricingNote: `These were the prices published for this event. It has taken place &mdash; nothing here is purchasable, and PickleCue never took registrations for it.`,
    cardStatus: 'This event has taken place.',
  }),
};

/* ------------------------------------------------------------------ ics --- */

/* RFC 5545: escape the reserved characters, then fold at 75 octets. Unfolded
   long lines are the single most common reason a calendar refuses a file. */
const icsText = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const b = Buffer.from(line, 'utf8');
  if (b.length <= 75) return line;
  const out = []; let i = 0;
  while (i < b.length) {
    let n = Math.min(i ? 74 : 75, b.length - i);
    /* Never split a multi-byte sequence: slicing an em-dash in half yields a
       replacement character, and the whole DESCRIPTION arrives corrupted on the
       one device that actually opens the file. Back off to a lead byte. */
    while (n > 1 && i + n < b.length && (b[i + n] & 0xC0) === 0x80) n--;
    out.push((i ? ' ' : '') + b.slice(i, i + n).toString('utf8'));
    i += n;
  }
  return out.join('\r\n');
}
const icsStamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * A calendar file for the event.
 *
 * DTSTAMP is statusVerifiedAt, not "now" — a build must be reproducible, and
 * "when we last checked the organizer's page" is a more honest stamp than the
 * moment a CI runner happened to execute.
 *
 * The DESCRIPTION says who runs this and who does not, because a calendar entry
 * outlives the page it came from and is the one artefact that ends up on a
 * stranger's phone with no context around it.
 */
function ics(ev) {
  const url = `https://www.picklecue.com/${ev.page.replace(/index\.html$/, '')}`;
  const desc = `${ev.description}\n\nOrganized by ${ev.organizer}. Registration, payment and all event operations are handled by the organizer at ${ev.sourceUrl} — PickleCue promotes this event and is not the organizer.\n\n${url}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PickleCue//Community Events//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${ev.slug}@picklecue.com`,
    `DTSTAMP:${icsStamp(ev.statusVerifiedAt)}`,
    `DTSTART:${icsStamp(ev.startsAt)}`,
    `DTEND:${icsStamp(ev.endsAt)}`,
    `SUMMARY:${icsText(ev.name)}`,
    `LOCATION:${icsText([ev.location.name, ev.location.streetAddress, `${ev.location.addressLocality}, ${ev.location.addressRegion}`].join(', '))}`,
    `DESCRIPTION:${icsText(desc)}`,
    `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].map(fold).join('\r\n') + '\r\n';
}

/* ---------------------------------------------------------------- render --- */

function context(ev) {
  const tz = ev.timeZone, s = new Date(ev.startsAt), e = new Date(ev.endsAt);
  /* "5-8 PM", not "5 PM-8 PM": drop the meridiem from the start when both
     ends share it, and drop ":00" from a whole hour. */
  const part = d => fmt(d, tz, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const [sh, sm] = [part(s), part(e)];
  const share = sh.slice(-2) === sm.slice(-2);
  const c = {
    name: ev.name, organizer: ev.organizerShort || ev.organizer, venue: ev.location.name, city: ev.location.addressLocality,
    longDate: fmt(s, tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    monthDay: fmt(s, tz, { month: 'long', day: 'numeric' }),
    timeRange: share ? `${sh.slice(0, -3)}–${sm}` : `${sh}–${sm}`,
    officialLink: `<a href="${ev.sourceUrl}" target="_blank" rel="noopener noreferrer">official event page&nbsp;&#8599;</a>`,
    goLink: place => `<a href="${ev.goPath}" data-track="community_event_outbound" data-audience="event" data-event-slug="${ev.slug}" data-placement="${place}">their page</a>`,
  };
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  /* Three secondary actions, one row, one interaction owner each. They exist
     only while the event is still ahead — a calendar file for a finished event
     is noise, and directions to a finished one are worse. */
  c.utilities = `
        <ul class="ev-utils">
          <li><a href="https://maps.google.com/?q=${encodeURIComponent(ev.location.mapsQuery)}" target="_blank" rel="noopener noreferrer" data-track="event_utility" data-utility="directions" data-event-slug="${ev.slug}">${svg('<path d="M12 21s-6.5-5.4-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.8" r="2.3"/>')}Directions</a></li>
          <li><a href="/${ev.page.replace(/index\.html$/, '')}${ev.slug}.ics" type="text/calendar" data-track="event_utility" data-utility="calendar" data-event-slug="${ev.slug}">${svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M12 13v4M10 15h4"/>')}Add to calendar</a></li>
          <li><button type="button" class="ev-util-share" hidden data-track="event_utility" data-utility="share" data-event-slug="${ev.slug}">${svg('<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6.5" r="2.4"/><circle cx="17" cy="17.5" r="2.4"/><path d="M8.2 10.9 14.8 7.6M8.2 13.1l6.6 3.3"/>')}<span>Share</span></button></li>
        </ul>`;
  c.calloutUpcoming = `
      <div class="callout">
        <strong>No partner? No problem.</strong>
        <p>Register solo and the organizers will pair you by skill level, or bring a partner.</p>
      </div>`;
  return c;
}

/** Replace one marked region. Fails loudly rather than silently doing nothing. */
function region(html, name, body, { optional = false } = {}) {
  const re = new RegExp(`(<!--\\s*EVENT:${name}\\s*-->)[\\s\\S]*?(<!--\\s*/EVENT:${name}\\s*-->)`, 'g');
  if (!re.test(html)) {
    if (optional) return html;
    throw new Error(`marker EVENT:${name} not found in the page — the builder and the markup have drifted`);
  }
  return html.replace(new RegExp(`(<!--\\s*EVENT:${name}\\s*-->)[\\s\\S]*?(<!--\\s*/EVENT:${name}\\s*-->)`, 'g'), (_, a, b) => a + body + b);
}

/** The whole SportsEvent node, generated — never hand-edited. */
function schema(ev, state) {
  const L = ev.lifecycle[state];
  const node = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: ev.name,
    description: ev.description,
    startDate: ev.startsAt,
    endDate: ev.endsAt,
    eventStatus: `https://schema.org/${ev.observed?.eventStatus || 'EventScheduled'}`,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: ev.location.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: ev.location.streetAddress,
        addressLocality: ev.location.addressLocality,
        addressRegion: ev.location.addressRegion,
        addressCountry: ev.location.addressCountry,
      },
    },
    organizer: { '@type': 'Organization', name: ev.organizer, url: ev.organizerUrl },
  };
  /* An Offer on a finished event advertises something nobody can buy. Google
     reads this; so do assistants. When it is over, the offers come out. */
  if (state !== 'ended') {
    node.offers = ev.ticketTiers.map(tier => {
      const o = ev.observed.offers.find(x => x.name === tier.offerName);
      const offer = { '@type': 'Offer', name: tier.offerName, price: String(Math.round(parseFloat(o.price))), priceCurrency: 'USD', url: ev.sourceUrl };
      /* availability is asserted ONLY when we can stand behind it. Their page
         reports SoldOut on every tier down to a $5 raffle ticket, which reads
         like a closed widget rather than a sell-out — and we cannot tell those
         apart, so we say nothing rather than guess on a charity's behalf. */
      if (L.offerAvailability) offer.availability = L.offerAvailability;
      return offer;
    });
  }
  return JSON.stringify(node, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
}

function render(ev, now) {
  const state = stateFor(ev, now);
  const L = ev.lifecycle[state];
  if (!L) throw new Error(`lifecycle has no entry for state "${state}"`);
  const c = context(ev);
  const k = COPY[state](c);

  const page = join(ROOT, ev.page);
  let html = readFileSync(page, 'utf8');

  html = html.replace(/(<body[^>]*\sdata-event-state=")[a-z-]*(")/, `$1${state}$2`);
  html = region(html, 'JSONLD', `\n  <script type="application/ld+json">\n  ${schema(ev, state)}\n  </script>\n  `);
  html = region(html, 'META', [
    `\n  <meta name="description" content="${k.metaDescription}">`,
    `\n  <meta property="og:description" content="${k.metaDescription}">`,
    `\n  <meta name="twitter:description" content="${k.metaDescription}">\n  `,
  ].join(''));
  html = region(html, 'STATUS', k.heroStatus);
  html = region(html, 'CTA', k.cta);
  html = region(html, 'EXPECT_HEAD', k.expectHead);
  html = region(html, 'UTILITIES', k.utilities + (k.utilities ? '\n      ' : ''));
  html = region(html, 'CALLOUT', k.callout);
  html = region(html, 'ENTRY_CARD', k.entryCard);
  html = region(html, 'INCLUDES', k.includes);
  html = region(html, 'ENDSAT', ev.endsAt);
  html = region(html, 'PRICING_HEAD', k.pricingHead);
  html = region(html, 'PRICING_NOTE', k.pricingNote);
  html = region(html, 'PRICES', ev.ticketTiers.map(tier => {
    const o = ev.observed.offers.find(x => x.name === tier.offerName);
    return `
        <div class="price">
          <span class="lbl">${t(tier.label)}</span>
          <span class="amt">$${Math.round(parseFloat(o.price))}<small>${t(tier.unit)}</small></span>
          <span class="was">Set by the organizer</span>
        </div>`;
  }).join('') + '\n      ');
  /* The sticky bar is REMOVED, not hidden, once the event is over: a display
     rule still ships the markup, and a screen reader still finds the link. */
  html = region(html, 'STICKY', L.sticky ? `
  <div class="sticky-cta" id="stickyCta" hidden>
    <a href="${ev.goPath}" data-track="community_event_outbound" data-audience="event" data-event-slug="${ev.slug}" data-placement="sticky_mobile">
      <!-- EVENT:CTA -->${k.cta}<!-- /EVENT:CTA -->
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="square"/></svg>
    </a>
  </div>
  ` : '\n  ');

  /* The community card is the same claim on another page. It gets the same
     state from the same record, or it becomes the next thing that goes stale. */
  const card = join(ROOT, 'community.html');
  let cardHtml = readFileSync(card, 'utf8');
  cardHtml = region(cardHtml, 'CARD_STATUS', k.cardStatus);
  cardHtml = region(cardHtml, 'CARD_CTA', state === 'ended' ? 'View event page' : 'View event');

  const icsPath = join(ROOT, ev.page.replace(/index\.html$/, `${ev.slug}.ics`));
  return { state, icsPath, ics: state === 'ended' ? null : ics(ev), files: [[page, html], [card, cardHtml]] };
}

/* ------------------------------------------------------------------ cli --- */

/* gate-events.mjs imports stateFor from this file so the state is decided in
   exactly one place. Run the CLI only when this file IS the entry point. */
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!isMain) { /* imported as a module */ } else { main(); }

function main() {
const args = process.argv.slice(2);
const i = args.indexOf('--now');
const NOW = i > -1 ? new Date(args[i + 1]) : new Date();
if (isNaN(NOW)) { console.error('--now is not a date'); process.exit(2); }
const CHECK = args.includes('--check');
/* Without --now, `i` is -1 — so `i + 1` is 0 and a naive filter eats the slug
   itself. Only skip the token that actually follows a --now. */
const slugs = args.includes('--all')
  ? CFG.events.map(e => e.slug)
  : args.filter((a, n) => !a.startsWith('--') && !(i > -1 && n === i + 1));
if (!slugs.length) { console.error('usage: build-event.mjs <slug> | --all  [--now ISO] [--check]'); process.exit(2); }

let stale = 0;
for (const slug of slugs) {
  const ev = CFG.events.find(x => x.slug === slug);
  if (!ev) { console.error(`unknown event "${slug}"`); process.exit(2); }
  const { state, files, icsPath, ics: icsBody } = render(ev, NOW);
  /* The calendar file is part of the built state: present while the event is
     ahead, gone once it is not. A stale .ics on a stranger's phone is the one
     artefact that outlives the page it came from. */
  const icsNow = existsSync(icsPath) ? readFileSync(icsPath, 'utf8') : null;
  const icsChanged = icsBody !== icsNow;
  const changed = files.filter(([f, out]) => readFileSync(f, 'utf8') !== out);
  if (CHECK) {
    if (icsChanged) changed.push([icsPath]);
    if (changed.length) {
      stale++;
      console.error(
        `\nEVENT BUILD: "${slug}" is in state "${state}" at ${NOW.toISOString()}, but ` +
        `${changed.length} file(s) still carry another state:\n` +
        changed.map(([f]) => '    ' + f.replace(ROOT, '')).join('\n') +
        `\n\n  Fix:  node tools/build-event.mjs ${slug}\n` +
        `  This needs no recap, no photos and no results — it rewrites the copy,\n` +
        `  the CTAs and the schema from data/events.json.\n`);
    } else {
      console.log(`  ${slug}: state "${state}" — page, card and schema all agree`);
    }
  } else {
    for (const [f, out] of changed) writeFileSync(f, out);
    if (icsChanged) {
      if (icsBody) writeFileSync(icsPath, icsBody); else if (icsNow !== null) unlinkSync(icsPath);
      changed.push([icsPath + (icsBody ? '' : ' (removed)')]);
    }
    console.log(`  ${slug}: state "${state}" at ${NOW.toISOString()} — ${changed.length ? changed.map(([f]) => f.replace(ROOT, '')).join(', ') + ' updated' : 'no change'}`);
  }
}
process.exit(stale ? 1 : 0);
}
