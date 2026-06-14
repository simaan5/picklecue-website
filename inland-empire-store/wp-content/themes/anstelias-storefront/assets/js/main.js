/* Anstelias Storefront — minimal progressive-enhancement JS (no dependencies). */
(function () {
	'use strict';

	document.addEventListener('DOMContentLoaded', function () {
		// Mobile nav toggle.
		var toggle = document.querySelector('.ie-nav-toggle');
		var menu = document.querySelector('.ie-nav__menu');
		if (toggle && menu) {
			toggle.addEventListener('click', function () {
				var open = menu.classList.toggle('is-open');
				toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
			});
		}

		// Keep the search box focusable from a "/" keyboard shortcut.
		document.addEventListener('keydown', function (e) {
			if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
				var field = document.getElementById('ie-search-field');
				if (field) { e.preventDefault(); field.focus(); }
			}
		});
	});
})();
