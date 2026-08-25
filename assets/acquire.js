/* PickleCue shared acquisition layer.
 *
 * One place decides how a visitor is offered the app, and one place decides
 * what that gets called in analytics. Before this file there were eight
 * different `data-cta` values for the same button — nav_waitlist,
 * nav_early_access, mobile_waitlist, templates_nav_waitlist,
 * event_p4p_nav_waitlist and three more — while the entire /courts tree, the
 * largest organic surface on the site, had no tracking attribute at all.
 *
 * THREE RULES
 *
 * 1. One install affordance at a time. iOS Safari renders the Smart App Banner
 *    from the `apple-itunes-app` meta tag; on that browser the sticky bar stays
 *    down. Other iOS browsers get no banner, so they get the bar. Desktop gets
 *    the QR panel. Android and everything else get nothing, because the app is
 *    iPhone-only and offering a link that cannot install is a dead end.
 *
 * 2. An App Store click is an OUTBOUND CLICK, never an install. We cannot see
 *    the store. `app_store_click` is named for what it measures.
 *
 * 3. No new analytics vendor. This calls the gtag already on the page, through
 *    the existing Consent Mode defaults. If consent is denied, gtag drops the
 *    event and nothing here changes.
 */
(function () {
    'use strict';

    var APP_STORE = 'https://apps.apple.com/us/app/picklecue-pickleball/id6757326631';
    var QR_SVG = '/images/badges/appstore-qr.svg';

    /* ---------------------------------------------------------- analytics */

    window.track = window.track || function (name, params) {
        if (typeof gtag === 'function') gtag('event', name, params || {});
    };

    /* Every tracked element carries its parameters as data-* attributes, so a
       new CTA is markup only and cannot invent a new event name by accident. */
    function paramsFrom(el) {
        var p = { page: location.pathname };
        for (var i = 0; i < el.attributes.length; i++) {
            var a = el.attributes[i];
            if (a.name.indexOf('data-') !== 0 || a.name === 'data-track') continue;
            p[a.name.slice(5).replace(/-/g, '_')] = a.value;
        }
        return p;
    }

    /* One delegated listener for the document. Pages must not add their own —
       two listeners on nested elements is how an event gets counted twice. */
    if (!window.__pcAcquireBound) {
        window.__pcAcquireBound = 1;
        document.addEventListener('click', function (e) {
            var el = e.target.closest && e.target.closest('[data-track]');
            if (!el) return;
            window.track(el.getAttribute('data-track'), paramsFrom(el));
        });
    }

    /* ------------------------------------------------------------ platform */

    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    /* Chrome and Firefox on iOS both put their own token in the UA; Safari does
       not carry either. Smart App Banners are Safari-only. */
    var isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    var coarse = window.matchMedia('(max-width: 860px)').matches;

    /* ---------------------------------------------------------- QR panel */

    var qrDialog = null, qrOpener = null;

    function buildQR() {
        if (qrDialog) return qrDialog;
        qrDialog = document.createElement('div');
        qrDialog.className = 'qr-panel';
        qrDialog.id = 'qrPanel';
        qrDialog.hidden = true;
        qrDialog.setAttribute('role', 'dialog');
        qrDialog.setAttribute('aria-modal', 'true');
        qrDialog.setAttribute('aria-labelledby', 'qrPanelTitle');
        qrDialog.innerHTML =
            '<div class="qr-card" role="document">' +
              '<button class="qr-close" type="button" aria-label="Close">&times;</button>' +
              '<h2 id="qrPanelTitle">Scan to download on iPhone</h2>' +
              '<p>PickleCue is a native iPhone app. Point your camera at the code, or send yourself the link.</p>' +
              '<img class="qr-img" src="' + QR_SVG + '" alt="QR code that opens PickleCue on the App Store" width="296" height="296" decoding="async">' +
              '<div class="qr-actions">' +
                '<button class="btn btn-ghost qr-copy" type="button">Copy link</button>' +
                '<a class="btn btn-ghost" href="' + APP_STORE + '" target="_blank" rel="noopener"' +
                  ' data-track="app_store_click" data-placement="qr" data-audience="desktop">Open the App Store</a>' +
              '</div>' +
              '<p class="qr-note" role="status" aria-live="polite">Free on iPhone, in the United States.</p>' +
            '</div>';
        document.body.appendChild(qrDialog);

        qrDialog.querySelector('.qr-close').addEventListener('click', closeQR);
        qrDialog.addEventListener('click', function (e) { if (e.target === qrDialog) closeQR(); });
        qrDialog.querySelector('.qr-copy').addEventListener('click', function () {
            var note = qrDialog.querySelector('.qr-note');
            var done = function (ok) {
                note.textContent = ok ? 'Link copied. Paste it to yourself.' : APP_STORE;
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(APP_STORE).then(function () { done(true); }, function () { done(false); });
            } else { done(false); }
            window.track('qr_copy_link', { page: location.pathname });
        });
        return qrDialog;
    }

    /* Focus must not escape a modal, and must come back to the control that
       opened it. Tab cycling is explicit because the panel is injected. */
    function trapTab(e) {
        if (e.key !== 'Tab' || !qrDialog || qrDialog.hidden) return;
        var f = qrDialog.querySelectorAll('button, a[href]');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function openQR(opener) {
        var d = buildQR();
        qrOpener = opener || null;
        d.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        requestAnimationFrame(function () { d.classList.add('is-open'); });
        d.querySelector('.qr-close').focus();
        window.track('qr_open', { page: location.pathname });
    }

    function closeQR() {
        if (!qrDialog || qrDialog.hidden) return;
        qrDialog.classList.remove('is-open');
        document.documentElement.style.overflow = '';
        qrDialog.hidden = true;
        var note = qrDialog.querySelector('.qr-note');
        if (note) note.textContent = 'Free on iPhone, in the United States.';
        if (qrOpener) { qrOpener.focus(); qrOpener = null; }
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeQR();
        trapTab(e);
    });

    document.querySelectorAll('[data-qr-open]').forEach(function (btn) {
        btn.addEventListener('click', function (e) { e.preventDefault(); openQR(btn); });
    });

    /* On a desktop pointer, an App Store badge cannot install anything. Turn it
       into the QR panel instead of sending the visitor to a page they will read
       on the wrong device. The href stays intact for middle-click, for
       keyboard users who prefer it, and for when JS is absent. */
    if (!isIOS && !coarse) {
        document.querySelectorAll('a[href*="apps.apple.com"]').forEach(function (a) {
            if (a.closest('.qr-panel')) return;
            a.addEventListener('click', function (e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                /* The delegated tracker sits on document. Without this it would
                   record an app_store_click for a visit that never happened,
                   because the navigation was just cancelled. The click becomes
                   qr_open and nothing else; app_store_click fires later, from
                   inside the panel, if the visitor actually goes. */
                e.stopPropagation();
                openQR(a);
            });
        });
    }

    /* ------------------------------------------------- sticky install bar */

    var STICKY_KEY = 'pc_install_bar_dismissed';
    function dismissed() {
        try { return sessionStorage.getItem(STICKY_KEY) === '1'; } catch (_) { return false; }
    }

    function mountSticky() {
        /* Never on a page that already owns a sticky control — the event page
           has its own, and two fixed bars stack on top of each other. */
        if (document.querySelector('.sticky-cta')) return;
        if (document.body.hasAttribute('data-no-install-bar')) return;
        if (!isIOS || isIOSSafari || dismissed()) return;

        var bar = document.createElement('div');
        bar.className = 'install-bar';
        bar.hidden = true;
        bar.innerHTML =
            '<a class="install-bar-cta" href="' + APP_STORE + '"' +
              ' data-track="app_store_click" data-placement="sticky"' +
              ' data-audience="' + (document.body.getAttribute('data-audience') || 'general') + '">' +
              '<img src="/images/app-icon-120.png" alt="" width="34" height="34" decoding="async">' +
              '<span><b>PickleCue</b><i>Free on iPhone</i></span>' +
              '<em>Get</em></a>' +
            '<button class="install-bar-close" type="button" aria-label="Dismiss">&times;</button>';
        document.body.appendChild(bar);

        bar.querySelector('.install-bar-close').addEventListener('click', function () {
            bar.hidden = true;
            try { sessionStorage.setItem(STICKY_KEY, '1'); } catch (_) {}
            window.track('install_bar_dismiss', { page: location.pathname });
        });

        /* Not on load. It appears once the visitor has actually read something —
           one and a half screens — so it reads as an offer, not an interruption. */
        var shown = false;
        var onScroll = function () {
            if (shown || dismissed()) return;
            if (window.scrollY < window.innerHeight * 1.5) return;
            shown = true;
            bar.hidden = false;
            requestAnimationFrame(function () { bar.classList.add('is-in'); });
            window.track('install_bar_shown', { page: location.pathname });
            window.removeEventListener('scroll', onScroll);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountSticky);
    } else {
        mountSticky();
    }
})();
