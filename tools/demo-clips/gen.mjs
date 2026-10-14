// Generates one raw-motion scene per app screen: a 4 s seamless loop (settle → tap → punch zoom → ease back).
import { mkdirSync, writeFileSync, copyFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SCENE = join(ROOT, '..', 'scene');
// Same focal/tap/zoom values as the tour (scene/comp.js), minus chips.
const SHOTS = [
  { id: 'c01-home',      src: 's10-home-dashboard.png',      focal: [660, 1160], zoom: 1.32, tap: [1060, 1360] },
  { id: 'c02-courts',    src: 's3a-courts-pinfocus.png',     focal: [660, 1500], zoom: 1.28, tap: [660, 1100] },
  { id: 'c03-play',      src: 's1-play-open-games.png',      focal: [660, 980],  zoom: 1.30, tap: [1060, 1255] },
  { id: 'c04-scoring',   src: 's2-live-scoring.png',         focal: [660, 820],  zoom: 1.38, tap: [498, 1358] },
  { id: 'c05-lockscreen',src: 's7-lock-screen.png',          focal: [660, 1220], zoom: 1.34, tap: null },
  { id: 'c06-bracket',   src: 's4-bracket-summer-smash.png', focal: [520, 1700], zoom: 1.34, tap: [250, 1380] },
  { id: 'c07-standings', src: 's5b-league-standings.png',    focal: [660, 1300], zoom: 1.30, tap: null },
  { id: 'c08-stats',     src: 's6-player-stats.png',         focal: [660, 760],  zoom: 1.34, tap: null },
  { id: 'c09-chat',      src: 's8-chat-thread.png',          focal: [660, 1500], zoom: 1.18, tap: null },
  { id: 'c10-schedule',  src: 's9-week-schedule.png',        focal: [660, 900],  zoom: 1.24, tap: null },
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#0B0F14;overflow:hidden}
  #stage{position:relative;overflow:hidden;background:#0B0F14}
  #shot{position:absolute;left:0;top:0;width:1080px;height:2347px;display:block;transform-origin:50% 50%;will-change:transform}
  #ripple{position:absolute;left:-90px;top:-90px;width:180px;height:180px;border-radius:50%;border:7px solid #56D364;box-shadow:0 0 40px rgba(86,211,100,.6)}
</style></head><body><div id="stage"><img id="shot"><div id="ripple"></div></div>
<script src="motion.js"></script><script src="comp.js"></script></body></html>`;
const comp = (s) => `// ${s.id}: 4 s seamless loop. seek(t) is a pure function of t; frame 0 == frame 4.0.
const W = 1080, H = 2346, DUR = 4, FPS = 60;
const { $, set, vis, kf, ease, lerp, inv, clamp, finish } = RM;
$('stage').style.width = W + 'px'; $('stage').style.height = H + 'px';
const IMG_SCALE = 1080 / 1320, FOCAL = ${JSON.stringify(s.focal)}, ZOOM = ${s.zoom}, TAP = ${JSON.stringify(s.tap)};
const img = $('shot'); img.src = 'shots/${s.src}'; img.decoding = 'sync';
window.__ready = img.decode().then(() => true);
function state(t) {
  // 0.0–0.55 settled · 0.55–1.35 zoom in · hold · 2.85–3.75 zoom out · settled to the end (= frame 0)
  const z = kf(t, [[0.55, 0], [1.35, 1, ease.inOutCubic], [2.85, 1], [3.75, 0, ease.inOutCubic]]);
  const sc = lerp(1, ZOOM, z);
  const dx = FOCAL[0] * IMG_SCALE - W / 2, dy = FOCAL[1] * IMG_SCALE - H / 2;
  const mx = (sc - 1) * W / 2, my = (sc - 1) * H / 2;
  return { s: sc, x: clamp(-dx * sc * z, -mx, mx), y: clamp(-dy * sc * z, -my, my) };
}
function seek(t) {
  t = Math.min(Math.max(t, 0), DUR - 1e-4);
  const hs = state(t);
  set(img, { s: hs.s, x: hs.x, y: hs.y });
  const on = !!TAP && t > 0.30 && t < 0.95;
  vis($('ripple'), on);
  if (on) {
    const r = inv(0.30, 0.90, t);
    const px = (TAP[0] * IMG_SCALE - W / 2) * hs.s + hs.x + W / 2;
    const py = (TAP[1] * IMG_SCALE - H / 2) * hs.s + hs.y + H / 2;
    set($('ripple'), { x: px, y: py, s: .25 + 1.6 * ease.outCubic(r), o: (1 - r) * .95 });
  }
}
finish(seek, DUR);
`;
for (const s of SHOTS) {
  const d = join(ROOT, s.id);
  if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  mkdirSync(d);
  writeFileSync(join(d, 'index.html'), html);
  writeFileSync(join(d, 'comp.js'), comp(s));
  copyFileSync(join(SCENE, 'motion.js'), join(d, 'motion.js'));
  symlinkSync(process.env.SHOTS_DIR || join(SCENE, 'shots'), join(d, 'shots'));
}
console.log('generated', SHOTS.length, 'clip scenes');
