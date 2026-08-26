#!/usr/bin/env node
/**
 * Would enforcing the CSP break anything?
 *
 * The policy in _headers has run as Report-Only since launch. Report-Only means
 * the browser reports and then loads the resource anyway, so "no reports" is
 * only weak evidence: it depends on a report endpoint nobody configured, and on
 * somebody having visited every page type in every state.
 *
 * This answers the question directly instead. It reads the policy out of
 * _headers, serves it as ENFORCING, loads every template in both engines, and
 * collects every securitypolicyviolation the document fires. A resource that
 * would be blocked in production is blocked here, in front of a check.
 *
 * WebKit is not optional here. Safari's CSP implementation differs from
 * Chrome's — most visibly around blob:, inline event handlers and how
 * 'unsafe-inline' interacts with a nonce — and the audience is an iPhone.
 *
 *   node tools/checks/csp.mjs            enforce the _headers policy
 *   node tools/checks/csp.mjs --strict   also try it WITHOUT 'unsafe-inline'
 */
import { chromium, webkit } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withSite, VIEWPORTS, ROOT } from '../measure/lib.mjs';
import { TEMPLATES } from './templates.mjs';

/* Read the live policy rather than restating it — a copy in this file is a copy
   that goes stale the first time somebody edits _headers. */
const headersFile = readFileSync(join(ROOT, '_headers'), 'utf8');
const m = headersFile.match(/Content-Security-Policy-Report-Only:\s*(.+)/);
if (!m) { console.error('No Content-Security-Policy-Report-Only found in _headers.'); process.exit(2); }
const POLICY = m[1].trim();

const STRICT = process.argv.includes('--strict');
const variants = [['as written in _headers', POLICY]];
if (STRICT) variants.push(["without 'unsafe-inline'", POLICY.replace(/ 'unsafe-inline'/g, '')]);

console.log('\n  Policy under test:\n');
for (const d of POLICY.split(';')) console.log('     ' + d.trim());

const found = [];
for (const [variantName, policy] of variants) {
  console.log(`\n  ── ${variantName} ──`);
  await withSite(async ({ origin }) => {
    for (const [engineName, engine, opts] of [['chromium', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
      const browser = await engine.launch({ headless: true, ...opts });
      try {
        for (const [path, label] of TEMPLATES) {
          const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[0].width, height: VIEWPORTS[0].height } });
          const page = await ctx.newPage();
          await page.addInitScript(() => {
            window.__csp = [];
            document.addEventListener('securitypolicyviolation', e => window.__csp.push({
              directive: e.effectiveDirective || e.violatedDirective,
              blocked: (e.blockedURI || '').slice(0, 90),
              line: e.lineNumber || 0,
            }));
          });
          const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
          if (!resp) { found.push({ variantName, engineName, label, directive: 'PAGE FAILED TO LOAD', blocked: path }); await ctx.close(); continue; }
          await page.waitForTimeout(1200);
          /* Exercise the enhancements, not just the initial paint — a blocked
             blob: worker or an inline handler only shows when something runs. */
          await page.evaluate(() => {
            document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'));
            const s = document.getElementById('courtSearchInput');
            if (s) { s.focus(); s.value = 'austin'; s.dispatchEvent(new Event('input')); }
            const t = document.querySelector('.theme-toggle'); if (t) t.click();
          }).catch(() => {});
          await page.waitForTimeout(1500);
          const v = await page.evaluate(() => window.__csp || []);
          for (const x of v) found.push({ variantName, engineName, label, ...x });
          await ctx.close();
        }
      } finally { await browser.close(); }
      process.stdout.write(`     ${engineName}: ${TEMPLATES.length} templates loaded\n`);
    }
  }, { headers: { 'Content-Security-Policy': policy } });
}

/* One directive + one blocked URI is one problem however many pages show it. */
const uniq = new Map();
for (const f of found) {
  const k = `${f.variantName}|${f.engineName}|${f.directive}|${f.blocked}`;
  if (!uniq.has(k)) uniq.set(k, { ...f, pages: new Set() });
  uniq.get(k).pages.add(f.label);
}

console.log(`\n  VIOLATIONS UNDER ENFORCEMENT — ${uniq.size} distinct\n`);
if (!uniq.size) console.log('     none. Every template loads and behaves under the policy as written.\n');
for (const v of uniq.values())
  console.log(`     ${v.variantName.padEnd(24)} ${v.engineName.padEnd(9)} ${v.directive.padEnd(14)} ${v.blocked}\n${' '.repeat(24)}on: ${[...v.pages].join(', ')}\n`);

const blocking = [...uniq.values()].filter(v => v.variantName === variants[0][0]);
process.exit(blocking.length ? 1 : 0);
