/* PickleCue cookie consent — GDPR/ePrivacy banner + Google Consent Mode v2.
 *
 * Behavior:
 *  - Consent defaults are set REGION-SCOPED in the inline head snippet before
 *    gtag.js loads: EEA/UK/CH default to denied, everywhere else granted.
 *  - This script decides whether the visitor likely needs a banner (European
 *    timezone heuristic — the region-scoped default is the real enforcement;
 *    the banner is the UI for granting/withdrawing).
 *  - Choice persists in localStorage; "Cookie preferences" (footer link or
 *    #cookie-preferences href) reopens the banner so consent can be withdrawn.
 */
(function () {
  var KEY = 'pc_consent_v1';

  function gtagSafe() { if (typeof gtag === 'function') { gtag.apply(null, arguments); } }

  function applyChoice(granted) {
    gtagSafe('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }

  function isLikelyEuropean() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return tz.indexOf('Europe/') === 0;
    } catch (e) { return false; }
  }

  var css = [
    '.pc-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:420px;margin-left:auto;',
    'background:#101613;color:#f2f5f3;border:1px solid rgba(255,255,255,.14);border-radius:14px;',
    'padding:18px 18px 14px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'box-shadow:0 12px 40px rgba(0,0,0,.45)}',
    '.pc-consent h3{margin:0 0 6px;font-size:15px}',
    '.pc-consent p{margin:0 0 12px;color:#b9c6be;font-size:13px}',
    '.pc-consent a{color:#4cd992}',
    '.pc-consent-row{display:flex;gap:8px}',
    '.pc-consent button{flex:1;padding:10px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.18);',
    'font-size:14px;font-weight:600;cursor:pointer;background:transparent;color:#f2f5f3}',
    '.pc-consent button.pc-accept{background:#00c27a;border-color:#00c27a;color:#06120c}',
    '@media (prefers-color-scheme: light){.pc-consent{background:#fff;color:#15211a;border-color:rgba(0,0,0,.12)}',
    '.pc-consent p{color:#4c5b52}.pc-consent button{color:#15211a;border-color:rgba(0,0,0,.2)}',
    '.pc-consent button.pc-accept{color:#fff}}'
  ].join('');

  function showBanner() {
    if (document.getElementById('pc-consent')) { return; }
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'pc-consent';
    el.className = 'pc-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML =
      '<h3>Cookies &amp; analytics</h3>' +
      '<p>We use Google Analytics cookies to understand site traffic. ' +
      'No advertising, no selling data. Details in our ' +
      '<a href="/privacy#analytics">privacy policy</a>.</p>' +
      '<div class="pc-consent-row">' +
      '<button type="button" class="pc-decline">Decline</button>' +
      '<button type="button" class="pc-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(el);

    el.querySelector('.pc-accept').addEventListener('click', function () {
      store('granted'); applyChoice(true); el.remove();
    });
    el.querySelector('.pc-decline').addEventListener('click', function () {
      store('denied'); applyChoice(false); el.remove();
    });
  }

  function init() {
    var choice = stored();
    if (choice === 'granted') { applyChoice(true); }
    else if (choice === 'denied') { applyChoice(false); }
    else if (isLikelyEuropean() || /[?&]consent=show\b/.test(location.search)) { showBanner(); }

    // "Cookie preferences" links reopen the banner (consent withdrawal).
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href="#cookie-preferences"]');
      if (a) { e.preventDefault(); try { localStorage.removeItem(KEY); } catch (err) {} showBanner(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
