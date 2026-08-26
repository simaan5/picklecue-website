/* Court search — static index, fetched on intent, never on page load.
 *
 * The Courts tree is the site's largest organic surface and its speed is the
 * reason it works. So:
 *
 *   - The index is a generated static file, built by tools/courtgen from the
 *     same rows that produced the pages. A result cannot point at a URL that
 *     does not exist.
 *   - It is NOT requested during page load. The first focus or keystroke in the
 *     search field triggers the fetch; everything after that is in memory.
 *   - No backend, no authenticated RPC, no SPA. Every result is a real static
 *     page and a plain <a href>, so it works with a middle-click, a copied link
 *     and a crawler.
 *
 * If the fetch fails the field says so and points at the state directory, which
 * is on the same page and needs no JavaScript at all.
 */
(function () {
    'use strict';

    var form   = document.getElementById('courtSearch');
    if (!form) return;
    var input  = document.getElementById('courtSearchInput');
    var panel  = document.getElementById('courtSearchResults');
    var status = document.getElementById('courtSearchStatus');
    var INDEX_URL = '/assets/courts-search-index.json?v=20260825a';
    var MAX = 10;

    var data = null, loading = null, cursor = -1, rows = [];

    /* -------------------------------------------------------------- index */

    function load() {
        if (data) return Promise.resolve(data);
        if (loading) return loading;
        say('Loading court list…');
        loading = fetch(INDEX_URL, { credentials: 'omit' })
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function (j) {
                data = flatten(j);
                say('');
                return data;
            })
            .catch(function () {
                loading = null;
                panel.innerHTML = '<p class="cs-msg">Court search could not load. ' +
                    '<a href="#browse">Browse by state</a> instead — it is on this page and needs no search.</p>';
                open();
                say('Court search could not load. Browse by state instead.');
                throw new Error('index');
            });
        return loading;
    }

    /* One flat array of searchable entries. Paths are rebuilt here rather than
       stored, which is what keeps the file small: the state and city slugs
       appear once each instead of once per court. */
    function flatten(j) {
        var out = [];
        var st = j.st, ci = j.ci, co = j.co;
        st.forEach(function (s, i) {
            out.push({ t: 0, label: s[0], sub: s[2].toLocaleString() + ' court locations · ' + s[3] + ' cities',
                       href: '/courts/us/' + s[1], n: s[2], key: norm(s[0]) });
        });
        ci.forEach(function (c) {
            var s = st[c[0]];
            out.push({ t: 1, label: c[1], sub: s[0] + ' · ' + c[3] + ' court location' + (c[3] === 1 ? '' : 's'),
                       href: '/courts/us/' + s[1] + '/' + c[2], n: c[3], key: norm(c[1] + ' ' + s[0]) });
        });
        co.forEach(function (k) {
            var c = ci[k[0]], s = st[c[0]];
            var bits = [];
            if (k[3]) bits.push(k[3] + ' court' + (k[3] === 1 ? '' : 's'));
            bits.push(k[4] ? 'Free to play' : 'Club or paid');
            out.push({ t: 2, label: k[1], sub: c[1] + ', ' + s[0] + ' · ' + bits.join(' · '),
                       href: '/courts/us/' + s[1] + '/' + c[2] + '/' + k[2], n: k[3], key: norm(k[1] + ' ' + c[1]) });
        });
        return out;
    }

    function norm(s) {
        return String(s).toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /* ------------------------------------------------------------ ranking */
    /* Exact beats prefix beats word-start beats "appears somewhere". States and
       cities outrank individual courts on an equal match, because those are the
       indexable pages and "austin" almost always means the city. Nothing here
       consults popularity or a verified flag — there is no popularity signal in
       the data, and `verified` marks the import source, not a checked place. */
    function score(e, q) {
        var k = e.key, i = k.indexOf(q);
        if (i === -1) return 0;
        var s;
        if (k === q) s = 1000;
        else if (i === 0) s = 800;
        else if (k[i - 1] === ' ') s = 600;
        else s = 300;
        s += [120, 100, 0][e.t];
        s += Math.min(e.n, 60) / 10;          // a nudge, never a reordering
        return s;
    }

    function search(q) {
        var nq = norm(q);
        if (!nq || !data) return [];
        var hits = [];
        for (var i = 0; i < data.length; i++) {
            var s = score(data[i], nq);
            if (s) hits.push([s, data[i]]);
        }
        hits.sort(function (a, b) { return b[0] - a[0] || a[1].label.length - b[1].label.length; });
        return hits.slice(0, MAX).map(function (h) { return h[1]; });
    }

    /* ------------------------------------------------------------- render */

    var TYPE = ['State', 'City', 'Court'];

    function render(list, q) {
        rows = list; cursor = -1;
        if (!q.trim()) { close(); return; }
        if (!list.length) {
            panel.innerHTML =
                '<p class="cs-msg"><b>Nothing matches &ldquo;' + esc(q) + '&rdquo;.</b></p>' +
                '<p class="cs-msg cs-msg-sub">We publish court locations for cities with five or more. ' +
                'Try the city or the state instead, or <a href="#browse">browse by state</a>. ' +
                'Court missing? You can add it from inside PickleCue.</p>';
            open();
            say('No matches for ' + q);
            return;
        }
        panel.innerHTML = '<ul class="cs-list" role="listbox" aria-label="Court search results">' +
            list.map(function (e, i) {
                return '<li role="option" aria-selected="false" id="cs-opt-' + i + '">' +
                       '<a href="' + e.href + '" data-track="court_search_result" ' +
                       'data-kind="' + TYPE[e.t].toLowerCase() + '" data-audience="courts">' +
                       '<span class="cs-kind">' + TYPE[e.t] + '</span>' +
                       '<span class="cs-label">' + esc(e.label) + '</span>' +
                       '<span class="cs-sub">' + esc(e.sub) + '</span></a></li>';
            }).join('') + '</ul>';
        open();
        say(list.length + (list.length === MAX ? ' or more' : '') + ' result' + (list.length === 1 ? '' : 's') +
            '. Use the down arrow to review them.');
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    /* The live region is deliberately terse and only speaks on a settled query.
       Announcing on every keystroke turns a search box into a metronome. */
    var sayTimer;
    function say(msg) {
        clearTimeout(sayTimer);
        sayTimer = setTimeout(function () { status.textContent = msg; }, 250);
    }

    function open()  { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    function close() {
        panel.hidden = true; panel.innerHTML = '';
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        cursor = -1;
    }

    function move(d) {
        var items = panel.querySelectorAll('li');
        if (!items.length) return;
        if (cursor > -1) items[cursor].setAttribute('aria-selected', 'false');
        /* Cycle through -1 (the input itself) then 0..n-1 and back. Shift by +1
           so the input is slot 0, take a positive modulo over n+1 slots, shift
           back. The first version added items.length + 1 for positivity, which
           is a whole period and cancels — so the very first ArrowDown landed on
           -1 again and the list never opened to the keyboard. */
        var slots = items.length + 1;
        cursor = ((cursor + 1 + d) % slots + slots) % slots - 1;
        if (cursor < 0) { input.removeAttribute('aria-activedescendant'); return; }
        var li = items[cursor];
        li.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
    }

    /* --------------------------------------------------------------- wire */

    var debounce;
    function run() {
        clearTimeout(debounce);
        var q = input.value;
        if (!q.trim()) { close(); return; }
        debounce = setTimeout(function () {
            load().then(function () { render(search(q), q); }, function () {});
        }, 90);
    }

    /* Focus is intent. Warm the index then, so the first keystroke has it. */
    input.addEventListener('focus', function () { load().catch(function () {}); }, { once: true });
    input.addEventListener('input', run);

    input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) run(); else move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Escape') {
            if (panel.hidden) { input.value = ''; }
            else { close(); }
        } else if (e.key === 'Enter') {
            var items = panel.querySelectorAll('li a');
            if (cursor > -1 && items[cursor]) { e.preventDefault(); items[cursor].click(); }
        }
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var first = panel.querySelector('li a');
        if (first) first.click();
    });

    document.addEventListener('click', function (e) {
        if (!form.contains(e.target) && !panel.contains(e.target)) close();
    });
})();
