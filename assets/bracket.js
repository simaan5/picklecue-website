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
    return '<div class="bv-card ' + st.cls + (ctx.interactive ? ' bv-tappable' : '') + '" data-bv-match="' + m.id + '"' +
      ' role="group" aria-label="Match: ' + esc((ctx.participants[m.participant1_id] || {}).name || 'TBD') +
      ' vs ' + esc((ctx.participants[m.participant2_id] || {}).name || 'TBD') + '">' +
      sideRow(m, 1, ctx) + sideRow(m, 2, ctx) +
      (meta.length ? '<div class="bv-meta">' + meta.join(' · ') + '</div>' : '') +
      '</div>';
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

    var narrow = container.clientWidth <= 620 && !tv;
    if (narrow) {
      renderVertical(container, sides, order, ctx);
    } else {
      renderFit(container, sides, order, ctx, tv);
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
    var roundsHtml = Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; })
      .map(function (r) {
        var round = byRound[r].sort(function (a, b) { return (a.match_number || 0) - (b.match_number || 0); });
        var done = round.filter(function (m) { return m.status === 'completed'; }).length;
        return '<div class="bvv-round"><h3>Round ' + r +
          ' <span class="count" style="color:var(--ink-mute)">' + done + '/' + round.length + '</span></h3>' +
          round.map(function (m) { return matchCard(m, ctx); }).join('') + '</div>';
      }).join('');

    container.innerHTML =
      rrChampionHTML(standings, allDone, ctx) +
      '<div class="bv-stand">' +
      '<div class="bv-stand-row bv-stand-head"><span class="bv-stand-rank">#</span><span></span>' +
      '<span class="bv-name">Round robin standings</span>' +
      '<span class="bv-stand-num">W</span><span class="bv-stand-num">L</span><span class="bv-stand-num">+/−</span></div>' +
      standRows + '</div>' +
      '<div class="bv-rr">' + roundsHtml + '</div>';
  }

  // ---- fit mode (desktop / tablet / TV): scale the tree to the container --

  function renderFit(container, sides, order, ctx, tv) {
    var titles = { winners: 'Winners Bracket', losers: 'Losers Bracket', finals: 'Finals' };
    var html = order.map(function (key) {
      return (order.length > 1 ? '<h3 class="bv-side-title">' + (titles[key] || key) + '</h3>' : '') +
        '<div class="bv-viewport">' + treeHTML(sides[key], ctx) + '</div>';
    }).join('');
    container.innerHTML = html;

    var minScale = tv ? 0.25 : 0.55;
    var needVertical = false;
    Array.prototype.forEach.call(container.querySelectorAll('.bv-viewport'), function (vp) {
      var tree = vp.querySelector('.bv-tree');
      var cw = vp.clientWidth;
      var tw = tree.scrollWidth;
      var scale = Math.min(1, cw / tw);
      if (scale < minScale) { needVertical = true; return; }
      tree.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
      vp.style.height = (tree.scrollHeight * scale) + 'px';
    });
    // Fitting would make the text unreadably small → vertical layout instead.
    if (needVertical) renderVertical(container, sides, order, ctx);
  }

  function treeHTML(matches, ctx) {
    var rounds = orderRounds(matches);
    var finalMatch = rounds[rounds.length - 1].length === 1 ? rounds[rounds.length - 1][0] : null;
    var perfect = isPerfectTree(rounds);
    var units = rounds[0].length * 2;

    var cols = rounds.map(function (round, ri) {
      var title = '<div class="bv-round-title">' + roundTitle(ri, rounds.length, round.length) + '</div>';
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
      return '<div class="bv-col">' + title + body + '</div>';
    });

    var champion = championHTML(finalMatch, ctx);
    return '<div class="bv-tree' + (perfect ? ' bv-perfect' : '') + '">' + cols.join('') +
      (champion ? '<div class="bv-col bv-champion-col"><div class="bv-round-title">Champion</div>' + champion + '</div>' : '') +
      '</div>';
  }

  // ---- vertical mode (mobile portrait / very large brackets on small screens)

  function renderVertical(container, sides, order, ctx) {
    var titles = { winners: 'Winners Bracket', losers: 'Losers Bracket', finals: 'Finals' };
    var html = order.map(function (key) {
      var rounds = orderRounds(sides[key]);
      var finalMatch = rounds[rounds.length - 1].length === 1 ? rounds[rounds.length - 1][0] : null;
      var champion = championHTML(finalMatch, ctx);
      return (order.length > 1 ? '<h3 class="bv-side-title">' + (titles[key] || key) + '</h3>' : '') +
        '<div class="bvv">' +
        (champion ? '<div class="bvv-round"><h3>Champion</h3>' + champion + '</div>' : '') +
        rounds.map(function (round, ri) {
          return '<div class="bvv-round"><h3>' + roundTitle(ri, rounds.length, round.length) +
            ' <span class="count" style="color:var(--ink-mute)">' + round.length + '</span></h3>' +
            round.map(function (m) { return matchCard(m, ctx); }).join('') + '</div>';
        }).join('') +
        '</div>';
    }).join('');
    container.innerHTML = html;
  }

  window.PCBracket = { render: render, isElimination: isElimination, isRoundRobin: isRoundRobin, supports: supports };
})();
