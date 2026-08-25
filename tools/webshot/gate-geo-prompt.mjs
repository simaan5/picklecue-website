#!/usr/bin/env node
/* Gate: the country prompt.
 *
 * Every visitor gets one of two panels — US visitors are pointed at the App
 * Store, everyone else is offered the launch notification. This gate exists
 * because two real defects shipped here:
 *
 *   1. wireWaitlist('waitlistFormGeo') ran inline ~33 lines ABOVE the form it
 *      wires, so getElementById returned null and the prompt's "Notify me"
 *      button silently submitted nothing. The prompt looked completely fine.
 *   2. The tab trap walked into the inactive panel's controls, so focus
 *      vanished off-screen.
 *
 * Neither is visible in a screenshot, which is exactly why this runs headless
 * against the real served page with the geo endpoint stubbed per country.
 *
 * Usage: node tools/webshot/gate-geo-prompt.mjs
 * Exits non-zero on any failure.
 */
import { chromium } from 'playwright-core';
import { serveSite } from './lib.mjs';

const DELAY_MS = 3000;
const fails = [];
const ok = (cond, what) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${what}`);
    if (!cond) fails.push(what);
};

const site = await serveSite();
const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** Load the page with /api/geo stubbed, wait past the delay, report state. */
async function visit({ country, seen, viewport = { width: 1280, height: 900 } }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    const posts = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
        if (r.url().includes('waitlist_signups') && r.method() === 'POST') posts.push(r.postData());
    });
    await ctx.route('**/api/geo', (r) =>
        country === null
            ? r.fulfill({ status: 500, body: 'down' })
            : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ country }) }));
    if (seen) await ctx.addInitScript((k) => localStorage.setItem(k, '1'), seen);

    await page.goto(`${site.origin}/index.html`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(DELAY_MS - 500);
    const earlyShown = await page.evaluate(() => !document.getElementById('geoModal').hidden);
    await page.waitForTimeout(1600);

    const state = await page.evaluate(() => {
        const m = document.getElementById('geoModal');
        if (m.hidden) return { shown: false };
        const live = [...m.querySelectorAll('[data-geo-panel]')].find((x) => !x.hidden);
        return {
            shown: true,
            panel: live.getAttribute('data-geo-panel'),
            kicker: live.querySelector('.geo-kicker').textContent.trim(),
            labelResolves: !!document.getElementById(m.getAttribute('aria-labelledby')),
            descResolves: !!document.getElementById(m.getAttribute('aria-describedby')),
            href: live.querySelector('.appstore-badge')?.getAttribute('href') || null,
            // Controls in the panel that is NOT in play must be untabbable.
            strayTabbable: [...m.querySelectorAll('[data-geo-panel][hidden] button, [data-geo-panel][hidden] a, [data-geo-panel][hidden] input')]
                .filter((e) => e.offsetParent !== null).length,
        };
    });
    return { page, ctx, state, earlyShown, errors, posts };
}

console.log('\nRouting');
for (const [country, want, why] of [
    ['US', 'us', 'a US visitor is sent to the App Store'],
    ['GB', 'intl', 'a UK visitor is offered the notification'],
    ['JP', 'intl', 'a Japanese visitor is offered the notification'],
]) {
    const { ctx, state, earlyShown, errors } = await visit({ country });
    ok(state.shown && state.panel === want, `${country}: ${why}`);
    ok(!earlyShown, `${country}: nothing before ${DELAY_MS}ms`);
    ok(state.labelResolves && state.descResolves, `${country}: dialog name and description resolve`);
    ok(state.strayTabbable === 0, `${country}: inactive panel is untabbable`);
    ok(errors.length === 0, `${country}: no page errors`);
    await ctx.close();
}

console.log('\nFail-closed');
{
    const { ctx, state } = await visit({ country: null });
    ok(!state.shown, 'geo endpoint down: no prompt at all');
    await ctx.close();
}

console.log('\nDismissal is per-panel');
for (const [country, seen, wantShown, why] of [
    ['US', 'pc_us_prompt_v1', false, 'US: own key suppresses it'],
    ['GB', 'pc_geo_prompt_v1', false, 'UK: own key suppresses it'],
    ['US', 'pc_geo_prompt_v1', true, 'US: the other panel’s key does NOT suppress it'],
    ['GB', 'pc_us_prompt_v1', true, 'UK: the other panel’s key does NOT suppress it'],
]) {
    const { ctx, state } = await visit({ country, seen });
    ok(state.shown === wantShown, why);
    await ctx.close();
}

console.log('\nThe US panel actually points somewhere');
{
    const { ctx, state } = await visit({ country: 'US' });
    ok(/^https:\/\/apps\.apple\.com\/us\/app\/picklecue-pickleball\/id\d+$/.test(state.href || ''),
        `App Store href is the real listing (${state.href})`);
    await ctx.close();
}

console.log('\nThe notify form actually submits (defect #1)');
{
    const { page, ctx, posts } = await visit({ country: 'GB' });
    await page.fill('#waitlist-email-geo', 'gate-check@example.com');
    await page.click('#waitlistFormGeo button[type=submit]');
    await page.waitForTimeout(2500);
    ok(posts.length === 1, 'submitting the prompt fires exactly one POST');
    let body = {};
    try { body = JSON.parse(posts[0] || '{}'); } catch { /* handled below */ }
    ok(body.email === 'gate-check@example.com', 'the POST carries the typed email');
    ok(!('country' in body), 'the POST does NOT record country');
    ok(/on the list/i.test((await page.textContent('#waitlistMsgGeo')) || ''), 'the user is told it worked');
    await ctx.close();
}

await browser.close();
site.close();

console.log(fails.length ? `\n${fails.length} FAILED:\n  - ${fails.join('\n  - ')}\n` : '\nAll checks passed.\n');
process.exit(fails.length ? 1 : 0);
