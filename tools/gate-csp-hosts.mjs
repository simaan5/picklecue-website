#!/usr/bin/env node
/**
 * Every external host a page references must be in the CSP.
 *
 * WHY THIS EXISTS
 * The policy ran as Report-Only, so nothing broke and nothing complained. A
 * runtime audit found that SIX pages — /live, /organizer, /scorekeeper,
 * /checkin, /e and the poster export — load @supabase/supabase-js from
 * cdn.jsdelivr.net, a host `script-src` has never allowed. Flipping the policy
 * to enforcing would have taken down live scoring, the organizer console,
 * scorekeeper mode and check-in, while every marketing page kept working and
 * looked completely fine.
 *
 * Report-Only is a promise to look later. This is looking now, statically, on
 * every push — no browser, no network, no waiting for someone to visit the
 * right page.
 *
 * It reads the policy out of _headers rather than restating it, so the two
 * cannot drift.
 *
 *   node tools/gate-csp-hosts.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/* tests/ holds fixtures that are never deployed; they reference a local
   fixture server and are not subject to the production policy. */
const SKIP = new Set(['node_modules', '.git', 'videos', 'images', 'fonts', 'Website', 'tests']);

const policyLine = readFileSync(join(ROOT, '_headers'), 'utf8')
  .match(/Content-Security-Policy(?:-Report-Only)?:\s*(.+)/)?.[1]?.trim();
if (!policyLine) { console.error('No Content-Security-Policy in _headers.'); process.exit(2); }

const directives = {};
for (const d of policyLine.split(';')) {
  const [name, ...vals] = d.trim().split(/\s+/);
  if (name) directives[name] = vals;
}
const allowed = (directive, host) => {
  const list = directives[directive] || directives['default-src'] || [];
  return list.some(v => v === `https://${host}` || v === `http://${host}` || v === host ||
                        (v.startsWith('https://*.') && host.endsWith(v.slice(9))));
};

/* Which directive governs which attribute. */
const RULES = [
  { re: /<script[^>]+src="(https?:\/\/[^"]+)"/gi,                       directive: 'script-src' },
  { re: /<link[^>]+rel="stylesheet"[^>]+href="(https?:\/\/[^"]+)"/gi,   directive: 'style-src' },
  { re: /<link[^>]+href="(https?:\/\/[^"]+)"[^>]+rel="stylesheet"/gi,   directive: 'style-src' },
  { re: /<img[^>]+src="(https?:\/\/[^"]+)"/gi,                          directive: 'img-src' },
  { re: /<iframe[^>]+src="(https?:\/\/[^"]+)"/gi,                       directive: 'frame-src' },
  /* fetch/XHR/WebSocket targets written as string literals in inline script. */
  { re: /(?:fetch|WebSocket)\(\s*['"`](https?:\/\/[^'"`]+)/gi,          directive: 'connect-src' },
  { re: /['"`](wss:\/\/[a-z0-9.-]+)/gi,                                 directive: 'connect-src' },
];

function pages(dir = ROOT, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP.has(n) || n.startsWith('.')) continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) pages(f, out);
    else if (/\.(html|js)$/.test(n)) out.push(f);
  }
  return out;
}

const problems = new Map();
let scanned = 0, refs = 0;
for (const f of pages()) {
  const rel = relative(ROOT, f);
  /* The generated court pages share one shell; scanning all 4,104 re-proves
     the same markup 4,103 times. */
  if (/^courts\/us\//.test(rel) && !/austin\.html$|^courts\/us\.html$/.test(rel)) continue;
  const s = readFileSync(f, 'utf8');
  scanned++;
  for (const { re, directive } of RULES) {
    for (const m of s.matchAll(re)) {
      let host;
      try { host = new URL(m[1].replace(/^wss:/, 'https:')).host; } catch { continue; }
      refs++;
      const scheme = m[1].startsWith('wss:') ? 'wss://' : 'https://';
      const list = directives[directive] || directives['default-src'] || [];
      const ok = scheme === 'wss://'
        ? list.some(v => v === `wss://${host}`)
        : allowed(directive, host);
      if (!ok) {
        const k = `${directive}|${scheme}${host}`;
        if (!problems.has(k)) problems.set(k, { directive, host: scheme + host, files: new Set() });
        problems.get(k).files.add(rel);
      }
    }
  }
}

if (problems.size) {
  console.error(`\nCSP HOST GATE: ${problems.size} host(s) referenced but not allowed by the policy\n`);
  for (const p of problems.values()) {
    console.error(`  ✗ ${p.directive.padEnd(12)} ${p.host}`);
    console.error(`       referenced by: ${[...p.files].sort().join(', ')}`);
    console.error(`       Either add it to ${p.directive} in _headers, or stop loading it.\n`);
  }
  console.error('  The policy is Report-Only today, so nothing visibly breaks — which is\n' +
                '  exactly why this must be caught here rather than on the day it is enforced.\n');
  process.exit(1);
}
console.log(`CSP host gate holds: ${refs} external reference(s) across ${scanned} file(s), every host covered by the policy in _headers.`);
