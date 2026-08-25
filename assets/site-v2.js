/* PickleCue V2 shared shell: theme toggle, sticky masthead, mobile menu,
   scroll reveal (enhancement only), screenshot lightbox, waitlist. */
(function () {
    'use strict';

    /* Tells the inline watchdog in each page that the shell arrived, so it
       does not strip the 'js' class and disable the reveal animation. */
    window.__pcShell = 1;

    window.track = window.track || function (name, params) {
        if (typeof gtag === 'function') gtag('event', name, params || {});
    };
    document.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest('[data-track]');
        if (el) window.track(el.getAttribute('data-track'), { cta: el.getAttribute('data-cta') });
    });

    /* Reveal: enhancement only, with failsafe so content can never stay hidden */
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('in'); }); }, 2200);

    /* Masthead: transparent at top, blurred once scrolled */
    var masthead = document.querySelector('.masthead');
    if (masthead && 'IntersectionObserver' in window) {
        var sentinel = document.createElement('div');
        sentinel.style.cssText = 'position:absolute;top:0;height:60px;width:1px;pointer-events:none;';
        document.body.prepend(sentinel);
        new IntersectionObserver(function (entries) {
            masthead.classList.toggle('scrolled', !entries[0].isIntersecting);
        }).observe(sentinel);
    } else if (masthead) {
        masthead.classList.add('scrolled');
    }

    /* Theme toggle */
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            var next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            document.documentElement.style.colorScheme = next;
            try { localStorage.setItem('pc_theme', next); } catch (_) {}
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', next === 'dark' ? '#071A12' : '#F7F7F2');
            window.track('theme_change', { to: next });
        });
    }

    /* Mobile menu */
    var burger = document.querySelector('.masthead-burger');
    var menu = document.getElementById('siteMenu');
    if (burger && menu) {
        var closeBtn = menu.querySelector('.site-menu-close');
        var open = function () {
            menu.hidden = false;
            requestAnimationFrame(function () { requestAnimationFrame(function () { menu.classList.add('is-open'); }); });
            burger.setAttribute('aria-expanded', 'true');
            document.documentElement.style.overflow = 'hidden';
        };
        var close = function () {
            burger.setAttribute('aria-expanded', 'false');
            document.documentElement.style.overflow = '';
            menu.classList.remove('is-open');
            setTimeout(function () { menu.hidden = true; }, 300);
        };
        burger.addEventListener('click', function () { if (menu.hidden) { open(); } else { close(); } });
        if (closeBtn) closeBtn.addEventListener('click', close);
        menu.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('a[href]')) close();
        });
        document.addEventListener('keydown', function (e) { if (!menu.hidden && e.key === 'Escape') close(); });
    }

    /* Screenshot lightbox */
    var lb = document.getElementById('lightbox');
    if (lb) {
        var lbImg = lb.querySelector('img');
        var last = null;
        var openLb = function (src, alt) {
            lbImg.src = src; lbImg.alt = alt || 'App screenshot';
            lb.hidden = false; document.documentElement.style.overflow = 'hidden';
        };
        var closeLb = function () {
            lb.hidden = true; lbImg.src = ''; document.documentElement.style.overflow = '';
            if (last) last.focus();
        };
        document.querySelectorAll('[data-full]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                last = btn;
                var img = btn.querySelector('img');
                openLb(btn.getAttribute('data-full'), img ? img.alt : '');
                window.track('screenshot_zoom', { shot: btn.getAttribute('data-full') });
            });
        });
        lb.addEventListener('click', function (e) {
            if (e.target === lb || e.target.classList.contains('lightbox-close') || e.target === lbImg) closeLb();
        });
        document.addEventListener('keydown', function (e) { if (!lb.hidden && e.key === 'Escape') closeLb(); });
    }

    /* Waitlist */
    var SUPABASE_URL = 'https://uejmhtdfbqbotvbqvfja.supabase.co';
    var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAsImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc';
    document.querySelectorAll('form[data-waitlist]').forEach(function (form) {
        var msg = document.getElementById(form.getAttribute('data-msg'));
        if (!msg) return;
        var base = msg.className;
        var setMsg = function (text, kind) {
            msg.textContent = text;
            msg.className = base.replace(/ (success|error)/g, '') + (kind ? ' ' + kind : '');
        };
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = (form.email.value || '').trim();
            if (form.company && form.company.value) return;
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg('Enter a valid email address.', 'error'); return; }
            var btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            setMsg('Adding you...', '');
            fetch(SUPABASE_URL + '/rest/v1/waitlist_signups', {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON,
                    'Authorization': 'Bearer ' + SUPABASE_ANON,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ email: email, source: 'website-intl' })
            }).then(function (r) {
                if (r.ok || r.status === 409) {
                    window.track('waitlist_success', { existing: r.status === 409 });
                    setMsg(r.status === 409
                        ? 'You are already on the list. We will email you the day PickleCue reaches your country.'
                        : 'You are on the list. We will email you the day PickleCue reaches your country.', 'success');
                    form.reset();
                } else {
                    window.track('waitlist_error', { status: r.status });
                    setMsg('Something went wrong. Email support@picklecue.com and we will add you.', 'error');
                }
            }).catch(function () {
                setMsg('Network error. Email support@picklecue.com and we will add you.', 'error');
            }).finally(function () { btn.disabled = false; });
        });
    });
})();
