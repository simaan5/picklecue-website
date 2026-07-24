/* PickleCue shared site shell: theme toggle, mobile menu, legal TOC.
   Loaded with `defer` on every marketing/legal page. */
(function () {
    'use strict';

    var root = document.documentElement;

    /* ---- Theme toggle ---- */
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        var current = function () {
            var explicit = root.getAttribute('data-theme');
            if (explicit === 'light' || explicit === 'dark') return explicit;
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        };
        themeBtn.addEventListener('click', function () {
            var next = current() === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('pc_theme', next); } catch (_) {}
            if (typeof window.track === 'function') window.track('theme_change', { to: next });
        });
    }

    /* ---- Mobile menu (accessible overlay) ---- */
    var burger = document.querySelector('.masthead-burger');
    var menu = document.getElementById('siteMenu');
    if (burger && menu) {
        var closeBtn = menu.querySelector('.site-menu-close');
        var lastFocus = null;
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        var focusables = function () {
            return Array.prototype.filter.call(
                menu.querySelectorAll('a[href], button:not([disabled])'),
                function (el) { return el.offsetParent !== null || el === document.activeElement; }
            );
        };

        var openMenu = function () {
            lastFocus = document.activeElement;
            menu.hidden = false;
            /* double rAF so the transition runs from the hidden state */
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { menu.classList.add('is-open'); });
            });
            burger.setAttribute('aria-expanded', 'true');
            root.style.overflow = 'hidden';   /* scroll lock; no scrollbar at mobile widths, so no layout jump */
            (closeBtn || menu).focus();
        };

        var closeMenu = function (restoreFocus) {
            burger.setAttribute('aria-expanded', 'false');
            root.style.overflow = '';
            menu.classList.remove('is-open');
            var finish = function () { menu.hidden = true; };
            if (reduceMotion.matches) { finish(); }
            else {
                var done = false;
                menu.addEventListener('transitionend', function h() {
                    if (done) return; done = true;
                    menu.removeEventListener('transitionend', h);
                    finish();
                });
                /* safety: hide even if transitionend never fires */
                setTimeout(function () { if (!done) { done = true; finish(); } }, 350);
            }
            if (restoreFocus !== false && lastFocus && lastFocus.focus) lastFocus.focus();
        };

        burger.addEventListener('click', function () {
            if (menu.hidden) openMenu(); else closeMenu();
        });
        if (closeBtn) closeBtn.addEventListener('click', function () { closeMenu(); });

        /* close when a navigation choice is made */
        menu.addEventListener('click', function (e) {
            var link = e.target.closest && e.target.closest('a[href]');
            if (link) closeMenu(false);
        });

        document.addEventListener('keydown', function (e) {
            if (menu.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
            if (e.key !== 'Tab') return;
            var els = focusables();
            if (!els.length) return;
            var first = els[0], last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        /* leaving mobile widths: make sure the menu and scroll lock reset */
        var mq = window.matchMedia('(min-width: 861px)');
        var onWide = function (ev) { if (ev.matches && !menu.hidden) closeMenu(false); };
        if (mq.addEventListener) mq.addEventListener('change', onWide);
        else if (mq.addListener) mq.addListener(onWide);
    }

    /* ---- Legal TOC ("On this page") ----
       Ships as <details open> for no-JS; below 961px it starts collapsed
       and closes again after a section is chosen. */
    var toc = document.querySelector('details.article-toc');
    if (toc) {
        var tocMq = window.matchMedia('(max-width: 960px)');
        var syncToc = function () { toc.open = !tocMq.matches; };
        syncToc();
        if (tocMq.addEventListener) tocMq.addEventListener('change', syncToc);
        else if (tocMq.addListener) tocMq.addListener(syncToc);
        toc.addEventListener('click', function (e) {
            if (tocMq.matches && e.target.closest && e.target.closest('a[href]')) toc.open = false;
        });
    }
})();
