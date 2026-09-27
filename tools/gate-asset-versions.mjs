#!/usr/bin/env node
/**
 * A changed asset must get a new ?v=.
 *
 * WHY THIS EXISTS
 * _headers serves /assets/* as `public, max-age=31536000, immutable`. The only
 * thing that makes a returning visitor fetch new CSS or JS is a new URL, and
 * the URL only changes when every page bumps the asset's ?v= query.
 *
 * Edit site-v2.css without bumping it and the deploy succeeds, CI is green,
 * a fresh browser shows the fix — and everyone who has visited in the last
 * year keeps the old file. The 2026-09-25 mobile-overflow fix (#43) had to
 * bump three stylesheets across 4,115 files by hand to avoid exactly that.
 *
 * WHAT IT CHECKS
 * For every file under assets/ that differs between BASE and HEAD, and existed
 * in both: no reference in HEAD may still carry a ?v= value that BASE used for
 * that asset. References are searched in deployed pages and in the court-page
 * generator (tools/courtgen), which writes the versions into 4,104 pages.
 *
 * Assets referenced with no ?v= at all cannot be busted by this mechanism.
 * They are reported as a WARNING, not a failure, so this gate lands green.
 *
 *   node tools/gate-asset-versions.mjs [--base <git-ref>]   (default origin/main)
 */
import { execFileSync } from 'node:child_process';

const argBase = process.argv.indexOf('--base');
let base = argBase > -1 ? process.argv[argBase + 1] : 'origin/main';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

// A push that creates a branch reports an all-zero "before" SHA; a shallow
// clone may not have the base at all. Fall back to origin/main rather than
// silently passing on an empty diff.
if (!base || /^0+$/.test(base) || tryGit('cat-file', '-e', `${base}^{commit}`) === null) {
  console.log(`Asset-version gate: base "${base}" unavailable, using origin/main.`);
  base = 'origin/main';
}
const mergeBase = tryGit('merge-base', base, 'HEAD')?.trim();
if (!mergeBase) {
  console.error(`ASSET-VERSION GATE: cannot resolve a merge base with ${base}. ` +
    'Check out with fetch-depth: 0.');
  process.exit(1);
}

// Where versions are written: deployed pages plus the court-page generator.
const PATHSPEC = ['--', '*.html', 'tools/courtgen/*.py',
  ':!node_modules/**', ':!docs/**', ':!archive/**'];

const changed = git('diff', '--name-only', '--diff-filter=M', `${mergeBase}`, 'HEAD', '--', 'assets/')
  .split('\n').filter(Boolean);

// All "assets/<file>?v=<value>" references in one tree, as file -> Set(values).
const versionsIn = (rev, asset) => {
  const re = `assets/${asset.replace(/[.[\]()*+?^$|\\]/g, '\\$&')}\\?v=[A-Za-z0-9._-]+`;
  const out = tryGit('grep', '-hoE', re, ...(rev ? [rev] : []), ...PATHSPEC) || '';
  return new Set(out.split('\n').filter(Boolean).map(l => l.split('?v=')[1]));
};
const filesWith = (asset, value) =>
  (tryGit('grep', '-lF', `assets/${asset}?v=${value}`, ...PATHSPEC) || '').split('\n').filter(Boolean);
const unversioned = (asset) => {
  const re = `assets/${asset.replace(/[.[\]()*+?^$|\\]/g, '\\$&')}([^?A-Za-z0-9._-]|$)`;
  return (tryGit('grep', '-lE', re, ...PATHSPEC) || '').split('\n').filter(Boolean);
};

let failed = 0;
for (const path of changed) {
  const asset = path.slice('assets/'.length);
  const before = versionsIn(mergeBase, asset);
  const after = versionsIn(null, asset);
  const stale = [...after].filter(v => before.has(v));
  if (stale.length) {
    failed++;
    console.error(`ASSET-VERSION GATE: ${path} changed, but these references still use the old ?v=:`);
    for (const v of stale) {
      const files = filesWith(asset, v);
      console.error(`  ?v=${v} in ${files.length} file(s): ${files.slice(0, 5).join(', ')}${files.length > 5 ? ', …' : ''}`);
    }
  }
  const bare = unversioned(asset);
  if (bare.length) {
    console.log(`WARNING: ${path} changed and is referenced with NO ?v= in ${bare.length} file(s) ` +
      `(${bare.slice(0, 3).join(', ')}${bare.length > 3 ? ', …' : ''}). ` +
      'Returning visitors keep the cached copy for up to a year.');
  }
}

if (failed) {
  console.error(`\n${failed} changed asset(s) not re-versioned. Bump ?v= in every page ` +
    'AND in tools/courtgen/shell.py, in the same commit.');
  process.exit(1);
}
console.log(`Asset-version gate holds: ${changed.length} changed asset(s) since ${mergeBase.slice(0, 8)}, ` +
  'none still referenced by an old ?v=.');
