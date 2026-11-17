window.prepareAddEntityScreen = function() {
  var titleEl = document.getElementById('entityManagementModalTitle');
  if (titleEl) titleEl.textContent = 'Add Entity';
  var deleteBtn = document.getElementById('deleteEntityBtn');
  if (deleteBtn) { deleteBtn.classList.add('u-hidden'); window.setDisplay(deleteBtn, 'none'); }
  ['entityName','entityPhone','entityWallet'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
};
