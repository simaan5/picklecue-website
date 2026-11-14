// node tests/live-round-titles.test.mjs
// s33: live.html match cards printed the raw API round ("Round 1"), but app-built
// brackets number the Final as round 1, so QFs read "Round 3" and the Final "Round 1".
// PCBracket.roundTitleFor names rounds by position in a complete single-elimination bracket.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const win = {}; vm.runInNewContext(readFileSync(new URL('../assets/bracket.js', import.meta.url), 'utf8'), { window: win, document: undefined });
const T = win.PCBracket.roundTitleFor;
let failures = 0; const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };
const mk = (round, n) => Array.from({ length: n }, (_, i) => ({ id: `r${round}m${i + 1}`, round, match_number: i + 1 }));
const se = matches => ({ tournament: { format: 'single_elimination' }, matches });
// app convention: round 3 = first round of an 8-draw, round 1 = Final
const app8 = se([...mk(3, 4), ...mk(2, 2), ...mk(1, 1)]);
check(T(app8, app8.matches[0]) === 'Quarterfinals', `app numbering, round 3 (4 matches) -> ${T(app8, app8.matches[0])}`);
check(T(app8, app8.matches[4]) === 'Semifinals', `app numbering, round 2 (2 matches) -> ${T(app8, app8.matches[4])}`);
check(T(app8, app8.matches[6]) === 'Final', `app numbering, round 1 (1 match) -> ${T(app8, app8.matches[6])}`);
// web/other convention: round 1 = first round
const web8 = se([...mk(1, 4), ...mk(2, 2), ...mk(3, 1)]);
check(T(web8, web8.matches[0]) === 'Quarterfinals' && T(web8, web8.matches[6]) === 'Final', 'first-round-is-1 numbering also named correctly');
// incomplete bracket (only first round generated): no guess
const partial = se(mk(1, 4));
check(T(partial, partial.matches[0]) === null, 'incomplete bracket -> null (caller keeps "Round N")');
check(T({ tournament: { format: 'round_robin' }, matches: mk(1, 3) }, { round: 1 }) === null, 'round robin -> null');
check(T(null, { round: 1 }) === null, 'no snapshot -> null');
const de = se([...mk(3, 4), ...mk(2, 2), ...mk(1, 1), { id: 'l1', round: 1, match_number: 1, bracket_side: 'losers' }]);
check(T(de, de.matches[7]) === null && T(de, de.matches[6]) === 'Final', "losers-side matches are left alone; winners side still named");
process.exit(failures ? 1 : 0);
