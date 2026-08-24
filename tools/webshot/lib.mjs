/**
 * Shared machinery for the web marketing capture pipeline.
 *
 * Philosophy (mirrors the iOS `shotcaller` skill and CLAUDE.md §10):
 *
 *   The screenshot must be the REAL shipping page. Only the DATA is a fixture.
 *
 * On iOS that is easy — the app reads a committed snapshot file. The web pages
 * have no fixture layer; they talk to production Supabase. So instead of
 * hand-writing JSON that "looks like" a server response (which would let us
 * screenshot a UI state the server can never actually produce — exactly the
 * fake-dashboard failure mode), the pipeline is:
 *
 *   record  -> drive the real page against real production, save every
 *              /rest/v1/* exchange verbatim
 *   scrub   -> replace real people's names with the fictional marketing cast,
 *              asserting the response SHAPE is untouched
 *   capture -> replay those fixtures into the real page and screenshot
 *
 * That gives three properties worth having:
 *   1. Every fixture byte-shape came from the production server, so no
 *      screenshot can show an impossible state.
 *   2. No real person's name reaches marketing material.
 *   3. Captures are deterministic and offline — reruns don't drift with the
 *      database and don't need credentials.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SUPABASE_HOST = 'uejmhtdfbqbotvbqvfja.supabase.co';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** Serve the working tree, so captures show uncommitted local edits. */
export async function serveSite() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // normalize() + the ROOT prefix check keeps ../ traversal out.
      let file = normalize(join(ROOT, path === '/' ? '/index.html' : path));
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Identity of a Supabase exchange. supabase-js sends RPCs as POST with a JSON
 * body, and table reads as GET with the filter in the query string, so the key
 * has to include both the URL and the body to tell two RPCs apart.
 */
export function fixtureKey(method, url, postData) {
  const u = new URL(url);
  const body = postData ? createHash('sha1').update(postData).digest('hex').slice(0, 12) : '-';
  return `${method} ${u.pathname}${u.search} ${body}`;
}

/* ------------------------------------------------------------------ scrub */

/**
 * The JSON "skeleton": every key path and value TYPE, with values discarded.
 * Scrubbing may only change values — if it adds, drops or retypes a field it
 * has started inventing server behaviour, and the capture is no longer proof
 * of anything. Compared before/after and asserted equal.
 */
export function skeleton(v) {
  if (Array.isArray(v)) return v.map(skeleton);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, skeleton(v[k])]));
  }
  return v === null ? 'null' : typeof v;
}

/**
 * Rewrite every real identity in a recorded response.
 *
 * Deliberately conservative: it rewrites string VALUES only, and only ones it
 * recognises. Anything unrecognised survives untouched and is then caught by
 * assertClean(), which fails the run rather than shipping an unknown name.
 */
/**
 * One replacement table, applied LONGEST MATCH FIRST.
 *
 * Order is load-bearing. "Sunset Courts Open" (an event) contains "Sunset
 * Courts" (a venue); replacing the venue first would leave "Cucamonga Peak
 * Courts Open" instead of "Cucamonga Peak Classic". Sorting by length
 * descending makes the most specific string always win.
 */
function replacements(personas) {
  if (personas.__table) return personas.__table;
  const table = [
    ...Object.entries(personas.events),
    ...Object.entries(personas.places || {}),
    ...Object.entries(personas.people).map(([real, p]) => [real, p.name]),
  ].sort((a, b) => b[0].length - a[0].length);
  Object.defineProperty(personas, '__table', { value: table, enumerable: false });
  return table;
}

export function scrubValue(str, personas) {
  let out = str;
  for (const [real, fake] of replacements(personas)) {
    if (out === real) return fake;
    if (out.includes(real)) out = out.split(real).join(fake);
  }
  return out;
}

export function scrub(node, personas, key = null) {
  if (Array.isArray(node)) return node.map((n) => scrub(n, personas, key));
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, scrub(v, personas, k)]),
    );
  }
  if (typeof node !== 'string') return node;

  // Avatar ids travel beside the name; keep the pair consistent so the
  // fictional person has the fictional person's avatar.
  if (key === 'avatar_id') return node; // remapped in the name pass below
  return scrubValue(node, personas);
}

/**
 * Second pass: wherever an object carries both a name and an avatar_id, force
 * the avatar to the one this persona uses in the iOS world.
 */
export function alignAvatars(node, personas) {
  const byFake = Object.fromEntries(
    Object.values(personas.people).map((p) => [p.name, p.avatar_id]),
  );
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    // Only swap an avatar that actually exists. A member whose avatar_id is
    // null has no avatar in production, and the page renders its monogram
    // fallback for them — a real state. Filling one in would put a face in a
    // screenshot that the server never returned.
    if (typeof n.name === 'string' && typeof n.avatar_id === 'string' && byFake[n.name]) {
      n.avatar_id = byFake[n.name];
    }
    Object.values(n).forEach(walk);
  };
  walk(node);
  return node;
}

/**
 * Fail the run if anything that must not ship is still present. This is the
 * gate that makes the pipeline safe to point at production data.
 */
export function assertClean(text, personas, label) {
  const problems = [];
  for (const real of Object.keys(personas.people)) {
    if (text.includes(`"${real}"`)) problems.push(`real person name: ${real}`);
  }
  for (const real of Object.keys(personas.events)) {
    if (text.includes(real)) problems.push(`superseded event name: ${real}`);
  }
  for (const banned of personas._banned) {
    if (text.includes(banned)) problems.push(`banned marketing string: ${banned}`);
  }
  // Geography fragments from the superseded LA world. These are not rewritten
  // on purpose: an unanticipated fragment means the scrub is INCOMPLETE, and
  // the run should stop so a human decides what it should say.
  for (const frag of personas._banned_fragments || []) {
    if (text.includes(frag)) problems.push(`superseded geography: ${frag}`);
  }
  // Bare emails are never needed by a public page.
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) problems.push(`email address: ${email[0]}`);

  if (problems.length) {
    throw new Error(
      `scrub failed for ${label}:\n  - ${[...new Set(problems)].join('\n  - ')}`,
    );
  }
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/* ---------------------------------------------------------------- actions */

/**
 * Drive the real page for scenes whose payoff state is only reachable by using
 * it — filling the registration form, choosing a partner mode, signing the
 * waiver field.
 *
 * Every step asserts it actually did something. A selector that silently stops
 * matching after a redesign would otherwise produce a screenshot of the
 * PREVIOUS state, which is the quiet way a capture library starts lying.
 */
export async function runActions(page, actions) {
  if (!actions || !actions.length) return;

  // Wait for the page to stop re-rendering before touching it.
  //
  // live.html paints from the snapshot, then repaints when the registration
  // info and waiver arrive — and each repaint replaces #main's innerHTML,
  // wiping anything already typed. Filling too early passes its own assertion
  // and is then silently erased, producing a screenshot of an EMPTY form.
  // Observed exactly that on reg-waiver. So: settle first.
  // First wait for every element the actions touch to exist. On the
  // registration form #rWaiverSig is the LAST thing rendered, because it only
  // appears once the waiver has loaded — so its presence marks the final
  // repaint rather than an intermediate one.
  for (const step of actions) {
    const sel = step.fill || step.select || step.scrollTo || step.click;
    if (sel && sel.startsWith('#')) {
      await page.locator(sel).first().waitFor({ state: 'attached', timeout: 10000 });
    }
  }

  // Then require the DOM to hold still. One matching pair is not enough — the
  // page can be quiet between two async repaints.
  let last = null, stable = 0;
  for (let i = 0; i < 40 && stable < 3; i++) {
    const now = await page.locator('#main').innerHTML();
    stable = (now === last && now.length) ? stable + 1 : 0;
    last = now;
    await page.waitForTimeout(150);
  }

  for (const step of actions || []) {
    if (step.click) {
      const before = await page.locator('#main').innerHTML();
      await page.locator(step.click).first().click();
      await page.waitForTimeout(300);
      if (await page.locator('#main').innerHTML() === before) {
        throw new Error(`click changed nothing: ${step.click}`);
      }
    } else if (step.fill) {
      const el = page.locator(step.fill).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.fill(step.text);
      if (await el.inputValue() !== step.text) {
        throw new Error(`fill did not stick: ${step.fill}`);
      }
    } else if (step.select) {
      const el = page.locator(step.select).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.selectOption(step.value);
      if (await el.inputValue() !== step.value) {
        throw new Error(`select did not stick: ${step.select}=${step.value}`);
      }
      // The partner-name field is revealed by a change handler.
      await page.waitForTimeout(200);
    } else if (step.scrollTo) {
      await page.locator(step.scrollTo).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    } else {
      throw new Error(`unknown action: ${JSON.stringify(step)}`);
    }
  }
}

/**
 * Wait until the page has actually finished painting, instead of sleeping.
 *
 * WHY: the champion card animates in with `champPop 0.6s`. Captures used a
 * flat 400ms settle, so the screenshot landed mid-fade and the card came out
 * blank — it looked like a broken product surface when the product was fine.
 * A fixed sleep is always either too short (this) or wasted time.
 *
 * Three deterministic signals, all of which must settle:
 *   1. webfonts loaded — otherwise text reflows after the shot
 *   2. every image decoded — a half-loaded avatar is an empty circle
 *   3. every FINITE animation finished — infinite ones (the live pulse) are
 *      excluded deliberately, because waiting on those never returns
 *
 * Then two animation frames, so the final state is committed to a paint.
 */
export async function waitForVisualReady(page, { timeout = 8000 } = {}) {
  await page.evaluate(async (deadline) => {
    const cap = (p) => Promise.race([p, new Promise((r) => setTimeout(r, deadline))]);

    await cap(document.fonts ? document.fonts.ready : Promise.resolve());

    await cap(Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map((img) => new Promise((res) => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        })),
    ));

    const finite = document.getAnimations().filter((a) => {
      try { return a.effect.getTiming().iterations !== Infinity; } catch { return false; }
    });
    await cap(Promise.all(finite.map((a) => a.finished.catch(() => {}))));

    // The live pages show "Connecting" until their own ping succeeds, then
    // flip to "Live". That ping runs over REST, which the capture fixtures
    // serve, so the page genuinely reaches Live — it is a race, not a fake.
    // Some captures were landing before the flip and shipping a header that
    // read CONNECTING, which makes a working product look broken. Wait for it
    // rather than forcing the label.
    const label = document.getElementById('connLabel');
    if (label) {
      const settled = Date.now() + Math.min(deadline, 5000);
      while (/connecting/i.test(label.textContent || '') && Date.now() < settled) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, timeout);
}

/**
 * Re-assert every typed value immediately before the screenshot.
 *
 * runActions checks each step when it happens, which is not enough: a repaint
 * afterwards can wipe the form and the capture still "succeeds", shipping a
 * picture of an empty form as though it were a filled one. This is the check
 * that makes the screenshot itself trustworthy.
 */
export async function verifyActions(page, actions) {
  for (const step of actions || []) {
    const sel = step.fill || step.select;
    if (!sel) continue;
    const want = step.fill ? step.text : step.value;
    const got = await page.locator(sel).first().inputValue();
    if (got !== want) {
      throw new Error(
        `state lost before screenshot: ${sel} is "${got}", expected "${want}"`,
      );
    }
  }
}
