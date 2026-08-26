#!/usr/bin/env node
/**
 * Structured data: parse it, then hold it to Google's own required list.
 *
 * WHY
 * JSON-LD is the one part of a page nobody looks at. A trailing comma, a
 * relative image URL or a missing `location` costs the rich result silently —
 * there is no visual symptom and no console error. The event page's node is
 * generated now (tools/build-event.mjs), so this proves the generator, and it
 * covers the hand-written nodes on every other page at the same time.
 *
 * Required properties are Google's, not schema.org's superset: schema.org marks
 * almost nothing as required, so validating against it proves nothing useful.
 *
 * A 4,104-page site can't afford a per-page browser, so this is a pure parse.
 * It samples the generated court pages rather than reading every one.
 *
 *   node tools/gate-schema.mjs           sample the generated pages
 *   node tools/gate-schema.mjs --all     every page
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALL = process.argv.includes('--all');
const SKIP = new Set(['node_modules', '.git', 'videos', 'images', 'assets', 'fonts', 'tools', 'Website', 'data', 'legal']);

/* Google's required properties per rich-result type. Anything not listed is
   parsed and structurally checked but not required to carry a shape. */
const REQUIRED = {
  Event: ['name', 'startDate', 'location'],
  SportsEvent: ['name', 'startDate', 'location'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  SoftwareApplication: ['name'],
  Organization: ['name'],
  WebSite: ['name', 'url'],
};
/* Properties that must be an absolute URL if present — a relative one is
   silently dropped by every consumer. */
const URLISH = ['url', 'image', 'logo', 'sameAs', 'contentUrl', 'target'];

function pages(dir = ROOT, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n) || n.startsWith('.')) continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) pages(f, out);
    else if (n.endsWith('.html')) out.push(f);
  }
  return out;
}

const fails = [], warns = [];
let blocks = 0, checked = 0;

function walk(node, rel, path = '$') {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, rel, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return;
  const type = node['@type'];
  if (typeof type === 'string' && REQUIRED[type]) {
    for (const k of REQUIRED[type])
      if (node[k] === undefined || node[k] === null || node[k] === '')
        fails.push(`${rel} ${path} (${type}): missing required property "${k}"`);
  }
  for (const k of URLISH) {
    const v = node[k];
    for (const u of (Array.isArray(v) ? v : [v]))
      if (typeof u === 'string' && u && !/^https?:\/\//.test(u) && !/^\//.test(u) === false)
        fails.push(`${rel} ${path}.${k} is relative ("${u}") — consumers drop it. Use an absolute https URL.`);
      else if (typeof u === 'string' && u && !/^https?:\/\//.test(u))
        fails.push(`${rel} ${path}.${k} is not an absolute URL ("${u}").`);
  }
  /* schema.org enumerations must be full URLs, not bare tokens. */
  for (const k of ['eventStatus', 'eventAttendanceMode', 'availability', 'itemCondition'])
    if (typeof node[k] === 'string' && !node[k].startsWith('https://schema.org/'))
      fails.push(`${rel} ${path}.${k} = "${node[k]}" — must be a https://schema.org/ URL.`);
  if (type === 'Offer' && node.price !== undefined && !node.priceCurrency)
    fails.push(`${rel} ${path} (Offer): has price but no priceCurrency.`);
  for (const k of ['startDate', 'endDate', 'validFrom', 'previousStartDate'])
    if (typeof node[k] === 'string' && isNaN(new Date(node[k])))
      fails.push(`${rel} ${path}.${k} = "${node[k]}" is not a parseable date.`);
  for (const v of Object.values(node)) walk(v, rel, path);
}

const list = pages();
const sampled = ALL ? list : list.filter((f, i) => !/courts\/us\//.test(f) || i % 37 === 0);

for (const f of sampled) {
  const rel = relative(ROOT, f);
  const s = readFileSync(f, 'utf8');
  checked++;
  for (const m of s.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    blocks++;
    let data;
    try { data = JSON.parse(m[1]); }
    catch (e) { fails.push(`${rel}: JSON-LD does not parse — ${e.message}`); continue; }
    if (!data['@context'] && !Array.isArray(data))
      warns.push(`${rel}: JSON-LD block has no @context.`);
    walk(data, rel);
  }
}

/* Google lists these as recommended for Event. Missing them costs detail in the
   rich result, so they warn rather than fail. */
for (const f of sampled) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let d; try { d = JSON.parse(m[1]); } catch { continue; }
    for (const n of (Array.isArray(d) ? d : [d])) {
      if (!/Event$/.test(n['@type'] || '')) continue;
      for (const k of ['description', 'endDate', 'eventStatus', 'eventAttendanceMode', 'image', 'organizer'])
        if (n[k] === undefined) warns.push(`${relative(ROOT, f)} (${n['@type']}): recommended property "${k}" is absent.`);
    }
  }
}

for (const w of warns) console.warn('  ⚠ ' + w);
if (fails.length) {
  console.error(`\nSCHEMA GATE: ${fails.length} problem(s)\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log(`Schema gate holds: ${blocks} JSON-LD block(s) across ${checked} page(s)${ALL ? '' : ' (court pages sampled; --all for every page)'}, all parse and carry Google's required properties.`);
