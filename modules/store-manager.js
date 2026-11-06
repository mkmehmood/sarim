async function openStoreManagerScreen() {
  openStandaloneScreen('store-manager-screen');
  await renderStoreList();
  resetStoreForm();
}
window.openStoreManagerScreen = openStoreManagerScreen;
async function renderStoreList() {
  const stores = await (typeof window.getAppStores === 'function' ? window.getAppStores() : Promise.resolve([]));
  const container = document.getElementById('store-list-container');
  if (!container) return;
  let productionData = [];
  try {
    productionData = (typeof window.sqliteStore !== 'undefined') ? (await window.sqliteStore.get('production') || []) : [];
  } catch(e) {}
  const usedKeys = new Set(productionData.map(r => r.store).filter(Boolean));
  if (!stores.length) {
    container.innerHTML = '<p class="u-d67835a">No stores found.</p>';
    return;
  }
  const formulaNames = typeof window.getStoreFormulaNames === 'function' ? await window.getStoreFormulaNames() : {};
  container.innerHTML = stores.map((s, i) => {
    const isUsed = usedKeys.has(s.key);
    const isBuiltin = typeof window.isBuiltinStoreKey === 'function' ? window.isBuiltinStoreKey(s.key) : false;
    return `
    <div class="card settings-list-item u-5c12a4f">
      <div class="u-2757ede d-flex">
        <div class="u-c560d14 d-flex st-background__fbe8aa st-border-bottom__710d95">
          ${(s.name || '?').slice(0,2)}
        </div>
        <div class="u-8b4ab7f">
          <div class="u-4f111f5">${s.name}</div>
          <div class="u-65c72da">
            Key: <span class="u-1e86a25">${s.key}</span>
            &nbsp;·&nbsp;
            <span class="u-text-accent">${formulaNames[s.key] || 'No formula'}</span>
            ${isUsed ? '&nbsp;·&nbsp;<span class="st-color__5872de">Has records</span>' : ''}
          </div>
          <div class="u-6ca7dd1">
            Sale Price: ${(s.salePrice != null && s.salePrice > 0) ? s.salePrice : 0}/kg
          </div>
        </div>
        <div class="u-3141675 d-flex">
          <button onclick="editStore(${i})" class="btn btn-theme btn-sm">Edit</button>
          ${!isBuiltin && !isUsed ? `<button onclick="deleteStore(${i})" class="text-xs st-background__474cf1 st-border-bottom__23471e st-color__497726 st-border-radius__28a50d st-padding__b2e03a st-font-size__8e87b7 st-font-weight__e3ec02 st-cursor__3b6a3a">Delete</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}
window.renderStoreList = renderStoreList;
function resetStoreForm() {
  document.getElementById('store-edit-index').value = '-1';
  document.getElementById('store-name-input').value = '';
  document.getElementById('store-sale-price-input').value = '0';
  if (typeof window.setStoreFormulaSelection === 'function') window.setStoreFormulaSelection('');
  document.getElementById('store-form-heading').textContent = 'New Store';
  document.getElementById('store-save-btn-text').textContent = 'Add Store';
  const cancelBtn = document.getElementById('store-cancel-edit-btn');
  if (cancelBtn) window.setDisplay(cancelBtn, 'none');
}
window.resetStoreForm = resetStoreForm;
async function editStore(index) {
  const stores = await (typeof window.getAppStores === 'function' ? window.getAppStores() : Promise.resolve([]));
  const s = stores[index];
  if (!s) return;
  document.getElementById('store-edit-index').value = String(index);
  document.getElementById('store-name-input').value = s.name;
  document.getElementById('store-sale-price-input').value = s.salePrice || 0;
  if (typeof window.setStoreFormulaSelection === 'function') await window.setStoreFormulaSelection(s.formulaId || '');
  document.getElementById('store-form-heading').textContent = 'Edit Store';
  document.getElementById('store-save-btn-text').textContent = 'Save Changes';
  const cancelBtn = document.getElementById('store-cancel-edit-btn');
  if (cancelBtn) window.setDisplay(cancelBtn, '');
  document.getElementById('store-name-input').focus();
}
window.editStore = editStore;
async function deleteStore(index) {
  const stores = await (typeof window.getAppStores === 'function' ? window.getAppStores() : Promise.resolve([]));
  const s = stores[index];
  if (!s) return;
  const confirmed = await (typeof window.showGlassConfirm === 'function'
    ? window.showGlassConfirm('Delete store "' + s.name + '"?\nThis cannot be undone.', { title:'Delete Store', confirmText:'Delete', cancelText:'Cancel', icon:'🗑' })
    : Promise.resolve(window.confirm('Delete store "' + s.name + '"?')));
  if (!confirmed) return;
  stores.splice(index, 1);
  await window.sqliteStore.set('stores', stores);
  await window.sqliteStore.set('stores_timestamp', Date.now());
  if (typeof window._invalidateStoresCache === 'function') window._invalidateStoresCache();
  if (typeof window.triggerAutoSync === 'function') window.triggerAutoSync();
  await renderStoreList();
  if (typeof window.rebuildStoreUI === 'function') await window.rebuildStoreUI();
  if (typeof window.sendDeviceNotification === 'function') window.sendDeviceNotification('Store deleted', s.name, 'store-del-' + s.key).catch(function(){});
}
window.deleteStore = deleteStore;
async function saveStoreFromForm() {
  const nameRaw = (document.getElementById('store-name-input').value || '').trim().toUpperCase();
  const formulaId = document.getElementById('store-formula-select').value || '';
  const salePriceRaw = parseFloat(document.getElementById('store-sale-price-input').value);
  const salePrice = (isNaN(salePriceRaw) || salePriceRaw < 0) ? 0 : salePriceRaw;
  const editIndex = parseInt(document.getElementById('store-edit-index').value, 10);
  if (!nameRaw) {
    if (typeof window.showToast === 'function') window.showToast('Store name is required', 'warning');
    return;
  }
  if (!formulaId) {
    if (typeof window.showToast === 'function') window.showToast('Select a formula from the Formula Store', 'warning');
    return;
  }
  const stores = (await (typeof window.getAppStores === 'function' ? window.getAppStores() : Promise.resolve([]))).map(function(st) { return Object.assign({}, st); });
  if (editIndex >= 0) {
    const s = stores[editIndex];
    if (!s) return;
    const dup = stores.findIndex((st, i) => i !== editIndex && st.name === nameRaw);
    if (dup >= 0) { if (typeof window.showToast === 'function') window.showToast('A store with this name already exists', 'warning'); return; }
    s.name = nameRaw;
    s.formulaId = formulaId;
    s.salePrice = isNaN(salePriceRaw) ? (s.salePrice > 0 ? s.salePrice : 0) : salePrice;
  } else {
    const newKey = window.makeStoreKey(nameRaw, stores.map(function(st) { return st.key; }));
    const dup = stores.findIndex(st => st.name === nameRaw);
    if (dup >= 0) { if (typeof window.showToast === 'function') window.showToast('A store with this name already exists', 'warning'); return; }
    stores.push({ key: newKey, name: nameRaw, formulaId, salePrice });
  }
  if (typeof window.showGlassConfirm === 'function') {
    const _storeOk = await window.showGlassConfirm(
      (editIndex >= 0 ? 'Update store "' : 'Add store "') + nameRaw + '"?\nPlease review the details before continuing.',
      { title: editIndex >= 0 ? 'Update Store?' : 'Save Store?', confirmText: editIndex >= 0 ? 'Update' : 'Save', cancelText: 'Cancel', tone: editIndex >= 0 ? 'warning' : 'primary' }
    );
    if (!_storeOk) return;
  }
  const commitResult = await window.commitStoresWithFormulas(stores);
  if (!commitResult.ok) {
    window.notifyBlocking(commitResult.error, 'warning', 'Warning');
    return;
  }
  resetStoreForm();
  await renderStoreList();
  if (typeof window.rebuildStoreUI === 'function') await window.rebuildStoreUI();
  if (typeof window.sendDeviceNotification === 'function') {
    var _nStore = (commitResult.stores || []).find(function(x) { return x.name === nameRaw; }) || {};
    window.sendDeviceNotification(editIndex >= 0 ? 'Store updated' : 'Store added', nameRaw + ' — sale price ' + (_nStore.salePrice > 0 ? _nStore.salePrice : 0) + '/kg', 'store-' + (_nStore.key || nameRaw)).catch(function(){});
  }
}
window.saveStoreFromForm = saveStoreFromForm;
