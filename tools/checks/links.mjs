#!/usr/bin/env node
/**
 * Production link behaviour. Read-only GETs against the live site.
 *
 * These are the things that only break in production: a redirect rule, an
 * apex-vs-www hop, a Universal Link association file that 301s instead of
 * serving, an outbound campaign link whose UTM was dropped. None of them can be
 * tested against a local static server, because none of them exist there.
 *
 * The one that matters most is apple-app-site-association. iOS fetches it over
 * HTTPS and will NOT follow a redirect. If the apex 301s it to www, every
 * Universal Link into the app silently stops working, and nothing on the
 * website looks wrong.
 *
 *   node tools/checks/links.mjs
 */
const WWW = 'https://www.picklecue.com';
const APEX = 'https://picklecue.com';

const hop = async (url, method = 'GET') => {
  const chain = [];
  let cur = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(cur, { method, redirect: 'manual', headers: { 'user-agent': 'picklecue-linkcheck' } });
    chain.push({ url: cur, status: r.status, type: r.headers.get('content-type') || '', loc: r.headers.get('location') });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      cur = new URL(r.headers.get('location'), cur).toString();
    } else return { chain, final: r, url: cur };
  }
  return { chain, final: null, url: cur };
};

const rows = [];
const check = async (name, url, assert) => {
  try {
    const h = await hop(url);
    const verdict = await assert(h);
    rows.push({ name, url, hops: h.chain.length - 1, status: h.chain.at(-1).status, ...verdict });
  } catch (e) { rows.push({ name, url, ok: false, note: 'request failed: ' + e.message }); }
};

/* 1. Universal Links. iOS does not follow redirects for this file. */
for (const [label, base] of [['apex', APEX], ['www', WWW]])
  await check(`AASA (${label}) — must be 200 JSON, never a redirect`, `${base}/.well-known/apple-app-site-association`, h => {
    const last = h.chain.at(-1);
    const redirected = h.chain.length > 1;
    return { ok: last.status === 200 && !redirected && /json/i.test(last.type), note: redirected ? `REDIRECTED via ${h.chain.map(c => c.status).join('→')} — iOS will not follow this` : `${last.status} ${last.type}` };
  });

/* 2. Apex should reach www in one hop. _redirects carries
      `https://picklecue.com/* https://www.picklecue.com/:splat 301`, but
      Cloudflare Pages matches _redirects on the PATH only — an absolute-URL
      source is not a rule it applies, so this one has never fired. The whole
      site is served on both hostnames. Not a Universal Links problem (both
      hosts serve the association file as 200 JSON, checked above), but it is
      duplicate content, and the canonical is the only thing pointing search
      engines at one of them. */
await check('apex → www (one 301 hop)', `${APEX}/players`, h => ({
  ok: h.chain[0].status === 301 && h.chain.at(-1).url.startsWith(WWW) && h.chain.at(-1).status === 200,
  note: h.chain.map(c => `${c.status} ${c.url.replace(/^https?:\/\//, '')}`).join(' → ') +
        (h.chain[0].status === 200 ? '   (apex serves directly; needs a Cloudflare Redirect Rule, not _redirects)' : ''),
}));

/* 3. The canonical must not point at a URL that redirects. */
await check('canonical does not point at a redirect', `${WWW}/players`, async h => {
  const html = await h.final.text();
  const c = (html.match(/rel="canonical"\s+href="([^"]+)"/) || [])[1] || '';
  const r = c ? await hop(c) : null;
  return { ok: !!c && r.chain.length === 1 && r.chain[0].status === 200, note: c + (r ? `  → ${r.chain.map(x => x.status).join('→')}` : '') };
});

/* 4. Extensionless URLs are canonical; the .html form must 308 to them. */
/* /live-scores is new on this branch, so a 404 in production is the correct
   answer today and will stop being correct after the first deploy. It is
   listed rather than dropped: a check that silently skips things teaches you
   to trust a shorter list than you actually verified. */
const NOT_YET_DEPLOYED = new Set(['/live-scores']);
for (const p of ['/players', '/organizers', '/clubs', '/community', '/support', '/privacy', '/terms', '/live-scores'])
  await check(`${p} serves 200`, WWW + p, h => {
    const s200 = h.chain.length === 1 && h.chain[0].status === 200;
    if (!s200 && NOT_YET_DEPLOYED.has(p) && h.chain.at(-1).status === 404)
      return { ok: true, note: '404 — new on this branch, not deployed yet (expected)' };
    return { ok: s200, note: h.chain.map(c => c.status).join('→') };
  });
for (const p of ['/players.html', '/community.html'])
  await check(`${p} redirects to the canonical form`, WWW + p, h => ({
    ok: h.chain[0].status === 308 && h.chain.at(-1).status === 200 && !h.chain.at(-1).url.endsWith('.html'),
    note: h.chain.map(c => c.status).join('→') + ' → ' + h.chain.at(-1).url.replace(WWW, ''),
  }));

/* 5. The campaign redirect must reach the organizer WITH its UTM intact. */
await check('/go/pickle-for-a-purpose → organizer, UTM intact', `${WWW}/go/pickle-for-a-purpose`, h => {
  const first = h.chain[0];
  const dest = first.loc || '';
  return {
    ok: first.status === 302 && /give-sc\.salvationarmy\.org/.test(dest) && /utm_source=picklecue/.test(dest) && /utm_campaign=pickle-for-a-purpose-2026/.test(dest),
    note: `${first.status} → ${dest.slice(0, 96)}`,
  };
});

/* 6. The old community URL must still land somewhere real. */
await check('/community/pickle-for-a-purpose (legacy)', `${WWW}/community/pickle-for-a-purpose`, h => ({
  ok: h.chain.at(-1).status === 200 && h.chain.at(-1).url.includes('/events/pickle-for-a-purpose/'),
  note: h.chain.map(c => c.status).join('→') + ' → ' + h.chain.at(-1).url.replace(WWW, ''),
}));

/* 7. The App Store listing every CTA points at. */
await check('App Store listing', 'https://apps.apple.com/us/app/picklecue-pickleball/id6757326631', h => ({
  ok: h.chain.at(-1).status === 200, note: h.chain.map(c => c.status).join('→'),
}));

/* 8. The organizer's own page — the destination of every event CTA. */
await check("organizer's event page", 'https://give-sc.salvationarmy.org/event/the-salvation-army-or-echelon-pickleball-tournament-2026/e797563', h => ({
  ok: h.chain.at(-1).status === 200, note: h.chain.map(c => c.status).join('→'),
}));

/* 9. sitemap + robots. */
await check('sitemap.xml', `${WWW}/sitemap.xml`, h => ({ ok: h.chain.at(-1).status === 200 && /xml/i.test(h.chain.at(-1).type), note: `${h.chain.at(-1).status} ${h.chain.at(-1).type}` }));
await check('robots.txt', `${WWW}/robots.txt`, h => ({ ok: h.chain.at(-1).status === 200, note: String(h.chain.at(-1).status) }));

const bad = rows.filter(r => !r.ok);
console.log('\n  PRODUCTION LINK BEHAVIOUR\n');
for (const r of rows) console.log(`  ${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(50)} ${r.note || ''}`);
console.log(`\n  ${rows.length - bad.length}/${rows.length} pass.\n`);
process.exit(bad.length ? 1 : 0);
