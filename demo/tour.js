/* Guided tour for the PickleCue live demo.
 *
 * The demo already contained everything a visitor needs. What it did not have
 * was an order. Dropping someone into a five-tab simulation and hoping they
 * find the interesting parts is how the strongest asset on the site converts
 * worst.
 *
 * DESIGN RULES
 *
 * 1. The tour drives the REAL demo. Every step calls the same showTab /
 *    openGameDetail / competeSeg functions a click would, so a step can never
 *    show a state the demo cannot reach on its own.
 * 2. Optional, and escapable at every point. "Explore freely" on the landing
 *    state, "Skip tour" in the panel, Escape from the keyboard.
 * 3. Five steps, because the demo has five things to show. There is no live
 *    scoring screen in the simulation, so there is no scoring step — the tour
 *    points at /live-scores for that instead of miming a screen that does not
 *    exist here.
 */
(function () {
    'use strict';

    var STEPS = [
        {
            id: 'courts',
            title: 'Know before you go.',
            copy: 'Search by city or court name and see what you are driving to — how many courts, whether it is free, what is nearby.',
            enter: function () { window.showTab('courts'); }
        },
        {
            id: 'play',
            title: 'Find the right game.',
            copy: 'Every open game shows the level, the format, the venue and exactly how many spots are left. No group chat archaeology.',
            enter: function () { window.showTab('play'); }
        },
        {
            id: 'join',
            title: 'Claim your spot.',
            copy: 'Open a game to see who is already in before you commit. One tap to join, or take a waitlist place if it is full.',
            enter: function () { window.showTab('play'); window.openGameDetail(1); }
        },
        {
            id: 'compete',
            title: 'Leagues and brackets that keep themselves current.',
            copy: 'Standings move when a match is logged. Brackets advance the winner. Nobody rebuilds a spreadsheet on Sunday night.',
            enter: function () { window.closeGameDetail && window.closeGameDetail(); window.showTab('compete'); }
        },
        {
            id: 'profile',
            title: 'Every match you play is saved.',
            copy: 'Record, win rate, current streak and recent form. Your season, without you keeping notes.',
            enter: function () { window.closeGameDetail && window.closeGameDetail(); window.showTab('profile'); }
        }
    ];

    var intro  = document.getElementById('tourIntro');
    var panel  = document.getElementById('tourPanel');
    var done   = document.getElementById('tourDone');
    if (!intro || !panel || !done) return;

    var elStepNo = document.getElementById('tourStepNo');
    var elTitle  = document.getElementById('tourTitle');
    var elCopy   = document.getElementById('tourCopy');
    var elDots   = document.getElementById('tourDots');
    var btnBack  = document.getElementById('tourBack');
    var btnNext  = document.getElementById('tourNext');

    var i = -1;                       // -1 = not in the tour

    /* Resolve window.track at CALL time, not load time. tour.js is a classic
       script at the end of <body>, so it executes before the deferred
       acquire.js that defines window.track. Capturing it here would bind the
       no-op fallback forever and silently drop every demo event. */
    function track(name, params) {
        if (typeof window.track === 'function') window.track(name, params);
        else if (typeof gtag === 'function') gtag('event', name, params || {});
    }

    for (var d = 0; d < STEPS.length; d++) {
        var li = document.createElement('li');
        elDots.appendChild(li);
    }
    var dots = elDots.querySelectorAll('li');

    function setStep(n) {
        i = n;
        var s = STEPS[n];
        s.enter();
        elStepNo.textContent = 'Step ' + (n + 1) + ' of ' + STEPS.length;
        elTitle.textContent = s.title;
        elCopy.textContent = s.copy;
        for (var k = 0; k < dots.length; k++) {
            dots[k].className = k < n ? 'is-done' : (k === n ? 'is-now' : '');
        }
        btnBack.disabled = n === 0;
        btnNext.textContent = n === STEPS.length - 1 ? 'Finish' : 'Next';
        track('demo_step', { step: n + 1, id: s.id, page: location.pathname });
    }

    function startTour(source) {
        intro.hidden = true;
        done.hidden = true;
        panel.hidden = false;
        document.body.classList.add('tour-on');
        /* Before setStep, so the funnel reads start -> step 1 -> step 2. */
        track('demo_start', { source: source, page: location.pathname });
        setStep(0);
        /* Focus the heading, not the button: a screen reader user should hear
           what the step is before being told there is a Next. */
        elTitle.focus();
    }

    function exitTour(reason) {
        var at = i;
        i = -1;
        panel.hidden = true;
        done.hidden = true;
        intro.hidden = true;
        document.body.classList.remove('tour-on');
        if (reason === 'skip') track('demo_skip', { step: at + 1, page: location.pathname });
    }

    function finishTour() {
        panel.hidden = true;
        done.hidden = false;
        i = -1;
        done.querySelector('h2').setAttribute('tabindex', '-1');
        done.querySelector('h2').focus();
        track('demo_complete', { page: location.pathname });
    }

    document.getElementById('tourStart').addEventListener('click', function () { startTour('intro'); });
    document.getElementById('tourFree').addEventListener('click', function () {
        exitTour('free');
        track('demo_explore_free', { page: location.pathname });
    });
    document.getElementById('tourSkip').addEventListener('click', function () { exitTour('skip'); });
    document.getElementById('tourReplay').addEventListener('click', function () { startTour('replay'); });
    document.getElementById('tourExplore').addEventListener('click', function () { exitTour('free'); });

    btnNext.addEventListener('click', function () {
        if (i < STEPS.length - 1) { setStep(i + 1); } else { finishTour(); }
    });
    btnBack.addEventListener('click', function () { if (i > 0) setStep(i - 1); });

    document.addEventListener('keydown', function (e) {
        if (!intro.hidden && e.key === 'Escape') { exitTour('free'); return; }
        if (i < 0) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); if (i < STEPS.length - 1) setStep(i + 1); else finishTour(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) setStep(i - 1); }
        else if (e.key === 'Escape') { e.preventDefault(); exitTour('skip'); }
    });

    /* Touching the phone during a step is not a mistake — it is the point.
       The tour stays where it is and lets the visitor poke around. */
})();
