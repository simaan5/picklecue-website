/* PickleCue BracketView — visual tournament tree renderer.
 *
 * Renders elimination brackets from a live_tournament_snapshot with three
 * automatic layouts (no mandatory horizontal scrolling anywhere):
 *   • Desktop / tablet / TV — full tree, scaled to FIT the container width
 *     (CSS transform), connector elbows on perfect power-of-two trees.
 *   • Narrow screens (or when fitting would make text unreadable) — a
 *     vertical bracket: stacked round sections Round 1 → Final → Champion.
 *   • display=tv (body.bv-tv) — chrome-free, always fit, larger type.
 *
 * Every participant row shows the SAME avatar the iOS app shows (preset
 * avatar_id → uploaded avatar_url → avatar_emoji → initials), resolved from
 * the profile record via the snapshot — never event-local avatar copies.
 *
 * DB round conventions differ by generator (some store the final as round 1,
 * some as round N), so display order is derived from matches-per-round.
 */
(function () {
  'use strict';
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  function isElimination(snap) {
    var f = snap && snap.tournament && snap.tournament.format;
    return !!f && f.indexOf('elimination') !== -1;
  }

  function isRoundRobin(snap) {
    var f = snap && snap.tournament && snap.tournament.format;
    return !!f && f.indexOf('round_robin') !== -1;
  }

  // Every format this renderer can draw — mirrors the app's bracket screen,
  // which shows elimination trees AND round-robin schedules/standings.
  function supports(snap) {
    return isElimination(snap) || isRoundRobin(snap);
  }

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

  function isPerfectTree(rounds) {
    for (var i = 1; i < rounds.length; i++) {
      if (rounds[i].length * 2 !== rounds[i - 1].length) return false;
    }
    return rounds.length > 1 && rounds[rounds.length - 1].length === 1;
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

  function statusInfo(m) {
    if (m.status === 'in_progress') return { cls: 'bv-live', label: '● Live' };
    if (m.status === 'completed') return { cls: 'bv-done', label: 'Final' };
    if (m.status === 'bye') return { cls: 'bv-bye', label: 'Bye' };
    if (m.participant1_id && m.participant2_id) return { cls: 'bv-ready', label: 'On deck' };
    return { cls: 'bv-pending', label: '' };
  }

  function scoreFor(m, side) {
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

  function sideRow(m, side, ctx) {
    var id = side === 1 ? m.participant1_id : m.participant2_id;
    var p = id ? ctx.participants[id] : null;
    var name = p ? p.name : (id ? 'Player' : 'TBD');
    var won = m.winner_id && m.winner_id === id;
    var lost = m.winner_id && id && m.winner_id !== id;
    var score = scoreFor(m, side);
    var avatar = id
      ? window.PCLive.avatarStack(p && p.members, ctx.avatarSize)
      : window.PCLive.initialsBubble('·', ctx.avatarSize);
    return '<div class="bv-row' + (won ? ' bv-won' : '') + (lost ? ' bv-lost' : '') + (id ? '' : ' bv-tbd') + '">' +
      (p && p.seed ? '<span class="bv-seed">' + p.seed + '</span>' : '<span class="bv-seed bv-noseed"></span>') +
      avatar +
      '<span class="bv-name">' + esc(name) + '</span>' +
      (won ? '<span class="bv-check">✓</span>' : '') +
      '<span class="bv-pts">' + (score == null ? '' : score) + '</span></div>';
  }

  function matchCard(m, ctx) {
    var st = statusInfo(m);
    var meta = [];
    if (m.court) meta.push(esc(m.court));
    if (st.label) meta.push('<span class="bv-status ' + st.cls + '">' + st.label + '</span>');
    // "QF · M1"-style tag, exactly like the app's bracket canvas cards.
    var tag = ctx.cardTag && m.match_number
      ? '<div class="bv-tag">' + esc(ctx.cardTag) + ' · M' + m.match_number + '</div>' : '';
    return '<div class="bv-card ' + st.cls + (ctx.interactive ? ' bv-tappable' : '') + '" data-bv-match="' + m.id + '"' +
      ' role="group" aria-label="Match: ' + esc((ctx.participants[m.participant1_id] || {}).name || 'TBD') +
      ' vs ' + esc((ctx.participants[m.participant2_id] || {}).name || 'TBD') + '">' +
      tag + sideRow(m, 1, ctx) + sideRow(m, 2, ctx) +
      (meta.length ? '<div class="bv-meta">' + meta.join(' · ') + '</div>' : '') +
      '</div>';
  }

  // "Quarterfinals" → "QF" for pills and card tags (app parity).
  function roundAbbrev(title) {
    if (title === 'Final') return 'Final';
    if (title === 'Semifinals') return 'SF';
    if (title === 'Quarterfinals') return 'QF';
    var of = title.match(/^Round of (\d+)$/);
    if (of) return 'R' + of[1];
    var rn = title.match(/^Round (\d+)$/);
    if (rn) return 'R' + rn[1];
    return title;
  }

  // "8 teams · Single elimination · 3 rounds" — the app's bracket subtitle.
  function summaryHTML(snap, roundsCount) {
    var n = (snap.participants || []).length;
    var f = String(snap.tournament.format || '').replace(/_/g, ' ');
    f = f.charAt(0).toUpperCase() + f.slice(1);
    return '<div class="bvx-summary">' + n + ' teams · ' + esc(f) + ' · ' + roundsCount +
      ' round' + (roundsCount === 1 ? '' : 's') + '</div>';
  }

  // Current-round progress line + track ("Quarterfinals · 4 matches remaining").
  function progressHTML(rounds, titleFor) {
    var total = 0, done = 0, current = -1, remaining = 0;
    rounds.forEach(function (round, i) {
      round.forEach(function (m) {
        if (m.status === 'bye') return;
        total++;
        if (m.status === 'completed') done++;
      });
      if (current === -1) {
        var left = round.filter(function (m) { return m.status !== 'completed' && m.status !== 'bye'; }).length;
        if (left > 0) { current = i; remaining = left; }
      }
    });
    var label = current === -1
      ? 'Bracket complete'
      : titleFor(current) + ' · ' + remaining + ' match' + (remaining === 1 ? '' : 'es') + ' remaining';
    var pct = total ? Math.round(done / total * 100) : 0;
    return { html: '<div class="bvx-sub">' + esc(label) +
      '<div class="bvx-track"><div class="bvx-fill" style="width:' + pct + '%"></div></div></div>',
      current: current };
  }

  function championHTML(finalMatch, ctx) {
    if (!finalMatch || finalMatch.status !== 'completed' || !finalMatch.winner_id) return '';
    var p = ctx.participants[finalMatch.winner_id];
    return '<div class="bv-champion"><div class="bv-trophy">🏆</div>' +
      (p ? window.PCLive.avatarStack(p.members, 44) : '') +
      '<div class="bv-champ-name">' + esc(p ? p.name : 'Champion') + '</div>' +
      (finalMatch.score_summary ? '<div class="bv-champ-score">' + esc(finalMatch.score_summary) + '</div>' : '') +
      '</div>';
  }

  // ---- public entry -----------------------------------------------------

  function render(container, snap, opts) {
    opts = opts || {};
    if (container._bvCleanup) { container._bvCleanup(); container._bvCleanup = null; }
    if (!snap || !supports(snap) || !(snap.matches || []).length) {
      container.innerHTML = '<div class="state"><h2>No bracket for this event</h2>' +
        '<p>The bracket appears once the schedule is generated in the app.</p></div>';
      return false;
    }
    container.classList.add('bvx'); // app-style skin (fixed-dark, neon green)
    var participants = {};
    (snap.participants || []).forEach(function (p) { participants[p.id] = p; });
    var tv = document.body.classList.contains('bv-tv');
    var ctx = { participants: participants, interactive: !!opts.interactive, avatarSize: tv ? 30 : 22 };

    if (isRoundRobin(snap)) {
      renderRoundRobin(container, snap, ctx);
      wireTaps(container, ctx, opts);
      wireResize(container, snap, opts);
      return true;
    }

    var hasLosers = snap.matches.some(function (m) { return m.bracket_side === 'losers'; });
    var sides = {};
    snap.matches.forEach(function (m) {
      var key = hasLosers ? (m.bracket_side || 'winners') : 'main';
      (sides[key] = sides[key] || []).push(m);
    });
    var order = ['main', 'winners', 'losers', 'finals'].filter(function (k) { return sides[k]; });
    Object.keys(sides).forEach(function (k) { if (order.indexOf(k) === -1) order.push(k); });

    // App-canvas chrome, computed on the primary side: summary line, round
    // pills (single-sided brackets only — pills over a double-elim would be
    // ambiguous), and the current-round progress line.
    var primaryKey = sides.main ? 'main' : order[0];
    var primaryRounds = orderRounds(sides[primaryKey]);
    var roundTitles = primaryRounds.map(function (round, i) {
      return roundTitle(i, primaryRounds.length, round.length);
    });
    var prog = progressHTML(primaryRounds, function (i) { return roundTitles[i]; });
    var chrome = {
      summary: summaryHTML(snap, primaryRounds.length),
      progress: prog.html,
      current: prog.current,
      titles: roundTitles,
      pills: order.length === 1,
    };

    var narrow = container.clientWidth <= 620 && !tv;
    if (narrow) {
      renderVertical(container, sides, order, ctx, chrome);
    } else {
      renderFit(container, sides, order, ctx, tv, chrome);
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

  // Re-render on real size changes (orientation, window resize).
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

  // ---- round robin (mirrors the app's RR bracket: standings + rounds) ----

  // Sum every set of a completed match's slot-1-oriented score_summary
  // ("11-8, 9-11, 11-5") into [points1, points2]. Falls back to zeros when
  // the summary is missing or unparseable — the W/L columns still count.
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

  function rrChampionHTML(standings, allDone, ctx) {
    if (!allDone || !standings.length || !standings[0].wins) return '';
    var top = standings[0];
    var p = ctx.participants[top.id];
    return '<div class="bv-champion"><div class="bv-trophy">🏆</div>' +
      (p ? window.PCLive.avatarStack(p.members, 44) : '') +
      '<div class="bv-champ-name">' + esc(p ? p.name : 'Champion') + '</div>' +
      '<div class="bv-champ-score">' + top.wins + '–' + top.losses + ' · ' +
      (top.pf - top.pa >= 0 ? '+' : '') + (top.pf - top.pa) + ' points</div></div>';
  }

  function renderRoundRobin(container, snap, ctx) {
    var matches = snap.matches || [];
    var standings = rrStandings(matches, ctx.participants);
    var real = matches.filter(function (m) { return m.participant1_id && m.participant2_id; });
    var allDone = real.length > 0 && real.every(function (m) { return m.status === 'completed'; });

    var standRows = standings.map(function (s, i) {
      var p = ctx.participants[s.id] || {};
      var diff = s.pf - s.pa;
      return '<div class="bv-stand-row' + (allDone && i === 0 ? ' bv-stand-leader' : '') + '">' +
        '<span class="bv-stand-rank">' + (i + 1) + '</span>' +
        window.PCLive.avatarStack(p.members, ctx.avatarSize) +
        '<span class="bv-name">' + esc(p.name || 'Player') + '</span>' +
        '<span class="bv-stand-num">' + s.wins + '</span>' +
        '<span class="bv-stand-num">' + s.losses + '</span>' +
        '<span class="bv-stand-num bv-stand-diff">' + (diff > 0 ? '+' : '') + diff + '</span></div>';
    }).join('');

    var byRound = {};
    matches.forEach(function (m) {
      var r = m.round || 0;
      (byRound[r] = byRound[r] || []).push(m);
    });
    var roundNums = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; });
    var roundArrays = roundNums.map(function (r) {
      return byRound[r].sort(function (a, b) { return (a.match_number || 0) - (b.match_number || 0); });
    });
    var prog = progressHTML(roundArrays, function (i) { return 'Round ' + roundNums[i]; });
    var roundsHtml = roundNums.map(function (r, idx) {
        var round = roundArrays[idx];
        var done = round.filter(function (m) { return m.status === 'completed'; }).length;
        ctx.cardTag = 'R' + r;
        var cards = round.map(function (m) { return matchCard(m, ctx); }).join('');
        ctx.cardTag = null;
        return '<div class="bvv-round" id="bvx-r' + r + '"><h3>Round ' + r +
          ' <span class="count" style="color:var(--ink-mute)">' + done + '/' + round.length + '</span></h3>' +
          cards + '</div>';
      }).join('');

    // Round-jump pills — the app bracket's round anchors, web edition.
    var nav = '<div class="bvx-nav"><button data-bvx-go="bvx-stand" class="on">Standings</button>' +
      roundNums.map(function (r) { return '<button data-bvx-go="bvx-r' + r + '">R' + r + '</button>'; }).join('') +
      '</div>';

    container.innerHTML = summaryHTML(snap, roundNums.length) + nav + prog.html +
      rrChampionHTML(standings, allDone, ctx) +
      '<div class="bv-stand" id="bvx-stand">' +
      '<div class="bv-stand-row bv-stand-head"><span class="bv-stand-rank">#</span><span></span>' +
      '<span class="bv-name">Round robin standings</span>' +
      '<span class="bv-stand-num">W</span><span class="bv-stand-num">L</span><span class="bv-stand-num">+/−</span></div>' +
      standRows + '</div>' +
      '<div class="bv-rr">' + roundsHtml + '</div>';

    wireAnchorPills(container);
  }

  // ---- shared chrome pieces ----------------------------------------------

  function pillsHTML(chrome, anchorMode) {
    if (!chrome.pills) return '';
    return '<div class="bvx-nav">' + chrome.titles.map(function (t, i) {
      var attr = anchorMode ? 'data-bvx-go="bvx-er' + i + '"' : 'data-bvx-col="' + i + '"';
      return '<button ' + attr + (i === Math.max(chrome.current, 0) ? ' class="on"' : '') + '>' +
        esc(roundAbbrev(t)) + '</button>';
    }).join('') + '</div>';
  }

  function setActivePill(container, btn) {
    Array.prototype.forEach.call(container.querySelectorAll('.bvx-nav button'), function (x) {
      x.classList.toggle('on', x === btn);
    });
  }

  function wireAnchorPills(container) {
    Array.prototype.forEach.call(container.querySelectorAll('[data-bvx-go]'), function (b) {
      b.addEventListener('click', function () {
        var el = document.getElementById(b.dataset.bvxGo);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActivePill(container, b);
      });
    });
  }

  // ---- fit mode (desktop / tablet / TV): scaled tree + zoom toolbar -------

  function renderFit(container, sides, order, ctx, tv, chrome) {
    var titles = { winners: 'Winners Bracket', losers: 'Losers Bracket', finals: 'Finals' };
    var html = chrome.summary + pillsHTML(chrome, false) + chrome.progress +
      order.map(function (key) {
        var isPrimary = key === (sides.main ? 'main' : order[0]);
        return (order.length > 1 ? '<h3 class="bv-side-title">' + (titles[key] || key) + '</h3>' : '') +
          '<div class="bv-viewport' + (isPrimary ? ' bv-vp-primary' : '') + '"><div class="bv-sizer">' +
          treeHTML(sides[key], ctx, isPrimary ? chrome.current : -1) + '</div></div>';
      }).join('') +
      // The app's bottom bar: zoom out · percent · zoom in · fit.
      '<div class="bvx-toolbar" role="group" aria-label="Bracket zoom">' +
      '<button data-bvx-zoom="out" aria-label="Zoom out">−</button>' +
      '<span class="bvx-pct">100%</span>' +
      '<button data-bvx-zoom="in" aria-label="Zoom in">+</button>' +
      '<button data-bvx-zoom="fit" aria-label="Fit to screen">⤢ Fit</button></div>';
    container.innerHTML = html;

    var minScale = tv ? 0.25 : 0.4;
    var vps = Array.prototype.slice.call(container.querySelectorAll('.bv-viewport'));
    var dims = vps.map(function (vp) {
      var tree = vp.querySelector('.bv-tree');
      return { vp: vp, tree: tree, w: tree.scrollWidth, h: tree.scrollHeight };
    });
    var fitScale = 1;
    dims.forEach(function (d) { fitScale = Math.min(fitScale, d.vp.clientWidth / d.w); });
    fitScale = Math.min(1, fitScale);
    // Unreadably small even before zooming AND we're not on a TV → vertical
    // list instead (phones landscape etc.); desktop keeps the canvas + zoom.
    if (fitScale < minScale && container.clientWidth <= 900 && !tv) {
      renderVertical(container, sides, order, ctx, chrome);
      return;
    }

    var pct = container.querySelector('.bvx-pct');
    function applyScale(s) {
      container._bvxScale = s;
      dims.forEach(function (d) {
        d.tree.style.transform = 'scale(' + s + ')';
        d.tree.parentNode.style.width = (d.w * s) + 'px';
        d.tree.parentNode.style.height = (d.h * s) + 'px';
      });
      pct.textContent = Math.round(s * 100) + '%';
    }
    applyScale(fitScale);

    Array.prototype.forEach.call(container.querySelectorAll('[data-bvx-zoom]'), function (b) {
      b.addEventListener('click', function () {
        var s = container._bvxScale || fitScale;
        if (b.dataset.bvxZoom === 'in') s = Math.min(1.5, s + 0.1);
        else if (b.dataset.bvxZoom === 'out') s = Math.max(0.25, s - 0.1);
        else s = fitScale;
        applyScale(s);
      });
    });

    // Round pills scroll the primary viewport to that round's column.
    var primaryVp = container.querySelector('.bv-vp-primary');
    Array.prototype.forEach.call(container.querySelectorAll('[data-bvx-col]'), function (b) {
      b.addEventListener('click', function () {
        var col = primaryVp.querySelector('.bv-col[data-ri="' + b.dataset.bvxCol + '"]');
        if (col) primaryVp.scrollTo({ left: col.offsetLeft * (container._bvxScale || fitScale) - 12, behavior: 'smooth' });
        setActivePill(container, b);
      });
    });
  }

  function treeHTML(matches, ctx, currentRound) {
    var rounds = orderRounds(matches);
    var finalMatch = rounds[rounds.length - 1].length === 1 ? rounds[rounds.length - 1][0] : null;
    var perfect = isPerfectTree(rounds);
    var units = rounds[0].length * 2;

    var cols = rounds.map(function (round, ri) {
      var titleText = roundTitle(ri, rounds.length, round.length);
      ctx.cardTag = roundAbbrev(titleText);
      var title = '<div class="bv-round-title">' + titleText + '</div>';
      // Rounds after the one being played are dimmed, like the app's canvas.
      var future = currentRound >= 0 && ri > currentRound;
      var body;
      if (perfect) {
        var span = units / round.length;
        body = '<div class="bv-grid" style="grid-template-rows: repeat(' + units + ', minmax(0, 1fr));">' +
          round.map(function (m, i) {
            return '<div class="bv-cell' + (ri > 0 ? ' bv-has-in' : '') + (ri < rounds.length - 1 ? ' bv-has-out' : '') +
              '" style="grid-row: ' + (i * span + 1) + ' / span ' + span + ';">' + matchCard(m, ctx) + '</div>';
          }).join('') + '</div>';
      } else {
        body = '<div class="bv-loose">' + round.map(function (m) { return matchCard(m, ctx); }).join('') + '</div>';
      }
      return '<div class="bv-col' + (future ? ' bv-future' : '') + '" data-ri="' + ri + '">' + title + body + '</div>';
    });
    ctx.cardTag = null;

    var champion = championHTML(finalMatch, ctx);
    return '<div class="bv-tree' + (perfect ? ' bv-perfect' : '') + '">' + cols.join('') +
      (champion ? '<div class="bv-col bv-champion-col"><div class="bv-round-title">Champion</div>' + champion + '</div>' : '') +
      '</div>';
  }

  // ---- vertical mode (mobile portrait / very large brackets on small screens)

  function renderVertical(container, sides, order, ctx, chrome) {
    var titles = { winners: 'Winners Bracket', losers: 'Losers Bracket', finals: 'Finals' };
    var primaryKey = sides.main ? 'main' : order[0];
    var html = chrome.summary + pillsHTML(chrome, true) + chrome.progress +
      order.map(function (key) {
        var rounds = orderRounds(sides[key]);
        var finalMatch = rounds[rounds.length - 1].length === 1 ? rounds[rounds.length - 1][0] : null;
        var champion = championHTML(finalMatch, ctx);
        var isPrimary = key === primaryKey;
        return (order.length > 1 ? '<h3 class="bv-side-title">' + (titles[key] || key) + '</h3>' : '') +
          '<div class="bvv">' +
          (champion ? '<div class="bvv-round"><h3>Champion</h3>' + champion + '</div>' : '') +
          rounds.map(function (round, ri) {
            var titleText = roundTitle(ri, rounds.length, round.length);
            ctx.cardTag = roundAbbrev(titleText);
            var future = isPrimary && chrome.current >= 0 && ri > chrome.current;
            var cards = round.map(function (m) { return matchCard(m, ctx); }).join('');
            ctx.cardTag = null;
            return '<div class="bvv-round' + (future ? ' bv-future' : '') + '"' +
              (isPrimary ? ' id="bvx-er' + ri + '"' : '') + '><h3>' + titleText +
              ' <span class="count" style="color:var(--ink-mute)">' + round.length + '</span></h3>' +
              cards + '</div>';
          }).join('') +
          '</div>';
      }).join('');
    container.innerHTML = html;
    wireAnchorPills(container);
  }

  window.PCBracket = { render: render, isElimination: isElimination, isRoundRobin: isRoundRobin, supports: supports };
})();
