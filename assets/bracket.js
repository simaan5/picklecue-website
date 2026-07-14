/* PickleCue BracketView — 1:1 web port of the app's BracketCanvasView.
 *
 * Mirrors BracketCanvasTheme / RoundTimelineRail / PremiumBracketChrome /
 * BracketComponents from the iOS app:
 *   • Court-line backdrop with radial emerald glow and vignette
 *   • Round Timeline Rail: glass label capsule with a gliding emerald
 *     selection pill, progress track with per-round nodes, and the glowing
 *     pickleball marker with a comet trail (images/pickleball-marker.png —
 *     the app's actual asset)
 *   • Spotlight: the selected round renders full, adjacent ~0.45 weight,
 *     far rounds dim/desaturate/scale (BracketTheme.activeWeight)
 *   • Match cards: exact 160×72 geometry, "QF · M3" header tags, pulsing
 *     LIVE chip, emerald completed check, winner/loser slot treatment,
 *     game-progress chip, ghost bye cards, gold champion crown/ring/capsule
 *   • Rounded-elbow connectors (SVG) with the emerald winner-path under-glow
 *   • Floating glass dock: fit-all · zoom− · % · zoom+ · recenter
 *
 * Round robin keeps its standings + rounds grid but adopts the same rail
 * (marker glides between round sections) and card language.
 */
(function () {
  'use strict';
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  // ---- BracketLayoutConstants (exact app values) --------------------------
  var MW = 160, MH = 72, RS = 36, VG = 12, HH = 42, TP = 8, ELBOW = 6;

  function isElimination(snap) {
    var f = snap && snap.tournament && snap.tournament.format;
    return !!f && f.indexOf('elimination') !== -1;
  }
  function isRoundRobin(snap) {
    var f = snap && snap.tournament && snap.tournament.format;
    return !!f && f.indexOf('round_robin') !== -1;
  }
  function supports(snap) { return isElimination(snap) || isRoundRobin(snap); }

  function orderRounds(matches) {
    var byRound = {};
    matches.forEach(function (m) {
      var r = m.round || 0;
      (byRound[r] = byRound[r] || []).push(m);
    });
    var rounds = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; })
      .map(function (r) {
        return byRound[r].sort(function (a, b) { return (a.match_number || 0) - (b.match_number || 0); });
      });
    if (rounds.length > 1 && rounds[0].length < rounds[rounds.length - 1].length) rounds.reverse();
    return rounds;
  }

  function roundTitle(index, total, count) {
    var fromEnd = total - 1 - index;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2 && count === 4) return 'Quarterfinals';
    if (count === 16) return 'Round of 32';
    if (count === 8 && fromEnd === 3) return 'Round of 16';
    return 'Round ' + (index + 1);
  }

  // BracketTheme.condensedRoundLabel
  function condense(name) {
    var lower = name.toLowerCase();
    if (lower.indexOf('pool') !== -1) return 'Pool';
    if (lower.indexOf('quarter') !== -1) return 'QF';
    if (lower.indexOf('semi') !== -1) return 'SF';
    if (lower.indexOf('final') !== -1) return 'Final';
    var digits = name.replace(/\D/g, '');
    if (/round of /.test(lower)) return digits ? 'R' + digits : name;
    if (/^round /.test(lower)) return digits ? 'R' + digits : name;
    return name;
  }

  // BracketTheme.activeWeight → spotlight class (1.0 / 0.45 / 0)
  function weightClass(round, selected) {
    if (selected < 0) return 'bc-w2';
    var d = Math.abs(round - selected);
    return d === 0 ? 'bc-w2' : (d === 1 ? 'bc-w1' : 'bc-w0');
  }

  function isBye(m) {
    return m.status === 'bye' || (!!m.winner_id && (!m.participant1_id || !m.participant2_id));
  }

  function liveScore(m, side) {
    if (m.live && m.status !== 'completed' && m.live.score1 != null) {
      return side === 1 ? m.live.score1 : m.live.score2;
    }
    if (m.score_summary) {
      var last = m.score_summary.split(',').pop().trim().split('-');
      if (last.length === 2) {
        var v = parseInt(last[side - 1], 10);
        if (!isNaN(v)) return v;
      }
    }
    return null;
  }

  // CanvasBracketMatchCard.gameProgressLabel: decided sets = ≥11 & margin ≥2.
  function gameProgress(m) {
    if (m.status !== 'in_progress' || !m.score_summary) return null;
    var w1 = 0, w2 = 0;
    m.score_summary.split(',').forEach(function (set) {
      var p = set.trim().split('-');
      if (p.length !== 2) return;
      var a = parseInt(p[0], 10), b = parseInt(p[1], 10);
      if (isNaN(a) || isNaN(b)) return;
      if (Math.max(a, b) >= 11 && Math.abs(a - b) >= 2) { if (a > b) w1++; else w2++; }
    });
    return 'Game ' + (w1 + w2 + 1) + ' · ' + w1 + '–' + w2;
  }

  // ---- card markup (CanvasBracketMatchCard port) ---------------------------

  function slotRow(m, side, ctx) {
    var id = side === 1 ? m.participant1_id : m.participant2_id;
    var p = id ? ctx.participants[id] : null;
    var name = p ? p.name : (id ? 'Player' : 'TBD');
    var won = m.winner_id && m.winner_id === id;
    var lost = m.winner_id && id && m.winner_id !== id;
    var score = liveScore(m, side);
    // Player avatars on the cards (user request): the app's avatar chain —
    // preset → uploaded photo → emoji → initials — via PCLive.avatarStack.
    var avatar = id ? window.PCLive.avatarStack(p && p.members, ctx.avatarSize) : '';
    return '<div class="bc-slot' + (won ? ' bc-won' : '') + (lost ? ' bc-lost' : '') + (id ? '' : ' bc-tbd') + '">' +
      '<span class="bc-seed">' + (p && p.seed ? p.seed : '') + '</span>' +
      avatar +
      '<span class="bc-name">' + esc(name) + '</span>' +
      (won ? '<span class="bc-check">✓</span>' : '') +
      '<span class="bc-score">' + (score == null ? '' : score) + '</span></div>';
  }

  function appCard(m, ctx, tag, extraStyle, champion) {
    if (isBye(m)) {
      var adv = ctx.participants[m.winner_id];
      return '<div class="bc-card bc-bye" style="' + extraStyle + '" data-round="' + ctx.roundIndex + '">' +
        '<span class="bc-seed">' + (adv && adv.seed ? adv.seed : '') + '</span>' +
        '<span class="bc-name">' + esc(adv ? adv.name : 'Bye') + '</span>' +
        '<span class="bc-bye-arrow">›</span></div>';
    }
    var st = m.status === 'in_progress' ? 'bc-live'
      : m.status === 'completed' ? 'bc-done'
      : (m.participant1_id && m.participant2_id ? 'bc-ready' : 'bc-pending');
    var head;
    if (m.status === 'in_progress') {
      head = '<span class="bc-livechip"><span class="bc-livedot"></span>LIVE</span>';
    } else if (m.status === 'completed') {
      head = '<span class="bc-donecheck">✓</span>';
    } else {
      head = '';
    }
    var court = m.court ? (String(parseInt(m.court, 10)) === String(m.court) ? 'Court ' + m.court : m.court) : null;
    var label = tag + ' · ' + (court || 'M' + (m.match_number || '?'));
    var progress = gameProgress(m);
    return '<div class="bc-card ' + st + (ctx.interactive ? ' bv-tappable' : '') + (champion ? ' bc-champ' : '') +
      '" style="' + extraStyle + '" data-bv-match="' + m.id + '" data-round="' + ctx.roundIndex + '"' +
      ' role="group" aria-label="Match: ' + esc((ctx.participants[m.participant1_id] || {}).name || 'TBD') +
      ' vs ' + esc((ctx.participants[m.participant2_id] || {}).name || 'TBD') + '">' +
      (champion ? '<span class="bc-crown">👑</span>' : '') +
      '<div class="bc-head"><span class="bc-tag">' + esc(label) + '</span>' + head + '</div>' +
      '<div class="bc-sep"></div>' +
      slotRow(m, 1, ctx) +
      '<div class="bc-sep bc-sep2"></div>' +
      slotRow(m, 2, ctx) +
      (progress ? '<span class="bc-gamechip">' + esc(progress) + '</span>' : '') +
      (champion && ctx.championName ? '<span class="bc-champname">Champion · ' + esc(ctx.championName) + '</span>' : '') +
      '</div>';
  }

  // ---- Round Timeline Rail (RoundTimelineRail port) ------------------------

  function railHTML(labels, selected, caption) {
    var chips = labels.map(function (l, i) {
      return '<button class="bc-chip' + (i === selected ? ' on' : '') + '" data-bc-round="' + i + '">' + esc(l) + '</button>';
    }).join('');
    var nodes = labels.map(function (_, i) {
      return '<span class="bc-node" data-bc-node="' + i + '" style="left:' +
        (((i + 0.5) / labels.length) * 100) + '%"></span>';
    }).join('');
    return '<div class="bc-rail">' +
      '<div class="bc-rail-caps"><span class="bc-rail-pill"></span>' + chips + '</div>' +
      '<div class="bc-track"><span class="bc-track-fill"></span>' + nodes +
      '<span class="bc-trail"></span>' +
      '<img class="bc-ball" src="images/pickleball-marker.png" alt="">' +
      '</div>' +
      '<div class="bc-caption">' + esc(caption) + '</div>' +
      '</div>';
  }

  function railCaption(labelFull, remaining) {
    if (remaining === 0) return labelFull + ' · Round complete';
    return labelFull + ' · ' + remaining + ' match' + (remaining === 1 ? '' : 'es') + ' remaining';
  }

  // Positions the selection pill, marker, fill, and node states for `i`.
  function railSelect(container, i, meta) {
    var caps = container.querySelector('.bc-rail-caps');
    var pill = container.querySelector('.bc-rail-pill');
    var chips = container.querySelectorAll('.bc-chip');
    var n = chips.length;
    // Anchor the selection pill to the actual chip (the capsule scrolls on
    // narrow screens / many rounds — equal-division math breaks there).
    var chip = chips[i];
    pill.style.width = chip.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + chip.offsetLeft + 'px)';
    caps.scrollTo({ left: chip.offsetLeft - caps.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
    Array.prototype.forEach.call(chips, function (c, ci) { c.classList.toggle('on', ci === i); });

    var track = container.querySelector('.bc-track');
    var ball = container.querySelector('.bc-ball');
    var fill = container.querySelector('.bc-track-fill');
    var trail = container.querySelector('.bc-trail');
    var tw = track.clientWidth;
    var x = tw * ((i + 0.5) / n);
    var prev = container._bcRailX == null ? x : container._bcRailX;
    var dir = x >= prev ? 1 : -1;
    container._bcRailX = x;
    ball.style.transform = 'translateX(' + (x - 8.5) + 'px)';
    ball.classList.toggle('bc-ball-live', !!(meta && meta.hasLive));
    fill.style.width = x + 'px';
    Array.prototype.forEach.call(container.querySelectorAll('.bc-node'), function (nd, ni) {
      nd.className = 'bc-node' + (ni === i ? ' bc-node-on' : (ni < i ? ' bc-node-past' : ''));
    });
    // Comet trail: flash behind the ball opposite the direction of travel.
    trail.style.transform = 'translateX(' + (x - 26 - dir * 28) + 'px) scaleX(' + dir + ')';
    trail.classList.add('bc-trail-on');
    clearTimeout(container._bcTrailT);
    container._bcTrailT = setTimeout(function () { trail.classList.remove('bc-trail-on'); }, 550);

    var cap = container.querySelector('.bc-caption');
    if (meta) {
      cap.style.opacity = 0;
      setTimeout(function () {
        cap.textContent = railCaption(meta.fullName, meta.remaining);
        cap.style.opacity = 1;
      }, 120);
    }
  }

  // ---- backdrop (PremiumBracketBackground port) ----------------------------

  function backdropHTML() {
    return '<svg class="bc-court" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="8" y="16" width="84" height="72" rx="1.2" fill="none"/>' +
      '<line x1="8" y1="52" x2="92" y2="52"/>' +
      '<line x1="8" y1="40.5" x2="92" y2="40.5"/>' +
      '<line x1="8" y1="63.5" x2="92" y2="63.5"/>' +
      '<line x1="50" y1="16" x2="50" y2="40.5"/>' +
      '<line x1="50" y1="63.5" x2="50" y2="88"/>' +
      '</svg>';
  }

  // ---- dock (BracketBottomControlDock port) --------------------------------

  function dockHTML() {
    var grid = '<svg viewBox="0 0 16 16" width="15" height="15"><g fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<rect x="1.2" y="1.2" width="5.4" height="5.4" rx="1.4"/><rect x="9.4" y="1.2" width="5.4" height="5.4" rx="1.4"/>' +
      '<rect x="1.2" y="9.4" width="5.4" height="5.4" rx="1.4"/><rect x="9.4" y="9.4" width="5.4" height="5.4" rx="1.4"/></g></svg>';
    var scope = '<svg viewBox="0 0 16 16" width="15" height="15"><g fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<circle cx="8" cy="8" r="4.6"/><line x1="8" y1="0.6" x2="8" y2="3.2"/><line x1="8" y1="12.8" x2="8" y2="15.4"/>' +
      '<line x1="0.6" y1="8" x2="3.2" y2="8"/><line x1="12.8" y1="8" x2="15.4" y2="8"/></g><circle cx="8" cy="8" r="1.3" fill="currentColor"/></svg>';
    return '<div class="bc-dock" role="group" aria-label="Bracket controls">' +
      '<button data-bc-dock="fit" aria-label="Fit entire bracket">' + grid + '</button>' +
      '<span class="bc-dock-zoom">' +
      '<button data-bc-dock="out" aria-label="Zoom out">−</button>' +
      '<span class="bc-pct">100%</span>' +
      '<button data-bc-dock="in" aria-label="Zoom in">+</button></span>' +
      '<button data-bc-dock="center" aria-label="Recenter on selected round">' + scope + '</button>' +
      '</div>';
  }

  // ---- elimination canvas (BracketCanvasView port) -------------------------

  function renderCanvas(container, snap, ctx, sideMatches, opts) {
    opts = opts || {};
    var rr = !!opts.rr;
    var rounds = opts.rounds || orderRounds(sideMatches);
    var R = rounds.length;
    var titles = opts.titles || rounds.map(function (round, i) { return roundTitle(i, R, round.length); });
    var condensedLabels = opts.condensed || titles.map(condense);
    var n0 = rounds[0].length;

    // Frames — BracketLayoutEngine: round 0 stacked, parents at child
    // midpoints. RR mode (the app's round-robin canvas): every round is a
    // plain stacked column, no advancement geometry.
    var frames = [];
    var ys = [];
    rounds.forEach(function (round, r) {
      ys[r] = [];
      round.forEach(function (m, i) {
        var y;
        if (rr || r === 0) {
          y = HH + TP + i * (MH + VG);
        } else if (ys[r - 1][i * 2] != null && ys[r - 1][i * 2 + 1] != null) {
          y = (ys[r - 1][i * 2] + ys[r - 1][i * 2 + 1]) / 2;
        } else {
          // Imperfect tree fallback: distribute across the column.
          var span = (n0 * (MH + VG)) / round.length;
          y = HH + TP + i * span + (span - MH) / 2;
        }
        ys[r][i] = y;
        frames.push({ m: m, r: r, i: i, x: TP + r * (MW + RS), y: y });
      });
    });
    var W = TP * 2 + R * (MW + RS) - RS;
    var H = HH + TP * 2 + n0 * (MH + VG) - VG + 28;

    // Current round (first with an unfinished real match) + rail meta.
    var current = -1;
    var meta = rounds.map(function (round, i) {
      var remaining = round.filter(function (m) { return !isBye(m) && m.status !== 'completed'; }).length;
      if (current === -1 && remaining > 0) current = i;
      return {
        fullName: titles[i],
        remaining: remaining,
        hasLive: round.some(function (m) { return m.status === 'in_progress'; })
      };
    });
    var selected = current === -1 ? R - 1 : current;

    // Champion state (final decided). RR has no final match on the canvas.
    var finalMatch = !rr && rounds[R - 1].length === 1 ? rounds[R - 1][0] : null;
    var decided = !!(finalMatch && finalMatch.status === 'completed' && finalMatch.winner_id);
    ctx.championName = decided ? ((ctx.participants[finalMatch.winner_id] || {}).name || null) : null;

    // Connectors SVG — rounded elbows; winner path gets the emerald under-glow.
    var conns = [];
    frames.forEach(function (f) {
      if (rr || f.r === 0) return;
      [f.i * 2, f.i * 2 + 1].forEach(function (ci) {
        if (!rounds[f.r - 1] || ys[f.r - 1][ci] == null) return;
        var child = rounds[f.r - 1][ci];
        var sx = TP + (f.r - 1) * (MW + RS) + MW, sy = ys[f.r - 1][ci] + MH / 2;
        var ex = f.x, ey = f.y + MH / 2;
        var midX = sx + RS / 2;
        var dy = ey - sy, r = Math.min(ELBOW, Math.abs(dy) / 2), sg = dy > 0 ? 1 : -1;
        var d = Math.abs(dy) < 0.5
          ? 'M' + sx + ' ' + sy + ' L' + ex + ' ' + ey
          : 'M' + sx + ' ' + sy + ' L' + (midX - r) + ' ' + sy +
            ' Q' + midX + ' ' + sy + ' ' + midX + ' ' + (sy + sg * r) +
            ' L' + midX + ' ' + (ey - sg * r) +
            ' Q' + midX + ' ' + ey + ' ' + (midX + r) + ' ' + ey +
            ' L' + ex + ' ' + ey;
        var winner = !!child.winner_id;
        conns.push({ d: d, winner: winner, r: f.r - 1 });
      });
    });
    var svg = '<svg class="bc-wires" width="' + W + '" height="' + H + '" aria-hidden="true">' +
      conns.map(function (c) {
        var cls = 'bc-wire ' + weightClass(c.r, selected) + (c.winner ? ' bc-wire-won' : '');
        return (c.winner ? '<path class="' + cls + ' bc-wire-glow" data-round="' + c.r + '" d="' + c.d + '"/>' : '') +
          '<path class="' + cls + '" data-round="' + c.r + '" d="' + c.d + '"/>';
      }).join('') + '</svg>';

    // Round headers (glass chips above each column).
    var headers = rounds.map(function (round, r) {
      return '<div class="bc-roundhead ' + weightClass(r, selected) + '" data-round="' + r + '" style="left:' +
        (TP + r * (MW + RS)) + 'px;top:' + TP + 'px;width:' + MW + 'px">' +
        '<span>' + esc(titles[r]) + '</span><em>' + round.length + ' match' + (round.length === 1 ? '' : 'es') + '</em></div>';
    }).join('');

    // Cards.
    var cards = frames.map(function (f) {
      ctx.roundIndex = f.r;
      var champion = decided && f.r === R - 1 && f.m === finalMatch;
      return appCard(f.m, ctx, condensedLabels[f.r],
        'left:' + f.x + 'px;top:' + f.y + 'px', champion);
    }).join('');

    container.innerHTML = backdropHTML() +
      railHTML(condensedLabels, selected, railCaption(meta[selected].fullName, meta[selected].remaining)) +
      '<div class="bc-viewport"><div class="bc-sizer"><div class="bc-canvas" style="width:' + W + 'px;height:' + H + 'px">' +
      svg + headers + cards +
      '</div></div></div>' + dockHTML();

    // Spotlight classes on cards (headers/wires got theirs at build time).
    function applySpotlight(sel) {
      Array.prototype.forEach.call(container.querySelectorAll('.bc-card, .bc-roundhead, .bc-wire'), function (el) {
        var r = parseInt(el.dataset.round, 10);
        el.classList.remove('bc-w0', 'bc-w1', 'bc-w2');
        el.classList.add(weightClass(r, sel));
      });
    }
    applySpotlight(selected);

    // Zoom / pan (ZoomableBracketScrollView + dock port).
    var vp = container.querySelector('.bc-viewport');
    var sizer = container.querySelector('.bc-sizer');
    var canvas = container.querySelector('.bc-canvas');
    var pct = container.querySelector('.bc-pct');
    var fitScale = Math.max(0.3, Math.min(1, (vp.clientWidth - 8) / W));
    var scale = fitScale;
    function applyScale(s, anchorRound) {
      scale = Math.max(0.3, Math.min(3, s));
      canvas.style.transform = 'scale(' + scale + ')';
      sizer.style.width = (W * scale) + 'px';
      sizer.style.height = (H * scale) + 'px';
      pct.textContent = Math.round(scale * 100) + '%';
      if (anchorRound != null) centerRound(anchorRound, false);
    }
    function centerRound(i, smooth) {
      var x = (TP + i * (MW + RS) + MW / 2) * scale;
      vp.scrollTo({ left: x - vp.clientWidth / 2, behavior: smooth === false ? 'auto' : 'smooth' });
    }
    // Open readable, like the app: phones get full-size cards panned to the
    // current round (page pinch-zoom never needed); desktop opens at fit
    // unless fit would be unreadably small. Fit-all stays one dock tap away.
    applyScale(vp.clientWidth < 700 ? 1 : Math.max(fitScale, 0.55));
    requestAnimationFrame(function () { centerRound(selected, false); });

    function select(i, scroll) {
      selected = i;
      railSelect(container, i, meta[i]);
      applySpotlight(i);
      if (scroll !== false) centerRound(i, true);
    }
    // Initial rail geometry needs layout — defer one frame.
    requestAnimationFrame(function () { railSelect(container, selected, meta[selected]); });

    Array.prototype.forEach.call(container.querySelectorAll('[data-bc-round]'), function (b) {
      b.addEventListener('click', function () { select(parseInt(b.dataset.bcRound, 10)); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('[data-bc-dock]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.bcDock;
        if (k === 'fit') applyScale(fitScale);
        else if (k === 'in') applyScale(scale + 0.25, selected);
        else if (k === 'out') applyScale(scale - 0.25, selected);
        else if (k === 'center') centerRound(selected, true);
      });
    });
    // Card focus lift on tap (BracketTheme.focusSpring).
    Array.prototype.forEach.call(container.querySelectorAll('.bc-card.bv-tappable'), function (el) {
      el.addEventListener('click', function () {
        Array.prototype.forEach.call(container.querySelectorAll('.bc-card.bc-focus'), function (x) {
          if (x !== el) x.classList.remove('bc-focus');
        });
        el.classList.toggle('bc-focus');
      });
    });
  }

  // ---- public entry --------------------------------------------------------

  function render(container, snap, opts) {
    opts = opts || {};
    if (container._bvCleanup) { container._bvCleanup(); container._bvCleanup = null; }
    if (!snap || !supports(snap) || !(snap.matches || []).length) {
      container.innerHTML = '<div class="state"><h2>No bracket for this event</h2>' +
        '<p>The bracket appears once the schedule is generated in the app.</p></div>';
      return false;
    }
    container.classList.add('bvx');
    var participants = {};
    (snap.participants || []).forEach(function (p) { participants[p.id] = p; });
    var tv = document.body.classList.contains('bv-tv');
    var ctx = { participants: participants, interactive: !!opts.interactive, avatarSize: tv ? 22 : 18 };

    if (isRoundRobin(snap)) {
      renderRoundRobin(container, snap, ctx);
    } else {
      // Multi-side (double elim) renders each side as its own canvas stack;
      // single side gets the full spotlight/rail treatment.
      var hasLosers = snap.matches.some(function (m) { return m.bracket_side === 'losers'; });
      if (hasLosers) {
        var sides = {};
        snap.matches.forEach(function (m) {
          var key = m.bracket_side || 'winners';
          (sides[key] = sides[key] || []).push(m);
        });
        var order = ['winners', 'losers', 'finals'].filter(function (k) { return sides[k]; });
        Object.keys(sides).forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });
        var titles = { winners: 'Winners Bracket', losers: 'Losers Bracket', finals: 'Finals' };
        container.innerHTML = order.map(function (k) {
          return '<h3 class="bv-side-title">' + (titles[k] || k) + '</h3><div class="bc-stack" data-side="' + k + '"></div>';
        }).join('');
        order.forEach(function (k) {
          renderCanvas(container.querySelector('.bc-stack[data-side="' + k + '"]'), snap, ctx, sides[k]);
        });
      } else {
        renderCanvas(container, snap, ctx, snap.matches);
      }
    }

    wireTaps(container, ctx, opts);
    wireResize(container, snap, opts);
    return true;
  }

  function wireTaps(container, ctx, opts) {
    if (ctx.interactive && opts.onMatch) {
      Array.prototype.forEach.call(container.querySelectorAll('[data-bv-match]'), function (el) {
        el.addEventListener('click', function () { opts.onMatch(el.dataset.bvMatch); });
      });
    }
  }

  function wireResize(container, snap, opts) {
    var lastW = container.clientWidth;
    var timer = null;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (Math.abs(container.clientWidth - lastW) > 40) render(container, snap, opts);
      }, 200);
    }
    window.addEventListener('resize', onResize);
    container._bvCleanup = function () {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }

  // ---- round robin (standings + rounds, app rail + card language) ----------

  function summaryPoints(m) {
    var p1 = 0, p2 = 0;
    (m.score_summary || '').split(',').forEach(function (set) {
      var parts = set.trim().split('-');
      if (parts.length === 2) {
        var a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
        if (!isNaN(a) && !isNaN(b)) { p1 += a; p2 += b; }
      }
    });
    return [p1, p2];
  }

  function rrStandings(matches, participants) {
    var rows = {};
    Object.keys(participants).forEach(function (id) {
      rows[id] = { id: id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 };
    });
    matches.forEach(function (m) {
      if (m.status !== 'completed' || !m.participant1_id || !m.participant2_id || !m.winner_id) return;
      var r1 = rows[m.participant1_id], r2 = rows[m.participant2_id];
      if (!r1 || !r2) return;
      var pts = summaryPoints(m);
      r1.played++; r2.played++;
      r1.pf += pts[0]; r1.pa += pts[1];
      r2.pf += pts[1]; r2.pa += pts[0];
      if (m.winner_id === m.participant1_id) { r1.wins++; r2.losses++; } else { r2.wins++; r1.losses++; }
    });
    return Object.keys(rows).map(function (id) { return rows[id]; }).sort(function (a, b) {
      if (b.wins !== a.wins) return b.wins - a.wins;
      var da = a.pf - a.pa, db2 = b.pf - b.pa;
      if (db2 !== da) return db2 - da;
      if (b.pf !== a.pf) return b.pf - a.pf;
      var na = (participants[a.id] || {}).name || '', nb = (participants[b.id] || {}).name || '';
      return na.localeCompare(nb);
    });
  }

  function renderRoundRobin(container, snap, ctx) {
    var matches = snap.matches || [];
    var standings = rrStandings(matches, ctx.participants);
    var real = matches.filter(function (m) { return m.participant1_id && m.participant2_id; });
    var allDone = real.length > 0 && real.every(function (m) { return m.status === 'completed'; });

    var byRound = {};
    matches.forEach(function (m) {
      var r = m.round || 0;
      (byRound[r] = byRound[r] || []).push(m);
    });
    var roundNums = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; });
    var roundArrays = roundNums.map(function (r) {
      return byRound[r].sort(function (a, b) { return (a.match_number || 0) - (b.match_number || 0); });
    });

    var n = (snap.participants || []).length;
    var summary = '<div class="bvx-summary">' + n + ' teams · Round robin · ' + roundNums.length + ' rounds</div>';

    var champion = '';
    if (allDone && standings.length && standings[0].wins) {
      var top = standings[0], tp = ctx.participants[top.id];
      champion = '<div class="bv-champion"><div class="bv-trophy">🏆</div>' +
        (tp ? window.PCLive.avatarStack(tp.members, 44) : '') +
        '<div class="bv-champ-name">' + esc(tp ? tp.name : 'Champion') + '</div>' +
        '<div class="bv-champ-score">' + top.wins + '–' + top.losses + ' · ' +
        (top.pf - top.pa >= 0 ? '+' : '') + (top.pf - top.pa) + ' points</div></div>';
    }

    var standRows = standings.map(function (s, i) {
      var p = ctx.participants[s.id] || {};
      var diff = s.pf - s.pa;
      return '<div class="bv-stand-row' + (allDone && i === 0 ? ' bv-stand-leader' : '') + '">' +
        '<span class="bv-stand-rank">' + (i + 1) + '</span>' +
        window.PCLive.avatarStack(p.members, 20) +
        '<span class="bv-name">' + esc(p.name || 'Player') + '</span>' +
        '<span class="bv-stand-num">' + s.wins + '</span>' +
        '<span class="bv-stand-num">' + s.losses + '</span>' +
        '<span class="bv-stand-num bv-stand-diff">' + (diff > 0 ? '+' : '') + diff + '</span></div>';
    }).join('');

    // Canvas first (the app's RR bracket: rounds as columns on the court
    // backdrop, rail + ball + spotlight + zoom dock); standings below it.
    container.innerHTML = summary + '<div class="bc-host"></div>' +
      champion +
      '<div class="bv-stand" id="bvx-stand">' +
      '<div class="bv-stand-row bv-stand-head"><span class="bv-stand-rank">#</span><span></span>' +
      '<span class="bv-name">Round robin standings</span>' +
      '<span class="bv-stand-num">W</span><span class="bv-stand-num">L</span><span class="bv-stand-num">+/−</span></div>' +
      standRows + '</div>';

    renderCanvas(container.querySelector('.bc-host'), snap, ctx, matches, {
      rr: true,
      rounds: roundArrays,
      titles: roundNums.map(function (r) { return 'Round ' + r; }),
      condensed: roundNums.map(function (r) { return 'R' + r; }),
    });
  }

  window.PCBracket = { render: render, isElimination: isElimination, isRoundRobin: isRoundRobin, supports: supports };
})();
