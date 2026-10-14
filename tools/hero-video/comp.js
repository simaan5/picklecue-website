// PickleCue hero tour — the whole video is this file. seek(t) receives a time in seconds and sets
// every property on screen from it. Workers render frames out of order, so nothing accumulates.
//
// Canvas 1080×2346 matches the website's phone mask (402/874 ≈ 0.46). The ten screens are real
// captures of the shipping app in the MarketingCapture fixture world (qa/marketing-account),
// scaled 1320→1080. The video loops: screen 0 enters over screen 9 at t = 0.
const W = 1080, H = 2346, DUR = 22, FPS = 60;
const { $, set, vis, text, spring, impulse, kf, ease, lerp, inv, clamp, noise1, ev, hi, finish } = RM;
$('stage').style.width = W + 'px'; $('stage').style.height = H + 'px';

const IMG_SCALE = 1080 / 1320;                       // capture px → canvas px

// ── the tour ───────────────────────────────────────────────────────────────────────────────────
// in: A = slide up, B = swipe in from the right (with the ball), C = punch zoom in.
// focal: capture-pixel point the hold zooms toward (null = slow drift only). zoom: scale at the focal.
// chip: { k: kicker, h: headline (<b> = green), y: top of the chip in canvas px }.
const SHOTS = [
  { src: 'shots/s10-home-dashboard.png',    in: 'A', focal: [660, 1160], zoom: 1.32, tap: [1060, 1360],
    chip: { k: 'Home',          h: 'Your next game, <b>first</b>',  y: 1700 } },
  { src: 'shots/s3a-courts-pinfocus.png',   in: 'C', focal: [660, 1500], zoom: 1.28, tap: [660, 1100],
    chip: { k: 'Courts',        h: 'Courts <b>near you</b>',        y: 760 } },
  { src: 'shots/s1-play-open-games.png',    in: 'B', focal: [660, 980],  zoom: 1.30, tap: [1060, 1255],
    chip: { k: 'Play',          h: 'Open games, <b>one tap</b>',    y: 1760 } },
  { src: 'shots/s2-live-scoring.png',       in: 'C', focal: [660, 820],  zoom: 1.38, tap: [498, 1358],
    chip: { k: 'Live scoring',  h: 'Point by <b>point</b>',         y: 1880 } },
  { src: 'shots/s7-lock-screen.png',        in: 'A', focal: [660, 1220], zoom: 1.34, tap: null,
    chip: { k: 'Live Activity', h: 'Score on the <b>Lock Screen</b>', y: 1700 } },
  { src: 'shots/s4-bracket-summer-smash.png', in: 'B', focal: [520, 1700], zoom: 1.34, tap: [250, 1380],
    chip: { k: 'Tournaments',   h: 'Live <b>brackets</b>',          y: 2090 } },
  { src: 'shots/s5b-league-standings.png',  in: 'A', focal: [660, 1300], zoom: 1.30, tap: null,
    chip: { k: 'Leagues',       h: 'Standings that <b>update</b>',  y: 2060 } },
  { src: 'shots/s6-player-stats.png',       in: 'C', focal: [660, 760],  zoom: 1.34, tap: null,
    chip: { k: 'Matches',       h: 'Every match, <b>verified</b>',  y: 1980 } },
  { src: 'shots/s8-chat-thread.png',        in: 'B', focal: [660, 1500], zoom: 1.18, tap: null,
    chip: { k: 'Chat',          h: 'Rally your <b>crew</b>',        y: 2110 } },
  { src: 'shots/s9-week-schedule.png',      in: 'A', focal: [660, 900],  zoom: 1.24, tap: null,
    chip: { k: 'Schedule',      h: 'Your week, <b>planned</b>',     y: 2000 } },
];
const N = SHOTS.length, SEG = DUR / N;               // 2.2 s per screen
const TR = .62;                                      // a transition is settled by here

// ── build the DOM once ─────────────────────────────────────────────────────────────────────────
const shotEls = SHOTS.map((s, i) => {
  const d = document.createElement('div'); d.className = 'shot'; d.id = 'shot' + i;
  const img = new Image(); img.src = s.src; img.decoding = 'sync';
  const dim = document.createElement('div'); dim.className = 'dim';
  d.append(img, dim); $('shots').appendChild(d);
  return { d, img, dim };
});
const chipEls = SHOTS.map((s, i) => {
  const c = document.createElement('div'); c.className = 'chip'; c.id = 'chip' + i; c.style.top = s.chip.y + 'px';
  c.innerHTML = `<span class="k">${s.chip.k}</span><span class="h">${s.chip.h}</span>`;
  $('chips').appendChild(c); return c;
});
// fonts and images must be decoded before the renderer takes a single frame
window.__ready = Promise.all([
  document.fonts.load('700 76px "Instrument Sans"'), document.fonts.load('600 30px "JetBrains Mono"'),
  ...shotEls.map(e => e.img.decode()),
]).then(() => true);

// ── the cue sheet ──────────────────────────────────────────────────────────────────────────────
for (let i = 0; i < N; i++) {
  const t0 = i * SEG, s = SHOTS[i];
  if (s.in === 'A') { ev(t0 - .04, 'whoosh', .45); ev(t0 + .30, 'hit'); }
  if (s.in === 'B') { ev(t0 - .04, 'whoosh', .5); ev(t0 + .34, 'impact'); ev(t0 + .12, 'tick', 2); }
  if (s.in === 'C') { ev(t0, 'drop'); ev(t0 + .10, 'pop'); }
  ev(t0 + .50, 'pop');                                 // chip lands
  if (s.tap) { ev(t0 + .92, 'click'); ev(t0 + 1.02, 'blip', 2); }
  if (s.in !== 'C') hi(Math.max(0, t0 - .03), t0 + .5, 14);   // whips are ~150 px/frame: more blur samples
}
hi(DUR - .02, DUR, 14);                                 // the loop seam gets the same treatment

// ── helpers ────────────────────────────────────────────────────────────────────────────────────
const glowN1 = noise1(7), glowN2 = noise1(19), glowN3 = noise1(31), glowN4 = noise1(43);

// the hold: a slow drift, then (if the screen has a focal point) a tap and a punch zoom toward it
function holdState(i, l) {
  const s = SHOTS[i];
  const drift = 1 + .035 * ease.outQuad(inv(.2, SEG, l));
  if (!s.focal) return { s: drift, x: 0, y: 0 };
  const z = kf(l, [[1.0, 0], [1.55, 1, ease.inOutCubic]]);
  const sc = lerp(drift, s.zoom, z);
  // translate so the focal point moves toward the centre, clamped so no edge is revealed
  const dx = (s.focal[0] * IMG_SCALE - W / 2), dy = (s.focal[1] * IMG_SCALE - H / 2);
  const mx = (sc - 1) * W / 2, my = (sc - 1) * H / 2;
  return { s: sc, x: clamp(-dx * sc * z, -mx, mx), y: clamp(-dy * sc * z, -my, my) };
}

function seek(t) {
  t = Math.min(Math.max(t, 0), DUR - 1e-4);
  const i = Math.floor(t / SEG), l = t - i * SEG, p = (i + N - 1) % N, s = SHOTS[i];

  // background glows (only seen around a moving card) ───────────────────────────────────────────
  set($('glow1'), { x: W * .5 + glowN1(t * .15) * 420, y: H * .35 + glowN2(t * .15) * 500, s: 1.1 });
  set($('glow2'), { x: W * .5 + glowN3(t * .12) * 480, y: H * .75 + glowN4(t * .12) * 400, s: .9 });

  // screens: only the incoming (i) and the outgoing (p) exist on any frame ──────────────────────
  shotEls.forEach((e, k) => vis(e.d, k === i || (k === p && l < TR + .15)));

  // outgoing: frozen at the end of its own hold, then pushed back and blurred
  const g = ease.inOutCubic(inv(0, .55, l));
  {
    const hs = holdState(p, SEG), e = shotEls[p];
    e.d.style.zIndex = 1;
    set(e.img, { s: hs.s, x: hs.x, y: hs.y });
    if (SHOTS[i].in === 'A') set(e.d, { s: 1 - .10 * g, y: -70 * g, blur: 14 * g, o: 1 });
    if (SHOTS[i].in === 'B') set(e.d, { x: -W * .34 * g, s: 1 - .10 * g, r: -3 * g, blur: 12 * g, o: 1 });
    if (SHOTS[i].in === 'C') set(e.d, { s: 1 + .10 * g, blur: 16 * g, o: 1 - g });
    e.dim.style.opacity = (.55 * g).toFixed(3);
  }

  // incoming: its entrance, then its hold
  {
    const hs = holdState(i, l), e = shotEls[i];
    e.d.style.zIndex = 2;
    set(e.img, { s: hs.s, x: hs.x, y: hs.y });
    e.dim.style.opacity = '0';
    if (s.in === 'A') {
      const u = spring(l, 2.0, .74);
      set(e.d, { y: (1 - u) * H * 1.04, s: 1.02 - .02 * clamp(u), o: 1 });
    }
    if (s.in === 'B') {
      const u = spring(l, 2.1, .72);
      set(e.d, { x: (1 - u) * W * 1.08, r: (1 - u) * 7, s: 1.02 - .02 * clamp(u), o: 1 });
    }
    if (s.in === 'C') {
      const u = ease.outExpo(inv(0, .55, l));
      set(e.d, { s: 1.28 - .28 * u, blur: (1 - u) * 22, o: clamp(u * 2.2) });
    }
  }

  // tap ripple at the focal, just before the punch zoom ─────────────────────────────────────────
  {
    const on = !!s.tap && l > .92 && l < 1.55;
    vis($('ripple'), on);
    if (on) {
      const hs = holdState(i, l), r = inv(.92, 1.5, l);
      // the tap point sits on the (already drifting/zooming) image: map capture px → canvas px
      const px = (s.tap[0] * IMG_SCALE - W / 2) * hs.s + hs.x + W / 2;
      const py = (s.tap[1] * IMG_SCALE - H / 2) * hs.s + hs.y + H / 2;
      set($('ripple'), { x: px, y: py, s: .25 + 1.6 * ease.outCubic(r), o: (1 - r) * .95 });
    }
  }

  // chips: spring in after the screen lands, leave before the next one arrives ─────────────────
  chipEls.forEach((c, k) => {
    const on = k === i && l > .40 && l < SEG - .05;
    vis(c, on);
    if (!on) return;
    const u = spring(l - .42, 2.3, .55);
    const out = ease.inCubic(inv(SEG - .42, SEG - .08, l));
    const kick = impulse(l - .42, 3, .4);
    set(c, { y: (1 - u) * 90 - out * 60, x: -out * 40, s: lerp(.78, 1, clamp(u)) * (1 - out * .08),
             r: (1 - clamp(u)) * -5 + kick * 1.2, o: clamp(u * 1.6) * (1 - out), blur: out * 10 });
  });

  // the pickleball whips across on every swipe (B) transition ───────────────────────────────────
  {
    const on = s.in === 'B' && l < .62;
    vis($('ball'), on);
    if (on) {
      const u = ease.inOutCubic(inv(0, .58, l));
      const x = lerp(W + 160, -220, u), y = lerp(H * .62, H * .30, u) - Math.sin(u * Math.PI) * 420;
      set($('ball'), { x, y, r: -720 * u, s: 1 + .25 * Math.sin(u * Math.PI), o: 1 - inv(.52, .62, l) });
    }
  }
}

finish(seek, DUR, {
  bpm: 124,
  chords: [[0, 5.5, [50, 57, 62], 38], [5.5, 11, [48, 55, 60], 36], [11, 16.5, [53, 57, 60], 41], [16.5, DUR, [50, 57, 62], 38]],
  groove: [0, DUR - .3], fadeOut: .3,
});
