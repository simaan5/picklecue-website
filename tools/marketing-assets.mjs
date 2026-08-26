#!/usr/bin/env node
/* Marketing asset provenance.
 *
 * WHY
 * Right now the claim gate blocks six screenshots BY FILENAME, because someone
 * looked at them and found an upcoming game with an absolute date. That works
 * today and rots tomorrow: after the 091/092 recapture those filenames become
 * safe, the obvious move is to delete the rule, and the site goes back to
 * trusting screenshots because a person remembers what is in them.
 *
 * A screenshot cannot be grepped. So it gets a record instead.
 *
 * HONESTY RULES FOR THIS FILE
 *
 *   1. Facts that can be derived are derived: bytes, dimensions, sha256, file
 *      mtime. `fileModified` is the file's mtime — it is NOT a claim about when
 *      the screenshot was captured, and it must not be relabelled as one.
 *   2. Facts that require looking at the image are recorded ONLY when somebody
 *      has looked, with who/when in `audit`.
 *   3. `sourceBuild` stays null until the capture pipeline records it. An
 *      invented build number is worse than a null one.
 *   4. Unaudited is not innocent. An asset with no audit cannot be
 *      `approvedForMarketing`, and the gate says so.
 *
 *   node tools/marketing-assets.mjs --refresh   re-derive the mechanical facts
 *   node tools/marketing-assets.mjs             print the audit state
 */
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = join(ROOT, 'data/marketing-assets.json');

/** WebP dimensions from the VP8/VP8L/VP8X chunk header. */
function webpSize(buf) {
  const i = buf.indexOf('VP8X'), l = buf.indexOf('VP8L'), v = buf.indexOf('VP8 ');
  if (i > 0) return { w: 1 + buf.readUIntLE(i + 8, 3), h: 1 + buf.readUIntLE(i + 11, 3) };
  if (v > 0) return { w: buf.readUInt16LE(v + 14) & 0x3fff, h: buf.readUInt16LE(v + 16) & 0x3fff };
  if (l > 0) {
    const b = buf.readUInt32LE(l + 9);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return { w: 0, h: 0 };
}

const manifest = JSON.parse(readFileSync(FILE, 'utf8'));

if (process.argv.includes('--refresh')) {
  for (const [name, rec] of Object.entries(manifest.assets)) {
    const abs = join(ROOT, rec.path);
    if (!existsSync(abs)) { rec.missing = true; continue; }
    delete rec.missing;
    const buf = readFileSync(abs);
    const { w, h } = webpSize(buf);
    rec.bytes = buf.length;
    rec.width = w; rec.height = h;
    rec.sha256 = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    rec.fileModified = statSync(abs).mtime.toISOString().slice(0, 10);
    /* Approval is bound to the BYTES that were inspected. If the file changes
       under a filename that was already approved, the approval is void — that
       is the whole hole a filename-keyed manifest would otherwise leave open. */
    if (rec.audit && rec.audit.sha256 && rec.audit.sha256 !== rec.sha256) {
      rec.approvedForMarketing = null;
      rec.audit = { ...rec.audit, invalidatedOn: new Date().toISOString().slice(0, 10),
                    invalidatedBecause: `file changed since audit (${rec.audit.sha256} -> ${rec.sha256})` };
      console.log(`  ! ${name}: bytes changed since audit — approval revoked`);
    }
  }
  writeFileSync(FILE, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`refreshed ${Object.keys(manifest.assets).length} records`);
}

const rows = Object.entries(manifest.assets);
const unaudited = rows.filter(([, r]) => !r.audit);
const unsafe = rows.filter(([, r]) => r.approvedForMarketing === false);
console.log(`\n${rows.length} assets | ${rows.length - unaudited.length} audited | ${unsafe.length} not approved\n`);
for (const [name, r] of rows) {
  const flags = [
    r.containsUpcomingDate && 'upcoming-date',
    r.containsVerifiedBadge && 'verified-badge',
    r.containsDupr && 'dupr',
    r.containsRatingOrReviewCount && 'rating',
  ].filter(Boolean);
  const state = r.approvedForMarketing === true ? 'ok'
              : r.approvedForMarketing === false ? 'BLOCKED' : 'unaudited';
  console.log(`  ${state.padEnd(9)} ${name.padEnd(34)} ${flags.join(' ') || (r.audit ? 'clean' : '')}`);
}
console.log('');
