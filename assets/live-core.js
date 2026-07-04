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

  /** Passwordless: email a one-tap sign-in link that returns to this page. */
  async function sendMagicLink(email) {
    var redirect = location.origin.indexOf('http') === 0
      ? location.origin + location.pathname + location.search
      : 'https://www.picklecue.com/organizer.html';
    var r = await client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: redirect, shouldCreateUser: false },
    });
    if (r.error) throw r.error;
    return true;
  }

  /** Same Apple/Google buttons as the app, on the web. */
  async function signInWithProvider(provider) {
    var redirect = location.origin.indexOf('http') === 0
      ? location.origin + location.pathname + location.search
      : 'https://www.picklecue.com/organizer.html';
    var r = await client.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: redirect },
    });
    if (r.error) throw r.error; // browser redirects on success
  }

  /**
   * Shared sign-in card: Apple + Google, email+password, and magic link.
   * opts: { title, blurb, onSignedIn }
   */
  function renderAuthCard(container, opts) {
    opts = opts || {};
    container.innerHTML =
      '<div class="auth-card"><h1>' + esc(opts.title || 'Sign in') + '</h1>' +
      '<p>' + esc(opts.blurb || 'Use the same PickleCue account as the app.') + '</p>' +
      '<div class="auth-providers">' +
      '<button class="btn block auth-apple" id="pcAuthApple">\uF8FF Continue with Apple</button>' +
      '<button class="btn block ghost" id="pcAuthGoogle">Continue with Google</button>' +
      '</div>' +
      '<div class="auth-divider"><span>or use your email</span></div>' +
      '<div class="field"><label>Email</label><input id="pcAuthEmail" type="email" autocomplete="email"></div>' +
      '<div class="field"><label>Password</label><input id="pcAuthPw" type="password" autocomplete="current-password" placeholder="Leave blank to get a sign-in link"></div>' +
      '<button class="btn primary block" id="pcAuthGo">Sign in</button>' +
      '<button class="btn ghost block" id="pcAuthMagic" style="margin-top:8px">Email me a sign-in link</button>' +
      '<p class="err" id="pcAuthErr"></p><p class="ok" id="pcAuthOk"></p>' +
      '<p style="font-size:12px;color:var(--ink-mute);margin-top:10px">No password? Signed up with Apple or Google in the app? Use the matching button above, or the sign-in link \u2014 it works for every account.</p></div>';

    var err = function (m) { container.querySelector('#pcAuthErr').textContent = m || ''; };
    var ok = function (m) { container.querySelector('#pcAuthOk').textContent = m || ''; };

    container.querySelector('#pcAuthApple').addEventListener('click', function () {
      err(''); signInWithProvider('apple').catch(function (e) {
        err('Apple sign-in isn\u2019t available on the web yet \u2014 use Google, your password, or a sign-in link. (' + (e.message || e) + ')');
      });
    });
    container.querySelector('#pcAuthGoogle').addEventListener('click', function () {
      err(''); signInWithProvider('google').catch(function (e) { err(e.message || 'Google sign-in failed.'); });
    });
    container.querySelector('#pcAuthGo').addEventListener('click', doPassword);
    container.querySelector('#pcAuthPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doPassword(); });
    container.querySelector('#pcAuthMagic').addEventListener('click', async function () {
      err(''); ok('');
      var email = container.querySelector('#pcAuthEmail').value.trim();
      if (!email) { err('Enter your email first, then tap the link button.'); return; }
      this.disabled = true;
      try {
        await sendMagicLink(email);
        ok('Check your email \u2014 tap the sign-in link and you\u2019ll land right back here.');
      } catch (e) {
        err(e.message === 'Signups not allowed for otp'
          ? 'No PickleCue account uses that email \u2014 sign up in the app first.'
          : (e.message || 'Couldn\u2019t send the link.'));
        this.disabled = false;
      }
    });
    async function doPassword() {
      err(''); ok('');
      var email = container.querySelector('#pcAuthEmail').value.trim();
      var pw = container.querySelector('#pcAuthPw').value;
      if (!pw) { container.querySelector('#pcAuthMagic').click(); return; }
      var btn = container.querySelector('#pcAuthGo');
      btn.disabled = true;
      try {
        await signIn(email, pw);
        if (opts.onSignedIn) opts.onSignedIn();
      } catch (e) { err(e.message || 'Sign in failed.'); btn.disabled = false; }
    }
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
    sendMagicLink: sendMagicLink,
    signInWithProvider: signInWithProvider,
    renderAuthCard: renderAuthCard,
    signOut: signOut,
    isPro: isPro,
    esc: esc,
    fmtDate: fmtDate,
    statusLabel: statusLabel,
  };
})();
