window.prepareRawMaterialScreen = function() {
  var titleEl = document.getElementById('factoryInventoryModalTitle');
  if (titleEl) titleEl.textContent = 'Add Raw Material';
  var _saveBtn = document.getElementById('factorySaveMaterialBtn');
  if (_saveBtn) _saveBtn.textContent = 'Save Material';
  var delBtn = document.getElementById('deleteFactoryInventoryBtn');
  if (delBtn) window.setDisplay(delBtn, 'none');
  if (typeof window.clearFactoryInventoryForm === 'function') window.clearFactoryInventoryForm();
  var qtyInput = document.getElementById('factoryMaterialQuantity');
  var conversionInput = document.getElementById('factoryMaterialConversionFactor');
  var costInput = document.getElementById('factoryMaterialCost');
  if (qtyInput && conversionInput && costInput && typeof window.updateFactoryKgCalculation === 'function') {
    qtyInput.removeEventListener('input', window.updateFactoryKgCalculation);
    conversionInput.removeEventListener('input', window.updateFactoryKgCalculation);
    costInput.removeEventListener('input', window.updateFactoryKgCalculation);
    qtyInput.addEventListener('input', window.updateFactoryKgCalculation);
    conversionInput.addEventListener('input', window.updateFactoryKgCalculation);
    costInput.addEventListener('input', window.updateFactoryKgCalculation);
  }
};
