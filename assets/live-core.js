/* PickleCue live events — shared web client.
 *
 * One Supabase backend for app + web. Public pages read through the
 * anon-callable snapshot RPCs (live_tournament_snapshot / live_league_snapshot,
 * privacy enforced server-side by can_access_*); writes go ONLY through the
 * SECURITY DEFINER RPCs (record_score_event / undo_last_score_event), never
 * direct table writes. Live updates arrive as tiny broadcast pings on
 * live:t:<id> / live:l:<id> — on ping, we refetch the snapshot (debounced).
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://uejmhtdfbqbotvbqvfja.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAsImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc';

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  // ---- data -----------------------------------------------------------------

  async function tournamentSnapshot(id) {
    var r = await client.rpc('live_tournament_snapshot', { p_tournament_id: id });
    if (r.error) throw r.error;
    return r.data; // null = not found / no access
  }

  async function leagueSnapshot(id) {
    var r = await client.rpc('live_league_snapshot', { p_league_id: id });
    if (r.error) throw r.error;
    return r.data;
  }

  async function recordScoreEvent(opts) {
    var r = await client.rpc('record_score_event', {
      p_scope: opts.scope,               // 'tournament' | 'league'
      p_match_id: opts.matchId,
      p_event_type: opts.eventType,      // point_added | point_removed | game_completed | match_started | match_completed | score_corrected
      p_score1: opts.score1 ?? null,
      p_score2: opts.score2 ?? null,
      p_game: opts.game ?? null,
      p_note: opts.note ?? null,
      p_source: 'web',
    });
    if (r.error) throw r.error;
    return r.data;
  }

  async function undoLastScoreEvent(scope, matchId) {
    var r = await client.rpc('undo_last_score_event', { p_scope: scope, p_match_id: matchId });
    if (r.error) throw r.error;
    return r.data;
  }

  // ---- realtime -------------------------------------------------------------

  /**
   * Subscribe to the live ping channel for an event.
   * kind: 't' | 'l'; isPublic decides public vs private broadcast channel.
   * onPing fires debounced; onState receives 'live' | 'connecting' | 'offline'.
   * Returns an unsubscribe function.
   */
  function subscribeLive(kind, id, isPublic, onPing, onState) {
    var topic = 'live:' + kind + ':' + id;
    var debounceTimer = null;
    var pollTimer = null;
    var channel = null;
    var stopped = false;

    function ping() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onPing, 250);
    }

    function connect() {
      if (stopped) return;
      if (channel) client.removeChannel(channel);
      channel = client
        .channel(topic, { config: { broadcast: { self: true }, private: !isPublic } })
        .on('broadcast', { event: 'change' }, ping)
        .subscribe(function (status) {
          if (stopped) return;
          if (status === 'SUBSCRIBED') {
            onState && onState('live');
            ping(); // catch anything missed while connecting
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            onState && onState('connecting');
            setTimeout(connect, 4000);
          }
        });
    }
    connect();

    // Safety net: refetch when the tab wakes up, and slow-poll as backstop.
    function onVisible() { if (document.visibilityState === 'visible') ping(); }
    document.addEventListener('visibilitychange', onVisible);
    pollTimer = setInterval(ping, 60000);

    return function unsubscribe() {
      stopped = true;
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) client.removeChannel(channel);
    };
  }

  // ---- auth -----------------------------------------------------------------

  async function currentUser() {
    var r = await client.auth.getUser();
    return r.data ? r.data.user : null;
  }

  async function signIn(email, password) {
    var r = await client.auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    await client.realtime.setAuth(); // private channels need the fresh JWT
    return r.data.user;
  }

  async function signOut() { await client.auth.signOut(); }

  async function isPro() {
    var r = await client.rpc('is_pro_subscriber');
    return !r.error && r.data === true;
  }

  // ---- tiny dom/format helpers ----------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) { return iso; }
  }

  function statusLabel(s) {
    return ({
      registration: 'Registration open', in_progress: 'Live', completed: 'Completed',
      scheduled: 'Scheduled', pending: 'Pending', active: 'Live', cancelled: 'Cancelled',
      upcoming: 'Upcoming', draft: 'Draft', bye: 'Bye',
    })[s] || (s || '');
  }

  // ---- avatars ---------------------------------------------------------------
  // Mirrors the iOS app's ProfileAvatarView priority exactly:
  // avatar_id (bundled preset, same PNGs shipped in assets/avatars/) →
  // avatar_url (public storage photo) → avatar_emoji → initials fallback.
  // The profile record is the single source of truth — no event-local avatars.

  function initialsFor(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function avatarBubble(member, size) {
    size = size || 24;
    var style = 'width:' + size + 'px;height:' + size + 'px;';
    var name = esc(member && member.name || '');
    if (member && member.avatar_id) {
      return '<img class="pc-avatar" style="' + style + '" src="assets/avatars/' +
        encodeURIComponent(member.avatar_id) + '.png" alt="' + name + '" loading="lazy" ' +
        'onerror="this.outerHTML=window.PCLive.initialsBubble(\'' + esc(initialsFor(member.name)) + '\',' + size + ')">';
    }
    if (member && member.avatar_url) {
      return '<img class="pc-avatar" style="' + style + '" src="' + esc(member.avatar_url) + '" alt="' + name + '" loading="lazy" ' +
        'onerror="this.outerHTML=window.PCLive.initialsBubble(\'' + esc(initialsFor(member.name)) + '\',' + size + ')">';
    }
    if (member && member.avatar_emoji) {
      return '<span class="pc-avatar pc-avatar-emoji" style="' + style + 'font-size:' + Math.round(size * 0.55) + 'px" aria-hidden="true">' +
        esc(member.avatar_emoji) + '</span>';
    }
    return initialsBubble(initialsFor(member && member.name), size);
  }

  function initialsBubble(initials, size) {
    return '<span class="pc-avatar pc-avatar-initials" style="width:' + size + 'px;height:' + size +
      'px;font-size:' + Math.max(9, Math.round(size * 0.38)) + 'px" aria-hidden="true">' + esc(initials || '?') + '</span>';
  }

  /** Stacked avatars for a participant/team (members array from snapshot). */
  function avatarStack(members, size) {
    size = size || 24;
    var list = (members && members.length) ? members.slice(0, 2) : [null];
    return '<span class="pc-avatar-stack">' +
      list.map(function (m) { return avatarBubble(m, size); }).join('') + '</span>';
  }

  window.PCLive = {
    avatarBubble: avatarBubble,
    avatarStack: avatarStack,
    initialsBubble: initialsBubble,
    initialsFor: initialsFor,
    client: client,
    tournamentSnapshot: tournamentSnapshot,
    leagueSnapshot: leagueSnapshot,
    recordScoreEvent: recordScoreEvent,
    undoLastScoreEvent: undoLastScoreEvent,
    subscribeLive: subscribeLive,
    currentUser: currentUser,
    signIn: signIn,
    signOut: signOut,
    isPro: isPro,
    esc: esc,
    fmtDate: fmtDate,
    statusLabel: statusLabel,
  };
})();
