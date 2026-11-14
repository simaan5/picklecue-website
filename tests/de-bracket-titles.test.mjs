// node tests/de-bracket-titles.test.mjs
// live.html Bracket tab, double elimination (s38):
//  1. the side headings ("Winners Bracket", ...) sit on the always-dark bracket panel; in the
//     light theme they were dark ink on near-black (1.14:1). They must reach 4.5:1 in both themes.
//  2. grand_final / reset_final sides were titled with the raw key ("grand_final"). They must read
//     "Grand Final" and "Grand Final — Reset", as in the iPhone app.
// Local only: every *.supabase.co call is answered by an in-process mock.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = await new Promise(resolve => {
  const s = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
      const file = join(ROOT, path);
      if (!file.startsWith(ROOT)) throw new Error('traversal');
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const BASE = `http://127.0.0.1:${srv.address().port}`;
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };


const DE = 'de000000-0000-4000-8000-000000000001';
const P = n => 'a0000000-0000-4000-8000-00000000000' + n;
const participants = [1, 2, 3, 4].map(n => ({ id: P(n), name: 'Player ' + n, seed: n, members: [] }));
const mk = (id, side, round, p1, p2, status = 'pending') => ({ id: 'de000000-0000-4000-8000-0000000000' + id, round, match_number: 1, bracket_side: side, status, participant1_id: p1, participant2_id: p2 });
const snapshot = {
  tournament: { id: DE, name: 'Harbor DE', format: 'double_elimination', is_public: true, status: 'in_progress', start_date: '2026-11-14' },
  participants,
  matches: [mk('a1', 'winners', 2, P(1), P(2), 'in_progress'), mk('a2', 'winners', 1, null, null), mk('b1', 'losers', 1, null, null),
            mk('c1', 'grand_final', 1, null, null), mk('d1', 'reset_final', 1, null, null)],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => localStorage.setItem('pc_consent', 'denied'));
await ctx.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === BASE) return route.continue();
  if (!url.hostname.endsWith('.supabase.co')) return route.abort();
  const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.pathname.startsWith('/auth/')) return json({});
  const rpc = url.pathname.replace('/rest/v1/rpc/', '');
  if (rpc === 'live_tournament_snapshot') return json(snapshot);
  return json(null);
});
await ctx.routeWebSocket(/\.supabase\.co\/realtime\//, ws => {
  let arr = /vsn=2/.test(ws.url());
  ws.onMessage(raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    let j, r, t; if (Array.isArray(m)) { arr = true; [j, r, t] = m; } else ({ join_ref: j, ref: r, topic: t } = m);
    if (r != null) ws.send(arr ? JSON.stringify([j ?? r, r, t, 'phx_reply', { status: 'ok', response: {} }]) : JSON.stringify({ topic: t, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: r, join_ref: j }));
  });
});

const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
for (const scheme of ['light', 'dark']) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript(t => localStorage.setItem('pc_theme', t), scheme);
  await page.goto(`${BASE}/live.html?t=${DE}`);
  await page.click('text=Bracket');
  await page.waitForSelector('.bv-side-title');
  const heads = await page.evaluate(() => [...document.querySelectorAll('.bv-side-title')].map(h => {
    let e = h, bg; while (e && (bg = getComputedStyle(e).backgroundColor) === 'rgba(0, 0, 0, 0)') e = e.parentElement;
    return { text: h.textContent, fg: getComputedStyle(h).color, bg: bg || 'rgb(255, 255, 255)' };
  }));
  const worst = Math.min(...heads.map(h => { const a = lum(h.fg), b = lum(h.bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
  check(worst >= 4.5, `1. ${scheme}: side headings contrast ${worst.toFixed(2)}:1 >= 4.5 (${heads[0].fg} on ${heads[0].bg})`);
  if (scheme === 'light') {
    const texts = heads.map(h => h.text).join(' | ');
    check(texts === 'Winners Bracket | Losers Bracket | Grand Final | Grand Final — Reset', `2. headings: ${texts}`);
  }
  await page.close();
}
await browser.close(); srv.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll DE bracket title checks passed');
