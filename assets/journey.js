/* Homepage connected journey — desktop sticky stage.
 *
 * PURELY ADDITIVE. The five chapters each carry their own image in the flow.
 * That stacked layout is the base state and it is complete: mobile gets it, a
 * browser with JS off gets it, and a failed script gets it. Nothing here is
 * required to understand the page.
 *
 * On a wide screen this adds .has-stage, which switches to two columns and
 * shows ONE sticky product stage beside the scrolling text. Native scrolling
 * throughout — no pinning, no wheel handlers, no scroll hijacking. The reader
 * keeps control of the page at every point.
 */
(function () {
    'use strict';

    var section = document.querySelector('.journey');
    if (!section) return;

    var wide = window.matchMedia('(min-width: 1080px)');
    var chapters = [].slice.call(section.querySelectorAll('.chapter'));
    if (chapters.length < 2) return;

    var stage = null, frames = [], io = null, active = -1;

    function build() {
        if (stage) return;
        stage = document.createElement('div');
        stage.className = 'journey-stage';
        /* The stage duplicates images already described by the chapters it
           mirrors, so it is decorative to assistive tech. Hiding it avoids
           reading every alt text twice. */
        stage.setAttribute('aria-hidden', 'true');
        var phone = document.createElement('div');
        phone.className = 'journey-phone';
        /* Not every chapter has a screenshot. Chapter 02 describes the fields
           an open game states, in web type, because every game-discovery
           capture currently carries an absolute date that goes stale (iOS plan
           092). A chapter with no shot pushes null and simply holds whatever
           the stage is already showing — it must not throw, and it must not
           blank the phone. */
        chapters.forEach(function (ch, n) {
            var src = ch.querySelector('.chapter-shot img');
            if (!src) { frames.push(null); return; }
            var img = new Image();
            img.src = src.getAttribute('src');
            img.alt = '';
            img.width = 760; img.height = 1651;
            img.decoding = 'async';
            if (frames.some(Boolean)) img.loading = 'lazy'; else img.className = 'is-on';
            phone.appendChild(img);
            frames.push(img);
        });
        stage.appendChild(phone);
        section.querySelector('.journey-grid').appendChild(stage);
    }

    function show(n) {
        if (n === active) return;
        active = n;
        /* The active chapter is always marked, even when it has no frame —
           the copy still needs to come forward. Only the image is skipped. */
        chapters.forEach(function (c, k) { c.classList.toggle('is-active', k === n); });
        if (!frames[n]) return;
        frames.forEach(function (f, k) { if (f) f.classList.toggle('is-on', k === n); });
    }

    function attach() {
        build();
        section.classList.add('has-stage');
        /* A band across the middle of the viewport: the chapter the reader is
           actually looking at, not the one that happens to be topmost. */
        io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) show(chapters.indexOf(en.target));
            });
        }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
        chapters.forEach(function (c) { io.observe(c); });
        show(0);
    }

    function detach() {
        section.classList.remove('has-stage');
        if (io) { io.disconnect(); io = null; }
        chapters.forEach(function (c) { c.classList.remove('is-active'); });
        active = -1;
    }

    function sync() { wide.matches ? attach() : detach(); }

    sync();
    if (wide.addEventListener) wide.addEventListener('change', sync);
    else if (wide.addListener) wide.addListener(sync);
})();
