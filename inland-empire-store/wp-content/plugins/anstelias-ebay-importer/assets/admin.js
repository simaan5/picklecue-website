/* Anstelias eBay Importer — admin interactions. */
(function () {
	'use strict';
	document.addEventListener('DOMContentLoaded', function () {

		// Select-all in the review queue.
		var checkAll = document.getElementById('anstelias-check-all');
		if (checkAll) {
			checkAll.addEventListener('change', function () {
				document.querySelectorAll('input[name="ids[]"]').forEach(function (cb) {
					cb.checked = checkAll.checked;
				});
			});
		}

		// Show category select / delete confirm only for relevant bulk actions.
		var bulk = document.querySelector('select[name="bulk_action"]');
		if (bulk) {
			var catSel = document.querySelector('.anstelias-cat-select');
			var confirmDel = document.querySelector('.anstelias-confirm-delete');
			bulk.addEventListener('change', function () {
				if (catSel) { catSel.style.display = bulk.value === 'change_category' ? '' : 'none'; }
				if (confirmDel) { confirmDel.style.display = bulk.value === 'delete' ? '' : 'none'; }
			});
		}

		// Add-row on category mapping page.
		var addRow = document.getElementById('catmap-add-row');
		if (addRow) {
			addRow.addEventListener('click', function () {
				var tbody = document.querySelector('#catmap-table tbody');
				var last = tbody.querySelector('tr:last-child');
				var clone = last.cloneNode(true);
				clone.querySelectorAll('input').forEach(function (i) { i.value = ''; });
				clone.querySelectorAll('select').forEach(function (s) { s.selectedIndex = 0; });
				tbody.appendChild(clone);
			});
		}

		// Guard destructive bulk delete.
		var form = document.getElementById('anstelias-review-form');
		if (form) {
			form.addEventListener('submit', function (e) {
				var action = form.querySelector('select[name="bulk_action"]').value;
				if (action === 'delete' && !confirm('Permanently delete the selected DRAFT products? This cannot be undone.')) {
					e.preventDefault();
				}
			});
		}
	});
})();
