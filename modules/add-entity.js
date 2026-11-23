window.prepareAddEntityScreen = function() {
  var titleEl = document.getElementById('entityManagementModalTitle');
  if (titleEl) titleEl.textContent = 'Add Entity';
  var deleteBtn = document.getElementById('deleteEntityBtn');
  if (deleteBtn) { deleteBtn.classList.add('u-hidden'); window.setDisplay(deleteBtn, 'none'); }
  ['entityName','entityPhone','entityWallet','entityOpeningAmount','entityLedgerPage'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var ot = document.getElementById('entityOpeningType'); if (ot) ot.value = 'credit';
  var hc = document.getElementById('entity-edit-history-card'); if (hc) hc.classList.add('d-none');
  if (typeof window.resetEntityEditBaseline === 'function') window.resetEntityEditBaseline();
};
