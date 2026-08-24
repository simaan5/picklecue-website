/**
 * Capture scenes.
 *
 * Only scenes backed by a shipped, verified surface belong here. Anything not
 * proven end-to-end stays out — a screenshot is a product claim.
 *
 * EXPLICITLY EXCLUDED, and why:
 *   - event-level waitlist auto-promotion: production registrations only ever
 *     show `registered` / `withdrawn`. Not captured and not to be described in
 *     copy until the whole flow is exercised and the resulting state proven.
 *   - payments / entry-fee checkout, coaching marketplace, Android: not built.
 *
 * Source events (production, is_public = true, anon-readable):
 *   T_DONE  completed 8-player single elimination, all 7 matches played
 *   T_REG   open registration, 8 registered
 *   T_LIVE  in-progress round robin, 10 matches scheduled
 * Their production names are the superseded LA-world ones; personas.json
 * renames them to the Inland Empire world at scrub time.
 */

export const EVENTS = {
  T_DONE: 'c1000001-0000-4000-8000-000000000002',
  T_REG: 'c1000001-0000-4000-8000-000000000001',
  T_LIVE: '81d8ca16-fa8d-41e9-a445-133f968da32d',

  // Dedicated marketing event, reserved id block c1000002-* (c1000001-* is the
  // superseded LA world). "Foothill Fall Shootout" — doubles, registration
  // open, waiver required, partner pairing on, waitlist explicitly DISABLED so
  // the unproven auto-promotion feature cannot appear in any capture.
  //
  // Every row under it was produced by the real production RPCs
  // (register_for_event, pair_registrations, sign_event_waiver,
  // set_check_in_status, get_or_create_short_code) — not hand-written.
  // Provenance: qa/marketing-account/FOOTHILL-FALL-SHOOTOUT.md in the app repo.
  T_MARKETING: 'c1000002-0000-4000-8000-000000000001',
};

/** Short code for T_MARKETING, issued by get_or_create_short_code. */
export const MARKETING_CODE = 'FUDMRD';

/**
 * The ONLY events this pipeline may ever capture.
 *
 * The marketing organizer is a dedicated account that must never hold a real
 * customer's event. That rule cannot depend on everyone remembering it, so it
 * is enforced: an authenticated capture asserts the account's event list
 * contains nothing outside this set and REFUSES to run otherwise, rather than
 * quietly photographing a stranger's tournament.
 *
 * Adding an id here is a deliberate act. If a capture fails because of this
 * check, the right response is almost always to move the unexpected event off
 * the marketing account — not to widen the list.
 */
export const ALLOWED_EVENT_IDS = new Set([
  EVENTS.T_MARKETING,   // Foothill Fall Shootout — the dedicated capture event
  EVENTS.T_DONE,        // Citrus Belt Championship
  EVENTS.T_REG,         // Fontana Park Open
  EVENTS.T_LIVE,        // Cucamonga Peak Classic
]);

/** Desktop is the marketing hero size; phone proves the same page on a court. */
export const VIEWPORTS = {
  // `viewport` must stay nested — Playwright ignores top-level width/height
  // and silently falls back to 1280x720, which is how you end up with a
  // "desktop" hero that was never actually 1440 wide.
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  phone: {
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

export const SCENES = [
  {
    id: 'live-results',
    feature: 'Public live event',
    label: 'Results — no app, no login',
    page: 'live.html',
    query: { t: EVENTS.T_DONE, view: 'results' },
    viewport: 'desktop',
  },
  {
    id: 'live-bracket',
    feature: 'Tournament bracket',
    label: 'Full bracket in the browser',
    page: 'live.html',
    query: { t: EVENTS.T_DONE, view: 'bracket' },
    viewport: 'desktop',
  },
  {
    id: 'live-bracket-phone',
    feature: 'Tournament bracket',
    label: 'Bracket on a phone at the court',
    page: 'live.html',
    query: { t: EVENTS.T_DONE, view: 'bracket' },
    viewport: 'phone',
  },
  {
    id: 'live-matches',
    feature: 'Public live event',
    label: 'Live and upcoming matches',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE },
    viewport: 'desktop',
  },
  {
    id: 'live-matches-phone',
    feature: 'Public live event',
    label: 'Spectator view on a phone',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE },
    viewport: 'phone',
  },
  {
    id: 'live-whats-next',
    feature: 'What’s next',
    label: 'A player finds their next match',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE, view: 'me' },
    viewport: 'phone',
  },
  {
    id: 'live-whats-next-followed',
    feature: 'What’s next',
    label: 'Their next match, pinned',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE, view: 'me' },
    viewport: 'phone',
    // A real click on the real page — the payoff state is reached the way a
    // spectator reaches it, not by drawing it.
    actions: [{ click: 'button[data-me-pick]:has-text("Maya R.")' }],
  },
  {
    id: 'live-players',
    feature: 'Public live event',
    label: 'Teams and seeds',
    page: 'live.html',
    query: { t: EVENTS.T_DONE, view: 'players' },
    viewport: 'desktop',
  },
  // ---- Foothill Fall Shootout — registration → waiver → pairing ----------
  {
    id: 'reg-form',
    feature: 'Registration',
    label: 'Register — no account needed',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'register' },
    viewport: 'phone',
  },
  {
    id: 'reg-waiver',
    feature: 'Waiver',
    label: 'Sign the waiver as you register',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'register' },
    viewport: 'phone',
    // Fill the real form. The waiver body and signature field are part of it,
    // so this frames the waiver rather than inventing a separate screen.
    actions: [
      { fill: '#rName', text: 'Frankie K.' },
      { fill: '#rEmail', text: 'frankie@example.com' },
      { fill: '#rSkill', text: '3.5' },
      { select: '#rPartnerMode', value: 'needed' },
      { fill: '#rWaiverSig', text: 'Frankie K.' },
      { scrollTo: '#rWaiverSig' },
    ],
  },
  {
    id: 'reg-partner',
    feature: 'Partner pairing',
    label: 'Have a partner, or find one',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'register' },
    viewport: 'phone',
    actions: [
      { fill: '#rName', text: 'Frankie K.' },
      { select: '#rPartnerMode', value: 'complete' },
      { fill: '#rPartnerName', text: 'Cruz T.' },
      { scrollTo: '#rPartnerMode' },
    ],
  },
  {
    id: 'reg-roster',
    feature: 'Registration',
    label: 'Teams, seeds and who still needs a partner',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'players' },
    viewport: 'desktop',
  },
  {
    id: 'reg-event-home',
    feature: 'Registration',
    label: 'Event page with registration open',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING },
    viewport: 'phone',
  },
  {
    id: 'mkt-whats-next',
    feature: 'What’s next',
    label: 'Following the team that is on court',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'me' },
    viewport: 'phone',
    // Follow the team that is actually mid-match, so the payoff is the live
    // score rather than a pending fixture.
    actions: [{ click: 'button[data-me-pick]:has-text("Noah C. / Dakota M.")' }],
  },
  // ---- live scoring, produced by a real scoring session ------------------
  // Court 2 is genuinely mid-match at 7-5. Every point came from
  // record_score_event (match_started, then point_added per rally) — the same
  // RPC the scorekeeper page calls. No score was written to the table directly.
  {
    id: 'score-live-phone',
    feature: 'Live scoring',
    label: 'A match in progress, 7-5',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING },
    viewport: 'phone',
  },
  {
    id: 'score-live-desktop',
    feature: 'Live scoring',
    label: 'Live now, plus what is coming up',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING },
    viewport: 'desktop',
  },
  {
    id: 'score-live-tv',
    feature: 'TV / projector board',
    label: 'Venue board with a live score',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, display: 'tv' },
    viewport: 'desktop',
  },
  {
    id: 'score-bracket',
    feature: 'Tournament bracket',
    label: 'Bracket filling in as matches finish',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'bracket' },
    viewport: 'desktop',
  },
  // ---- the ending, from the same event ----------------------------------
  // Played out through the real scorekeeper UI: SF2 finished 11-7, the final
  // 11-9. The live 7-5 scenes above stay frozen at the genuine mid-match
  // moment — that is the point of recording fixtures rather than re-querying.
  {
    id: 'mkt-results',
    feature: 'Results / champion',
    label: 'Every result, once it is over',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'results' },
    viewport: 'desktop',
  },
  {
    id: 'mkt-bracket-champion',
    feature: 'Results / champion',
    label: 'The completed bracket and its champion',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'bracket' },
    viewport: 'desktop',
  },
  {
    id: 'mkt-results-phone',
    feature: 'Results / champion',
    label: 'Results on a phone',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'results' },
    viewport: 'phone',
  },
  {
    id: 'mkt-tv-final',
    feature: 'TV / projector board',
    label: 'The board once the event is done',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, display: 'tv' },
    viewport: 'desktop',
  },
  {
    id: 'mkt-champion-me',
    feature: 'Results / champion',
    label: 'A player finds out they won it',
    page: 'live.html',
    query: { t: EVENTS.T_MARKETING, view: 'me' },
    viewport: 'phone',
    actions: [{ click: 'button[data-me-pick]:has-text("Maya R. / Emma L.")' }],
  },

  // League standings — reachable by URL only since today's live.html fix
  // (the Standings tab existed but could previously only be tapped).
  {
    id: 'league-standings',
    feature: 'League standings',
    label: 'Season standings, shareable by link',
    page: 'live.html',
    query: { l: '053c7938-9ca9-4bfe-b72a-a17387907571', view: 'standings' },
    viewport: 'desktop',
  },
  {
    id: 'live-tv',
    feature: 'TV / projector board',
    label: 'Venue display mode',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE, display: 'tv' },
    viewport: 'desktop',
  },
];
