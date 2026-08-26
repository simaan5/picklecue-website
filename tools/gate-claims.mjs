#!/usr/bin/env node
/**
 * Shipped-truth gate for the PickleCue marketing site.
 *
 * WHY THIS EXISTS
 * Three contradictory court counts shipped at the same time — "over 22,000"
 * in the homepage schema, "26,000+ courts with reviews" in the live demo, and
 * "3,443" on the courts directory — because each number was hand-typed into a
 * different file. Nothing compared them. This does.
 *
 * It also locks four other things that were each wrong on at least one page
 * and are invisible to a human reading a diff:
 *
 *   - canonical URLs must not point at a URL the host 308-redirects away from
 *   - pinch-zoom must never be disabled
 *   - pre-launch copy must not survive launch
 *   - a feature that is switched off in the app must not be marketed
 *
 * Run:  node tools/gate-claims.mjs
 * Exit: 0 clean, 1 with a list of violations.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const claims = JSON.parse(readFileSync(join(ROOT, 'data/claims.json'), 'utf8'));
const assetManifest = JSON.parse(readFileSync(join(ROOT, 'data/marketing-assets.json'), 'utf8')).assets;
const warns = [];

/* Generated court pages are excluded from the number scan: they carry
   thousands of legitimate per-city counts. Their totals are asserted
   separately and exactly, below. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'website-marketing', 'tests']);
const GENERATED_COURT_PAGES = /^courts\/us\//;

/* Marketing pages sell the product. The rest (live.html, organizer.html,
   scorekeeper.html, checkin.html, e.html, keepscore/, bracket/, poster*.html)
   are working product surfaces, and some bans only make sense on the former.
   A DUPR ID field on an organizer's registration form is a shipped feature —
   event_registration_settings.require_dupr and event_registrations.dupr_id are
   live columns. A "3.48 DUPR" stat tile in marketing is not: the rating
   integration is switched off behind FeatureFlags.duprIntegration. */
const MARKETING = /^(index|players|organizers|community|clubs|support|privacy|terms|licenses|404|live-scores)\.html$|^(courts|demo|events)\//;
const SELLING = /^(index|players|organizers|community|clubs|live-scores)\.html$|^(demo|events)\/|^courts\/(index|us)\.html$/;
const MARKETING_ONLY_PHRASES = {
  DUPR: 'FeatureFlags.duprIntegration is false — the app does not show DUPR ratings',
};

const fails = [];
const fail = (file, msg) => fails.push(`${file}: ${msg}`);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e) || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (extname(p) === '.html') out.push(p);
  }
  return out;
}

/* ---------------------------------------------------------------- numbers */
/* Comma-formatted totals never appear in CSS or SVG path data, so those are
   flagged wherever they occur. Bare digit runs DO appear in path data and
   viewBox attributes, so those only count when the word "court" is within
   40 characters. Getting this wrong in the permissive direction would make
   the gate cry wolf on every icon, and a gate nobody trusts gets deleted. */
const banned = Object.keys(claims.bannedNumbers);
const NEAR_COURT = /court/i;

function scanNumbers(rel, text) {
  for (const n of banned) {
    const withComma = n.replace(/^(\d+)(\d{3})$/, '$1,$2');
    for (const form of new Set([withComma, n])) {
      let i = -1;
      while ((i = text.indexOf(form, i + 1)) !== -1) {
        const bare = form === n;
        if (bare && !NEAR_COURT.test(text.slice(Math.max(0, i - 40), i + 40))) continue;
        // "22,000" inside "122,0007" style path data: require digit boundaries
        if (/\d/.test(text[i - 1] || '') || /[\d.]/.test(text[i + form.length] || '')) continue;
        fail(rel, `banned court count "${form}" — ${claims.bannedNumbers[n]}`);
        break;
      }
    }
  }
}

/* ---------------------------------------------------------------- phrases */
function scanPhrases(rel, text) {
  for (const [phrase, why] of Object.entries(claims.bannedPhrases)) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) fail(rel, `banned phrase "${phrase}" — ${why}`);
  }
  if (MARKETING.test(rel)) {
    for (const [phrase, why] of Object.entries(MARKETING_ONLY_PHRASES)) {
      if (text.includes(phrase)) fail(rel, `banned on marketing pages: "${phrase}" — ${why}`);
    }
    /* A star rating with a review count. The banned-phrase list caught
       "courts with reviews" in prose but not "4.6 (128)" rendered as UI — the
       live demo shipped three fabricated court ratings past the first gate.
       public.court_reviews has zero rows, so no rating is real. */
    const rating = text.match(/\b[0-5]\.[0-9]\s*\(\s*\d{1,5}\s*\)/);
    if (rating) fail(rel, `fabricated rating "${rating[0]}" — court_reviews is empty, there are no ratings`);

    /* Reviews and photos listed among things a visitor will find. The app has
       both features; the tables have zero rows, so presenting them as content
       is a promise the app cannot keep. The banned-phrase list only caught
       "courts with reviews" — clubs.html said "plus directions, reviews, and
       the games happening there" and sailed through.
       Deliberately narrow: courts/methodology.html states "court_reviews is
       empty" and "there are no reviews", which must keep passing. */
    /* PROVENANCE. Every marketing image the page uses is looked up in
       data/marketing-assets.json.

         approvedForMarketing === false  -> fail. Somebody opened it and it is
                                            unsafe (upcoming absolute date, the
                                            misleading verified badge, DUPR, a
                                            fabricated rating).
         audit === null                  -> warn. Nobody has looked. Unaudited
                                            is not the same as safe.

       The filename list below is REDUNDANT with the manifest today and stays
       anyway until iOS plans 091 + 092 land and the set is recaptured — belt
       and braces while the manifest is still being filled in. Retire it then,
       not before, and retire it in favour of provenance rather than trust. */
    if (SELLING.test(rel)) {
      for (const m of text.matchAll(/src="\/images\/(?:app|web)\/([a-z0-9._-]+\.webp)"/g)) {
        const rec = assetManifest[m[1]];
        if (!rec) { warns.push(`${rel}: ${m[1]} has no provenance record — add one to data/marketing-assets.json`); continue; }
        if (rec.approvedForMarketing === false) {
          const why = [rec.containsUpcomingDate && 'an upcoming absolute date',
                       rec.containsVerifiedBadge && 'the misleading verified badge',
                       rec.containsDupr && 'DUPR', rec.containsRatingOrReviewCount && 'a rating'].filter(Boolean);
          fail(rel, `${m[1]} is not approved for marketing (${why.join(', ') || 'see notes'}). ` +
                    `Do not retouch or crop it; use another authentic state.`);
        } else if (!rec.audit) {
          warns.push(`${rel}: ${m[1]} has never been inspected. Open it, then set approvedForMarketing.`);
        }
      }
    }

    for (const shot of ['s1-play-open-games', 'game-join', 'game-detail', 's10-home-dashboard', 's9-week-schedule', 'game-roster']) {
      if (SELLING.test(rel) && new RegExp('src="[^"]*' + shot).test(text)) {
        fail(rel, `uses ${shot}.webp, whose "upcoming" game shows an absolute date — ` +
                  `blocked until the 091/092 recapture. Do not retouch or crop it; use another authentic state.`);
      }
    }

    if (SELLING.test(rel)) {
      const asContent = text.match(/(?:,|and|with|plus)\s+(?:reviews|photos)\b|\breviews and photos\b/i);
      if (asContent) fail(rel, `"${asContent[0].trim()}" presents an empty dataset as content — ` +
                               `court_reviews and court_photos both have zero rows`);
    }
  }
  for (const [phrase, why] of Object.entries({
    'user-scalable=no': 'disables pinch zoom (WCAG 2.2 SC 1.4.4)',
    'maximum-scale=1': 'disables pinch zoom (WCAG 2.2 SC 1.4.4)',
    'We will email you at launch': 'PickleCue launched on 2026-08-24',
    'Be first at launch': 'PickleCue launched on 2026-08-24',
    'Get early access': 'PickleCue launched on 2026-08-24',
  })) {
    if (text.includes(phrase)) fail(rel, `stale copy "${phrase}" — ${why}`);
  }
}

/* -------------------------------------------------------------- canonical */
/* Cloudflare Pages serves /players and 308s /players.html to it. A canonical
   pointing at the redirecting form tells Google the preferred URL is one it
   is simultaneously told not to use. Verified live on 2026-08-25: .html 308s
   for players, organizers, community, clubs, support, privacy, terms,
   scorekeeper and live. */
function scanCanonical(rel, text) {
  const m = text.match(/<link rel="canonical" href="([^"]+)"/);
  if (!m) return;
  if (/\.html(\?|#|$)/.test(m[1])) fail(rel, `canonical points at "${m[1]}", which the host 308-redirects`);
  if (!m[1].startsWith('https://www.picklecue.com')) fail(rel, `canonical is not on the www apex: ${m[1]}`);
}

/* ------------------------------------------------------------------- run */
for (const f of htmlFiles()) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const text = readFileSync(f, 'utf8');
  if (!GENERATED_COURT_PAGES.test(rel)) scanNumbers(rel, text);
  scanPhrases(rel, text);
  scanCanonical(rel, text);
}

/* The directory totals are generated by build_site.py. Assert they still match
   what claims.json says, so a regeneration that shifts the number forces the
   claims file (and any prose quoting it) to be updated in the same commit. */
const { publishedLocations, publishedCities, publishedStates } = claims.web;
for (const page of ['courts/index.html', 'courts/us.html']) {
  const text = readFileSync(join(ROOT, page), 'utf8');
  /* Parses the state cards. Phase D added a comma-formatted count and an
     explicit "court locations" label, and this assertion correctly failed until
     it was taught the new shape — the fix is to follow the markup, never to
     loosen the check into something that would pass on anything. */
  const nums = [...text.matchAll(/<b>([\d,]+)<\/b><span>/g)].map(m => +m[1].replace(/,/g, ''));
  const cities = [...text.matchAll(/(\d+) (?:city|cities)<\/em>/g)].map(m => +m[1]);
  const sum = nums.reduce((a, b) => a + b, 0);
  const citySum = cities.reduce((a, b) => a + b, 0);
  if (sum !== publishedLocations) fail(page, `state cards total ${sum}, claims.json says ${publishedLocations}`);
  if (citySum !== publishedCities) fail(page, `city counts total ${citySum}, claims.json says ${publishedCities}`);
  if (nums.length !== publishedStates) fail(page, `${nums.length} state cards, claims.json says ${publishedStates}`);
  if (!text.includes(publishedLocations.toLocaleString('en-US'))) fail(page, `prose does not quote ${publishedLocations.toLocaleString('en-US')}`);
}

/* The app figure is quoted in prose on several pages. Wherever a page claims
   an app-wide court number it must be the current one. */
const appLoc = claims.app.courtLocations.toLocaleString('en-US');
const appCourts = claims.app.playingCourts.toLocaleString('en-US');
for (const f of htmlFiles()) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (GENERATED_COURT_PAGES.test(rel)) continue;
  const text = readFileSync(f, 'utf8');
  const m = text.match(/([\d,]{5,7})\s+court locations/i);
  if (m && m[1] !== appLoc && m[1] !== claims.web.publishedLocations.toLocaleString('en-US')) {
    fail(rel, `"${m[1]} court locations" is neither the app figure (${appLoc}) nor the published figure`);
  }
  const c = text.match(/([\d,]{5,7})\s+(?:pickleball\s+)?courts\b/i);
  if (c && ![appCourts, appLoc, claims.web.publishedLocations.toLocaleString('en-US')].includes(c[1])) {
    fail(rel, `"${c[1]} courts" matches no verified figure`);
  }
}

if (warns.length) {
  console.warn(`\nCLAIM GATE: ${warns.length} asset(s) with no provenance record — not blocking:\n`);
  for (const w of [...new Set(warns)]) console.warn('  ? ' + w);
  console.warn('');
}
if (fails.length) {
  console.error(`\nCLAIM GATE: ${fails.length} violation(s)\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  console.error('\nSource of truth: data/claims.json (verified ' + claims.verifiedOn + ')\n');
  process.exit(1);
}
console.log(`Claim gate holds. App: ${appLoc} court locations / ${appCourts} courts. ` +
            `Web: ${publishedLocations.toLocaleString('en-US')} locations in ${publishedCities} cities, ${publishedStates} states.`);
