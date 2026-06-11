/* PickleCue Interactive Demo — 1:1 mirror of the iOS app's hub interactions. */

(function () {
    'use strict';

    // Embedded inside the marketing hero: strip page chrome, fill the frame.
    if (window.self !== window.top) {
        document.documentElement.classList.add('embedded');
    }

    // ─── Demo game data (mirrors the app's fixture set) ───
    var GAMES = [
        { pill: 'NEXT GAME', title: 'Zilker Morning Rally', court: 'Zilker Park Courts • Court 4', time: 'Today • 7:00 AM',
          level: '3.0–4.0 Level • Doubles', spots: '3/4', spotsSub: 'Open spots remaining', pcount: 3,
          format: 'Doubles', skill: '3.0–4.0', barSub: '1 of 4 spots open', cta: 'View Game', full: false },
        { pill: 'NEAR YOU', title: 'Lunch Singles Ladder', court: 'Rec - Fillmore • 1.5 mi', time: 'Tomorrow • 12:00 PM',
          level: '3.0–4.0 Level • Singles', spots: '1/2', spotsSub: 'Open spots remaining', pcount: 1,
          format: 'Singles', skill: '3.0–4.0', barSub: '1 of 2 spots open', cta: 'Join Game', full: false },
        { pill: 'NEAR YOU', title: 'Sunset Doubles Rally', court: 'Carl Larsen Park • 2.4 mi', time: 'Tomorrow • 6:00 PM',
          level: '3.5–4.0 Level • Doubles', spots: '2/4', spotsSub: 'Open spots remaining', pcount: 2,
          format: 'Doubles', skill: '3.5–4.0', barSub: '2 of 4 spots open', cta: 'Join Game', full: false },
        { pill: 'NEAR YOU', title: 'Saturday Round Robin', court: 'Carl Larsen Park • 2.4 mi', time: 'Sat • 9:00 AM',
          level: '3.0–4.5 Level • Doubles', spots: '1/8', spotsSub: 'Open spots remaining', pcount: 1,
          format: 'Doubles', skill: '3.0–4.5', barSub: '7 of 8 spots open', cta: 'Join Game', full: false },
        { pill: 'NEAR YOU', title: 'Evening Open Play', court: 'Betty Ann Ong Recreation Center • 2.7 mi', time: 'Today • 8:30 PM',
          level: '3.0–3.5 Level • Doubles', spots: '0/4', spotsSub: 'Game is full', pcount: 4,
          format: 'Doubles', skill: '3.0–3.5', barSub: '#1 would be your position', cta: 'Join Waitlist', full: true }
    ];

    // ─── Tab switching ───
    window.showTab = function (tabId) {
        closeGameDetail();
        document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
        document.querySelectorAll('.tab-item').forEach(function (t) { t.classList.remove('active'); });
        var screen = document.getElementById('screen-' + tabId);
        var tab = document.querySelector('.tab-item[data-tab="' + tabId + '"]');
        if (screen) { screen.classList.add('active'); screen.scrollTop = 0; }
        if (tab) { tab.classList.add('active'); }
    };

    // ─── Play hub segments ───
    window.playSeg = function (el) {
        document.querySelectorAll('#play-tray .tray-tab').forEach(function (t) { t.classList.remove('active'); });
        el.classList.add('active');
        var map = { open: 'seg-open', mine: 'seg-mine', wait: 'seg-wait', past: 'seg-past' };
        document.querySelectorAll('.play-seg').forEach(function (s) { s.classList.remove('active'); });
        var seg = document.getElementById(map[el.dataset.seg]);
        if (seg) { seg.classList.add('active'); }
    };

    // ─── Compete segment control ───
    window.competeSeg = function (el) {
        document.querySelectorAll('#compete-seg .seg-pill').forEach(function (p) { p.classList.remove('active'); });
        el.classList.add('active');
        document.querySelectorAll('.hub-pane').forEach(function (p) { p.classList.remove('active'); });
        var pane = document.getElementById('hub-' + el.dataset.hub);
        if (pane) { pane.classList.add('active'); }
    };

    // ─── Filter pills: tap to cycle through real filter values ───
    window.cyclePill = function (el) {
        var options = Array.prototype.slice.call(arguments, 1);
        var base = options[0];
        var current = el.dataset.idx ? parseInt(el.dataset.idx, 10) : 0;
        var next = (current + 1) % (options.length + 1);
        el.dataset.idx = next;
        var svg = el.querySelector('svg');
        var label = next === 0 ? base : options[next - 1];
        el.textContent = '';
        if (svg) { el.appendChild(svg); }
        el.appendChild(document.createTextNode(' ' + label));
        el.classList.toggle('sel', next !== 0);
    };

    // ─── Game detail overlay ───
    window.openGameDetail = function (index) {
        var g = GAMES[index] || GAMES[0];
        document.getElementById('gd-pill-t').textContent = g.pill.replace('📍 ', '');
        document.getElementById('gd-title').textContent = g.title;
        document.getElementById('gd-court').textContent = g.court;
        document.getElementById('gd-time').textContent = g.time;
        document.getElementById('gd-level').textContent = g.level;
        document.getElementById('gd-spots').textContent = g.spots;
        document.getElementById('gd-spots').classList.toggle('full', g.full);
        document.getElementById('gd-spots-sub').textContent = g.spotsSub;
        document.getElementById('gd-pcount').textContent = g.pcount;
        document.getElementById('gd-format').textContent = g.format + ' ›';
        document.getElementById('gd-skill').textContent = g.skill + ' ›';
        document.getElementById('gd-bar-sub').textContent = g.barSub;
        document.getElementById('gd-cta').textContent = g.cta;
        document.getElementById('game-detail').classList.add('open');
    };

    window.closeGameDetail = function () {
        document.getElementById('game-detail').classList.remove('open');
    };
})();
