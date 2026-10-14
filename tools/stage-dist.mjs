#!/usr/bin/env node
/**
 * Stage the public site into dist/ — an ALLOWLIST, not the repo.
 *
 * WHY THIS EXISTS
 * deploy.yml used to run `wrangler pages deploy .`, which published the whole
 * repository. On 2026-09-26 an audit found 166 internal files answering 200 on
 * www.picklecue.com: MARKETING_DEMO_DELIVERY.md (a personal email address, a
 * test account, a user UUID), docs/ audits, tools/, tests/, .github/, .agents/,
 * data/claims.json. Nothing on the site ever linked to them; they were public
 * simply because they were in the folder.
 *
 * Now only the paths below are copied. A new top-level folder is private until
 * someone adds it here on purpose.
 *
 * functions/ is NOT copied: wrangler reads Pages Functions from ./functions in
 * the directory it runs in, beside the output directory.
 *
 * After copying, every local reference in every staged HTML/CSS/JS file must
 * resolve inside dist/ (or be a route served by _redirects or functions/), so
 * a missing folder fails the deploy instead of breaking the live site.
 *
 *   node tools/stage-dist.mjs          (writes ./dist, exits 1 on a broken reference)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Top-level entries that make up the public site.
const DIRS = ['.well-known', 'assets', 'bracket', 'courts', 'demo', 'events',
  'fonts', 'images', 'keepscore', 'marketing', 'videos/hero'];
const FILES = ['_headers', '_redirects', 'robots.txt', 'sitemap.xml', 'manifest.json', 'fonts.css'];
// Published when present (added by the P2 audit PR).
const OPTIONAL_FILES = ['favicon.ico'];
// Every root *.html is public EXCEPT these (ended-event print posters).
const ROOT_HTML_EXCLUDE = new Set(['poster-p4p.html', 'poster-p4p-stories.html']);
// Never publish source/notes, even inside a public folder.
const DENY_EXT = new Set(['.md', '.py', '.mjs', '.sh', '.yml', '.yaml', '.toml', '.map']);
const DENY_NAME = new Set(['.DS_Store']);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);

let copied = 0;
const copyFile = (rel) => {
  const base = rel.split('/').pop();
  if (DENY_NAME.has(base) || DENY_EXT.has(extname(rel))) return;
  mkdirSync(dirname(join(DIST, rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(DIST, rel));
  copied++;
};
const walk = (rel) => {
  for (const name of readdirSync(join(ROOT, rel))) {
    const r = `${rel}/${name}`;
    if (statSync(join(ROOT, r)).isDirectory()) walk(r); else copyFile(r);
  }
};

for (const f of readdirSync(ROOT)) {
  if (f.endsWith('.html') && !ROOT_HTML_EXCLUDE.has(f)) copyFile(f);
}
for (const f of FILES) copyFile(f);
for (const f of OPTIONAL_FILES) if (existsSync(join(ROOT, f))) copyFile(f);
for (const d of DIRS) {
  if (!existsSync(join(ROOT, d))) { console.error(`STAGE: allowlisted folder missing: ${d}`); process.exit(1); }
  walk(d);
}

/* ---------------------------------------------------------- verification */

// Routes that exist only as _redirects rules or Pages Functions.
const redirectSources = readFileSync(join(ROOT, '_redirects'), 'utf8').split('\n')
  .map(l => l.split('#')[0].trim().split(/\s+/)[0]).filter(Boolean)
  .map(s => s.replace(/\*.*$/, '').replace(/:.*$/, ''));
const functionRoutes = [];
const walkFns = (rel) => {
  for (const name of readdirSync(join(ROOT, rel))) {
    const r = `${rel}/${name}`;
    if (statSync(join(ROOT, r)).isDirectory()) walkFns(r);
    else functionRoutes.push('/' + r.slice('functions/'.length).replace(/\.(js|ts)$/, '').replace(/\[.*$/, '').replace(/index$/, ''));
  }
};
if (existsSync(join(ROOT, 'functions'))) walkFns('functions');
const isRoute = (p) => [...redirectSources, ...functionRoutes].some(r => r && r !== '/' && p.startsWith(r));

const exists = (p) => {
  const q = decodeURIComponent(p.split(/[?#]/)[0]);
  if (q === '/' || q === '') return true;
  const f = join(DIST, q);
  // A trailing-slash prefix that code joins with a filename ('assets/avatars/' + id).
  if (q.endsWith('/') && existsSync(f) && statSync(f).isDirectory()) return true;
  return [f, `${f}.html`, join(f, 'index.html')].some(c => existsSync(c) && statSync(c).isFile())
    || (existsSync(f) && statSync(f).isDirectory() && existsSync(join(f, 'index.html')));
};

const REF = /(?:\s(?:src|href|poster|action)=["']|url\(\s*["']?|fetch\(\s*["'])([^"')\s>]+)/g;
const broken = [];
const scan = (rel) => {
  for (const name of readdirSync(join(DIST, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    const abs = join(DIST, r);
    if (statSync(abs).isDirectory()) { scan(r); continue; }
    if (!/\.(html|css|js)$/.test(name) || r.startsWith('assets/vendor/')) continue;
    const s = readFileSync(abs, 'utf8');
    for (const m of s.matchAll(REF)) {
      let ref = m[1];
      if (/^(?:[a-z]+:|\/\/|#|\$|\{|data:)/i.test(ref) || ref.includes('${') || ref.includes('{{')) continue;
      // Relative URLs in JS resolve against the PAGE, not the script. Every page
      // that loads assets/*.js sits at the site root, so resolve those from /.
      const from = name.endsWith('.js') ? DIST : dirname(abs);
      const bare = ref.split(/[?#]/)[0];
      const path = ref.startsWith('/') ? ref
        : '/' + relative(DIST, resolve(from, bare)) + (bare.endsWith('/') ? '/' : '');
      if (!exists(path) && !isRoute(path)) broken.push(`${r} -> ${ref}`);
    }
  }
};
scan('');

const uniq = [...new Set(broken)];
if (uniq.length) {
  console.error(`STAGE: ${uniq.length} local reference(s) do not resolve inside dist/:`);
  uniq.slice(0, 40).forEach(b => console.error('  ' + b));
  process.exit(1);
}
console.log(`Staged ${copied} file(s) into dist/; every local reference resolves.`);
