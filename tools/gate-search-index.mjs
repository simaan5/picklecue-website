#!/usr/bin/env node
/**
 * Search-index integrity gate.
 *
 * The court search promises that every result is a real page on this site. That
 * is only true if every path the index can produce exists on disk. The index and
 * the pages come from the same generator run, so they agree today — this makes
 * sure they still agree after someone changes a slug rule, a city filter or
 * MIN_COURTS and regenerates only half the pipeline.
 *
 * It also caps the index size, so nobody quietly turns a lazy 58 KB fetch into a
 * half-megabyte one.
 *
 * Run: node tools/gate-search-index.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = join(ROOT, 'assets/courts-search-index.json');
/* Brotli, because that is what Cloudflare serves. Chosen as roughly 2.5x the
   current size: room for the directory to grow, not room to stop noticing. */
const MAX_BROTLI_KB = 150;

const fails = [];
if (!existsSync(FILE)) {
  console.error('SEARCH INDEX GATE: assets/courts-search-index.json is missing. Run tools/courtgen/build_site.py.');
  process.exit(1);
}

const raw = readFileSync(FILE);
const j = JSON.parse(raw.toString('utf8'));
const kb = n => (n / 1024).toFixed(1);
const br = brotliCompressSync(raw).length;

console.log(`index: ${kb(raw.length)} KB raw | ${kb(gzipSync(raw, { level: 9 }).length)} KB gzip | ${kb(br)} KB brotli`);
console.log(`       ${j.n.st} states, ${j.n.ci} cities, ${j.n.co} courts`);

if (br / 1024 > MAX_BROTLI_KB) {
  fails.push(`index is ${kb(br)} KB brotli, over the ${MAX_BROTLI_KB} KB cap. ` +
             `Shard it by state or prefix — do not move public search onto an authenticated RPC.`);
}

/* Rebuild every path exactly the way assets/courtsearch.js does, and confirm the
   file behind it exists. Cloudflare Pages serves /a/b from a/b.html, so both
   shapes count. */
const seen = new Set();
const missing = [];
const check = (p) => {
  if (seen.has(p)) return;
  seen.add(p);
  const rel = p.replace(/^\//, '');
  if (!existsSync(join(ROOT, rel + '.html')) && !existsSync(join(ROOT, rel, 'index.html'))) missing.push(p);
};

j.st.forEach(s => check('/courts/us/' + s[1]));
j.ci.forEach(c => check('/courts/us/' + j.st[c[0]][1] + '/' + c[2]));
j.co.forEach(k => {
  const c = j.ci[k[0]];
  check('/courts/us/' + j.st[c[0]][1] + '/' + c[2] + '/' + k[2]);
});

if (missing.length) {
  fails.push(`${missing.length} of ${seen.size} indexed paths have no page:\n      ` +
             missing.slice(0, 8).join('\n      ') + (missing.length > 8 ? `\n      …and ${missing.length - 8} more` : ''));
}

/* Fields that must never appear in a public search index. `verified` marks the
   import source, not a checked place (iOS plan 091); ratings and photos have no
   rows at all. None of them belongs in a ranking. */
const text = raw.toString('utf8');
for (const bad of ['verified', 'rating', 'review', 'photo', 'popular', 'lat', 'lng']) {
  if (new RegExp('"' + bad, 'i').test(text)) fails.push(`index contains a "${bad}" key — it should not`);
}

if (fails.length) {
  console.error(`\nSEARCH INDEX GATE: ${fails.length} problem(s)\n`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Search index gate holds. ${seen.size} unique paths, all present.`);
