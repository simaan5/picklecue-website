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
};

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
  {
    id: 'live-tv',
    feature: 'TV / projector board',
    label: 'Venue display mode',
    page: 'live.html',
    query: { t: EVENTS.T_LIVE, display: 'tv' },
    viewport: 'desktop',
  },
];
