#!/usr/bin/env node
/* axe-core across every distinct page template, in both engines.
 *
 * WHY BOTH ENGINES
 * Every automated check in this repo so far has run in Chrome. The audience is
 * an iPhone, and iPhone means WebKit — not "Chrome with a different user
 * agent". WebKit computes accessible names, resolves :has(), applies
 * -webkit-text-size-adjust and lays out flex gaps differently, and a finding
 * that only appears there is a finding about the actual users.
 *
 * WHY EACH THEME LOADS FRESH
 * Flipping data-theme on a live page leaves colours composited mid-transition
 * and invents contrast failures — 33 of 37 findings in an earlier sweep were
 * that artifact. Each theme gets its own context and its own load.
 *
 * WHAT IS SAMPLED
 * The 4,104 generated court pages come from four templates. One page per
 * template is audited; auditing all of them would take an hour to re-prove the
 * same markup. The template list is asserted against the generator, so a new
 * template cannot slip past unaudited.
 *
 *   node tools/checks/axe.mjs                 both engines, both themes, both viewports
 *   node tools/checks/axe.mjs --engine=webkit only Safari's engine
 *   node tools/checks/axe.mjs --json          write docs/evidence/phase-i/axe.json
 */
import { chromium, webkit } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withSite, VIEWPORTS, ROOT } from '../measure/lib.mjs';
import { TEMPLATES } from './templates.mjs';

const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--engine=')) || '').split('=')[1];
const ENGINES = [['chromium', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]
  .filter(([n]) => !only || n === only);
const paths = args.filter(a => a.startsWith('/'));
const LIST = paths.length ? paths.map(p => [p, p]) : TEMPLATES;

const results = [];
await withSite(async ({ origin }) => {
  for (const [engineName, engine, launchOpts] of ENGINES) {
    const browser = await engine.launch({ headless: true, ...launchOpts });
    try {
      for (const [path, label] of LIST) {
        for (const theme of ['light', 'dark']) {
          for (const vp of VIEWPORTS) {
            const ctx = await browser.newContext({
              viewport: { width: vp.width, height: vp.height },
              colorScheme: theme,
              deviceScaleFactor: 2,
            });
            const page = await ctx.newPage();
            const consoleErrors = [];
            page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 140)); });
            page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 140)));
            const resp = await page.goto(origin + path, { waitUntil: 'load', timeout: 45000 }).catch(() => null);
            if (!resp || resp.status() !== 200) {
              results.push({ engine: engineName, path, label, theme, vp: vp.tag, error: `HTTP ${resp ? resp.status() : 'none'}` });
              await ctx.close(); continue;
            }
            await page.waitForTimeout(900);
            /* Reveal blocks are hidden until observed; audit what a reader who
               scrolls actually reaches, not just the first screen. */
            await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')));
            await page.addScriptTag({ content: AXE });
            const r = await page.evaluate(async () => await window.axe.run(document, {
              resultTypes: ['violations'],
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
            }));
            results.push({
              engine: engineName, path, label, theme, vp: vp.tag,
              consoleErrors,
              violations: r.violations.map(v => ({
                id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
                nodes: v.nodes.slice(0, 3).map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(1, 3).join(' | ').slice(0, 150) })),
              })),
            });
            await ctx.close();
          }
        }
        process.stdout.write('.');
      }
    } finally { await browser.close(); }
    process.stdout.write(` ${engineName} done\n`);
  }
});

/* Collapse: the same violation on the same selector in four theme/viewport
   combinations is one thing to fix, not four. */
const byKey = new Map();
for (const r of results) {
  for (const v of r.violations || []) {
    for (const n of v.nodes) {
      const k = `${r.engine}|${r.label}|${v.id}|${n.target}`;
      if (!byKey.has(k)) byKey.set(k, { ...r, ...v, target: n.target, summary: n.summary, where: new Set() });
      byKey.get(k).where.add(`${r.theme}/${r.vp}`);
    }
  }
}
const uniq = [...byKey.values()];
const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3, undefined: 4 };
uniq.sort((a, b) => RANK[a.impact] - RANK[b.impact] || a.label.localeCompare(b.label));

const errors = results.filter(r => r.error);
const consoles = results.filter(r => (r.consoleErrors || []).length);

console.log(`\n  ${results.length} audit run(s) · ${ENGINES.map(e => e[0]).join(' + ')} · ${LIST.length} template(s) · 2 themes · 2 viewports`);
if (errors.length) { console.log('\n  PAGES THAT DID NOT LOAD'); for (const e of errors) console.log(`     ${e.engine} ${e.path} ${e.theme}/${e.vp}: ${e.error}`); }
if (consoles.length) {
  console.log('\n  CONSOLE / PAGE ERRORS');
  const seen = new Set();
  for (const c of consoles) for (const m of c.consoleErrors) { const k = c.engine + c.label + m; if (!seen.has(k)) { seen.add(k); console.log(`     ${c.engine.padEnd(9)} ${c.label.padEnd(20)} ${m}`); } }
}
console.log(`\n  AXE VIOLATIONS — ${uniq.length} distinct (rule × template × selector)\n`);
for (const v of uniq)
  console.log(`     ${String(v.impact).padEnd(9)} ${v.engine.padEnd(9)} ${v.label.padEnd(20)} ${v.id.padEnd(28)} ${v.target.slice(0, 46)}\n${' '.repeat(22)}${v.help}\n${' '.repeat(22)}in ${[...v.where].join(', ')}${v.summary ? '\n' + ' '.repeat(22) + v.summary : ''}\n`);

if (args.includes('--json')) {
  mkdirSync(join(ROOT, 'docs/evidence/phase-i'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/evidence/phase-i/axe.json'),
    JSON.stringify({ runs: results.length, engines: ENGINES.map(e => e[0]), templates: LIST.length, distinct: uniq.map(v => ({ ...v, where: [...v.where] })) }, null, 2) + '\n');
  console.log('  wrote docs/evidence/phase-i/axe.json');
}
process.exit(uniq.filter(v => v.impact === 'critical' || v.impact === 'serious').length ? 1 : 0);
