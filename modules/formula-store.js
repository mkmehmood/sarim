import { ensureArray, esc, generateUUID, getTimestamp, sqliteStore } from './business.js';
import { showGlassConfirm, showToast } from './customers.js';
import { sendDeviceNotification } from './notify.js';
import { notifyDataChange, triggerAutoSync } from './utilities-core.js';
import { resolveSelectedFormula } from './link-graph.js';
import { _invalidateStoresCache, _set_currentFactoryEntryStore, getAppStores } from './utilities-sales.js';
import { confirmGuard } from './confirm-guard.js';
import { getDefaultStoreKey, formulaIdOf } from './store-keys.js';
import { feedsFromFormulas } from './formula-pools.js';
import { mergeRestored, trashRecord } from './store-recycle.js';
const STORE_KEY = 'formulas';
const STORE_TS_KEY = 'formulas_timestamp';
let _editingId = null;
const _el = (id) => document.getElementById(id);
const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const _fmt = (v) => (typeof window.fmtNum === 'function' ? window.fmtNum(v) : String(v));
const _money = (v) => (typeof window.formatCurrency === 'function' ? window.formatCurrency(v) : _fmt(v));

export async function getFormulaStore() {
  return ensureArray(await sqliteStore.get(STORE_KEY)).filter((f) => f && f.id);
}

export async function getSelectedFormula(ref) {
  const b = await sqliteStore.getBatch([STORE_KEY, 'stores', 'inventory']);
  return resolveSelectedFormula({
    list: ensureArray(b.get(STORE_KEY)), stores: ensureArray(b.get('stores')), inventory: ensureArray(b.get('inventory')),
  }, ref);
}

export async function getFormulaNames() {
  const out = {};
  (await getFormulaStore()).forEach((f) => { out[String(f.id)] = f.name || 'Untitled'; });
  return out;
}

export async function getStoreFormulaNames() {
  const [stores, names] = await Promise.all([getAppStores(), getFormulaNames()]);
  const out = {};
  stores.forEach((s) => { if (names[formulaIdOf(s)]) out[s.key] = esc(names[formulaIdOf(s)]); });
  return out;
}

function _feedWrites(list, now) {
  const f = feedsFromFormulas(list);
  return [['defaults', f.defaults], ['defaults_timestamp', now], ['costs', f.costs], ['costs_timestamp', now], ['adjustment', f.adjustment], ['adjustment_timestamp', now]];
}

function _afterChange() {
  notifyDataChange('all');
  if (typeof triggerAutoSync === 'function') triggerAutoSync();
  if (typeof window.updateAllTabsWithFactoryCosts === 'function') window.updateAllTabsWithFactoryCosts();
  if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
  refreshFormulaDependentUI();
}

export async function commitStoresWithFormulas(stores) {
  const list = await getFormulaStore();
  const normalized = stores;
  const ids = normalized.map(formulaIdOf).filter(Boolean);
  if (ids.some((id) => !list.find((f) => String(f.id) === id))) return { ok: false, error: 'Selected formula no longer exists in the Formula Store' };
  const now = getTimestamp();
  await sqliteStore.setBatch([..._feedWrites(list, now), ['stores', normalized], ['stores_timestamp', Date.now()]]);
  _invalidateStoresCache();
  _afterChange();
  return { ok: true, stores: normalized };
}

async function _saveFormulaStore(list, extraWrites) {
  const now = getTimestamp();
  await sqliteStore.setBatch([[STORE_KEY, list], [STORE_TS_KEY, now], ...(extraWrites || [])]);
  _afterChange();
}
export async function updateFormulaCalcs(formulaId, mutate) {
  const list = await getFormulaStore();
  const idx = list.findIndex((f) => String(f.id) === String(formulaId));
  if (idx < 0) return { ok: false, error: 'This formula no longer exists' };
  const res = mutate(ensureArray(list[idx].savedCalcs));
  if (!res || res.ok === false) return { ok: false, error: (res && res.error) || 'failed' };
  list[idx] = { ...list[idx], savedCalcs: res.list };
  await _saveFormulaStore(list);
  return { ok: true, formula: list[idx] };
}

function _totals(ingredients, additionalCost, factor) {
  let raw = 0;
  let weight = 0;
  ingredients.forEach((i) => { raw += (_num(i.cost, 0) * _num(i.quantity, 0)); weight += _num(i.quantity, 0); });
  const perUnit = raw + additionalCost;
  const perKg = factor > 0 ? perUnit / factor : perUnit;
  return { raw, weight, perUnit, perKg };
}

function _liveCost(ing, inventory) {
  let live = inventory.find((i) => String(i.id) === String(ing.id));
  if (!live && ing.name) live = inventory.find((i) => i.name && i.name.trim().toLowerCase() === String(ing.name).trim().toLowerCase());
  const c = live ? Number(live.cost) : NaN;
  return Number.isFinite(c) && c > 0 ? c : _num(ing.cost, 0);
}

function _row(label, value, extra) {
  return `<div class="d-flex st-font-size__c95659 u-8c130fb${extra ? ' ' + extra : ''}"><span>${label}</span><span>${value}</span></div>`;
}

function _card(f, inventory, usedBy) {
  const ings = ensureArray(f.ingredients).map((i) => ({ ...i, cost: _liveCost(i, inventory) }));
  const addl = _num(f.additionalCost, 0);
  const factor = _num(f.costAdjustmentFactor, 1) || 1;
  const t = _totals(ings, addl, factor);
  let html = `<h4 class="u-c2d830a">${esc(f.name || 'Untitled')} (1 Unit)</h4>`;
  html += ings.length ? ings.map((i) => _row(`${esc(i.name)} (${_fmt(_num(i.quantity, 0))} kg)`, _money(_num(i.cost, 0) * _num(i.quantity, 0)))).join('') : '<div class="u-text-muted">No ingredients.</div>';
  if (addl > 0) html += _row(`Additional Cost (${addl} per unit)`, _money(addl), 'st-color__497726');
  html += '<div class="u-0bee203"></div>';
  html += _row('Unit Weight', _fmt(t.weight) + ' kg');
  html += _row('Raw Material Cost per Unit', _money(t.raw));
  html += _row('Total Cost per Unit', _money(t.perUnit), 'st-font-weight__e3ec02');
  html += _row('Cost per kg (Sales/Calc)', _money(t.perKg));
  html += `<div class="formula-store-edit-hint">${usedBy.length ? 'Used by ' + esc(usedBy.join(', ')) + ' · ' : ''}Tap to edit</div>`;
  return `<div class="formula-display formula-store-card" onclick="openFormulaStoreEditor('${esc(String(f.id))}')">${html}</div>`;
}

export async function renderFormulaStoreList() {
  const box = _el('formulaStoreList');
  if (!box) return;
  const [list, stores] = await Promise.all([getFormulaStore(), getAppStores()]);
  if (!list.length) {
    box.innerHTML = '<div class="u-search-empty u-83094ef">No formulas yet. Tap the + button to add one.</div>';
    return;
  }
  const inventory = ensureArray(await sqliteStore.get('inventory'));
  box.innerHTML = list.map((f) => _card(f, inventory, stores.filter((s) => formulaIdOf(s) === String(f.id)).map((s) => s.name))).join('');
}

export async function openFormulaStore() {
  await renderFormulaStoreList();
}

function _createRow(container, selectedId, qtyVal, costVal, savedName, inventory) {
  let currentCost = costVal !== null ? costVal : 0;
  const currentId = selectedId ? String(selectedId) : '';
  let currentName = savedName || '';
  if (currentId) {
    const match = inventory.find((i) => String(i.id) === currentId);
    if (match) {
      currentName = match.name;
      if (costVal === null) currentCost = match.cost;
    }
  }
  const notify = () => container.dispatchEvent(new CustomEvent('formularowchange'));
  const div = document.createElement('div');
  div.className = 'factory-formula-grid';
  window.setStyle(div, 'position', 'st-position__d461c9');
  const searchWrap = document.createElement('div');
  searchWrap.className = 'factory-mat-select';
  searchWrap.classList.add('st-position__d461c9');
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'factory-mat-search-input';
  searchInput.placeholder = 'Search material…';
  searchInput.value = currentName;
  searchInput.dataset.matId = currentId;
  searchInput.dataset.matCost = String(currentCost);
  searchInput.autocomplete = 'off';
  searchInput.classList.add('u-4c8551b');
  const dropdown = document.createElement('div');
  dropdown.className = 'factory-mat-dropdown hidden u-search-dropdown';
  dropdown.classList.add('st-position__bb6a43', 'st-max-height__914b95', 'u-8f31856');
  dropdown.classList.add('has-overflow', 'scroll-y');
  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.className = 'factory-mat-cost';
  costInput.placeholder = 'Cost';
  costInput.value = currentCost;
  costInput.readOnly = true;
  costInput.classList.add('st-background__e94d78', 'st-color__5872de', 'st-cursor__2a9295');
  const renderDropdown = (query) => {
    const q = (query || '').toLowerCase();
    const filtered = q ? inventory.filter((i) => i.name && i.name.toLowerCase().includes(q)) : inventory;
    const typed = (query || '').trim();
    const exact = typed && inventory.some((i) => i.name && i.name.trim().toLowerCase() === typed.toLowerCase());
    const customOpt = typed && !exact ? `<div class="factory-mat-option factory-mat-custom u-d7ba50a" data-custom="1" data-name="${esc(typed)}">+ Add "${esc(typed)}" (not in inventory)</div>` : '';
    if (!filtered.length) {
      dropdown.innerHTML = (customOpt || '<div class="u-search-empty">No materials found</div>');
    } else {
      dropdown.innerHTML = filtered.map((i) => `<div class="factory-mat-option u-a21e610 st-background__356c02" data-id="${esc(String(i.id))}" data-cost="${esc(String(i.cost))}" data-name="${esc(i.name)}">${esc(i.name)}</div>`).join('') + customOpt;
    }
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.factory-mat-option').forEach((opt) => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (opt.dataset.custom === '1') {
          searchInput.value = opt.dataset.name;
          searchInput.dataset.matId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          searchInput.dataset.custom = '1';
          searchInput.dataset.matCost = '0';
          costInput.value = 0;
          dropdown.classList.add('hidden');
          notify();
          return;
        }
        delete searchInput.dataset.custom;
        searchInput.value = opt.dataset.name;
        searchInput.dataset.matId = opt.dataset.id;
        searchInput.dataset.matCost = opt.dataset.cost;
        costInput.value = opt.dataset.cost;
        dropdown.classList.add('hidden');
        notify();
      });
    });
  };
  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => {
    if (searchInput.dataset.custom === '1') { searchInput.dataset.matId = ''; delete searchInput.dataset.custom; }
    renderDropdown(searchInput.value);
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 150);
    if (!searchInput.dataset.matId) {
      const typed = searchInput.value.trim();
      if (typed) {
        const inv = inventory.find((i) => i.name && i.name.trim().toLowerCase() === typed.toLowerCase());
        if (inv) {
          searchInput.value = inv.name;
          searchInput.dataset.matId = String(inv.id);
          searchInput.dataset.matCost = String(inv.cost);
          costInput.value = inv.cost;
        } else {
          searchInput.dataset.matId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          searchInput.dataset.custom = '1';
          costInput.value = 0;
        }
        notify();
      } else {
        costInput.value = '';
      }
    }
  });
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'factory-mat-qty';
  qtyInput.placeholder = 'Qty (kg)';
  qtyInput.value = qtyVal;
  qtyInput.addEventListener('input', notify);
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'factory-row-del-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = 'Remove row';
  delBtn.onclick = () => {
    div.remove();
    notify();
  };
  div.appendChild(searchWrap);
  div.appendChild(costInput);
  div.appendChild(qtyInput);
  div.appendChild(delBtn);
  container.appendChild(div);
  return div;
}

async function _fillEditor(entry) {
  const inventory = ensureArray(await sqliteStore.get('inventory'));
  const container = _el('fsEditContainer');
  if (!container) return;
  container.replaceChildren();
  ensureArray(entry.ingredients).forEach((ing) => {
    let id = ing.id;
    if (/^custom_/.test(String(id)) && ing.name) {
      const inv = inventory.find((i) => i.name && i.name.trim().toLowerCase() === String(ing.name).trim().toLowerCase());
      if (inv) id = inv.id;
    }
    const row = _createRow(container, id, ing.quantity, id === ing.id ? ing.cost : null, ing.name, inventory);
    if (/^custom_/.test(String(id))) { const inp = row.querySelector('.factory-mat-search-input'); if (inp) inp.dataset.custom = '1'; }
  });
  _el('fs-edit-name').value = entry.name || '';
  _el('fs-additional-cost').value = _num(entry.additionalCost, 0);
  _el('fs-cost-factor').value = _num(entry.costAdjustmentFactor, 1);
  updateFormulaStoreSummary();
}

function _collectEditor() {
  const container = _el('fsEditContainer');
  const ingredients = [];
  if (container) {
    container.querySelectorAll('.factory-formula-grid').forEach((row) => {
      const inp = row.querySelector('.factory-mat-search-input');
      const costIn = row.querySelector('.factory-mat-cost');
      const qtyIn = row.querySelector('.factory-mat-qty');
      const name = inp ? inp.value.trim() : '';
      if (inp && inp.dataset.matId && name && qtyIn && _num(qtyIn.value, 0) > 0) {
        ingredients.push({ id: inp.dataset.matId, name, cost: _num(costIn ? costIn.value : 0, 0), quantity: _num(qtyIn.value, 0), ...(inp.dataset.custom === '1' ? { custom: true } : {}) });
      }
    });
  }
  return {
    name: _el('fs-edit-name').value.trim(),
    ingredients,
    additionalCost: _num(_el('fs-additional-cost').value, 0),
    costAdjustmentFactor: _num(_el('fs-cost-factor').value, 1) || 1
  };
}

export function updateFormulaStoreSummary() {
  const c = _collectEditor();
  const t = _totals(c.ingredients, c.additionalCost, c.costAdjustmentFactor);
  const set = (id, v) => { const el = _el(id); if (el) el.innerText = v; };
  set('fsSummaryWeight', _fmt(t.weight) + ' kg');
  set('fsSummaryRaw', _fmt(t.raw));
  set('fsSummaryPerUnit', _fmt(t.perUnit));
  set('fsSummaryPerKg', _fmt(t.perKg));
}

function _bindEditor() {
  const container = _el('fsEditContainer');
  if (!container || container.dataset.bound === '1') return;
  container.dataset.bound = '1';
  container.addEventListener('formularowchange', () => setTimeout(updateFormulaStoreSummary, 0));
}

export async function openFormulaStoreEditor(id) {
  _editingId = id || null;
  const list = await getFormulaStore();
  const entry = id ? list.find((f) => String(f.id) === String(id)) : null;
  if (id && !entry) { showToast('Formula not found', 'warning'); return; }
  const del = _el('fs-delete-btn');
  if (del) window.setDisplay(del, entry ? '' : 'none');
  const title = _el('fs-edit-title');
  if (title) title.textContent = entry ? 'Edit Formula' : 'New Formula';
  _bindEditor();
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('formula-store-edit-screen');
  await _fillEditor(entry || { name: '', ingredients: [], additionalCost: 0, costAdjustmentFactor: 1 });
}

export async function addFormulaIngredientRow() {
  const container = _el('fsEditContainer');
  if (!container) return;
  _bindEditor();
  const inventory = ensureArray(await sqliteStore.get('inventory'));
  const row = _createRow(container, '', '', null, '', inventory);
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const inp = row.querySelector('.factory-mat-search-input');
  if (inp) setTimeout(() => inp.focus(), 200);
  updateFormulaStoreSummary();
}

export function saveFormulaStoreEntry(...a) { return confirmGuard('saveFormulaStoreEntry', () => _saveFormulaStoreEntryRaw(...a), { label: 'Formula', late: true, isUpdate: () => !!_editingId }); }

async function _saveFormulaStoreEntryRaw() {
  const c = _collectEditor();
  if (!c.name) { window.notifyBlocking('Enter a formula name', 'warning', 'Warning'); return false; }
  if (!c.ingredients.length) { window.notifyBlocking('Add at least one ingredient with quantity', 'warning', 'Warning'); return false; }
if (!(await window.gcCommit({}))) return false;
  const list = await getFormulaStore();
  const now = getTimestamp();
  const idx = _editingId ? list.findIndex((f) => String(f.id) === String(_editingId)) : -1;
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...c, updatedAt: now };
  } else {
    _editingId = generateUUID('formula');
    list.push({ id: _editingId, ...c, createdAt: now, updatedAt: now });
  }
  await _saveFormulaStore(list, _feedWrites(list, now));
  sendDeviceNotification(idx >= 0 ? 'Formula updated' : 'Formula created', `"${c.name}" was saved with ${c.ingredients.length} ingredient${c.ingredients.length === 1 ? '' : 's'}.`, 'formula-' + _editingId).catch(() => {});
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
  return true;
}

export async function deleteFormulaStoreEntry() {
  if (!_editingId) return;
  const stores = await getAppStores();
  const users = stores.filter((s) => formulaIdOf(s) === String(_editingId)).map((s) => s.name);
  if (users.length) {
    window.notifyBlocking(`In use by ${users.join(', ')}. Assign those stores another formula first.`, 'warning', 'Warning');
    return;
  }
  const ok = await showGlassConfirm('Delete this formula from the store?', { title: 'Delete Formula', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const fullList = await getFormulaStore();
  const removed = fullList.find((f) => String(f.id) === String(_editingId));
  const list = fullList.filter((f) => String(f.id) !== String(_editingId));
  if (removed) await trashRecord('formulas', removed);
  await _saveFormulaStore(list, _feedWrites(list, getTimestamp()));
  sendDeviceNotification('Formula deleted', removed && removed.name ? `"${removed.name}" was removed from your formulas.` : 'A formula was removed.', 'formula-del-' + _editingId).catch(() => {});
  _editingId = null;
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
}

export async function restoreFormulaEntry(record) {
  if (!record || !record.id) return false;
  const list = mergeRestored(await getFormulaStore(), record);
  await _saveFormulaStore(list, _feedWrites(list, getTimestamp()));
  return true;
}
function _renderChoice(hostId, items, active, onPick, emptyText) {
  const host = _el(hostId);
  if (!host) return;
  host.textContent = '';
  if (items.length < 2) {
    const only = document.createElement('span');
    only.className = 'formula-label';
    only.textContent = items.length ? items[0].label : emptyText;
    host.appendChild(only);
    return;
  }
  const group = document.createElement('div');
  group.className = 'formula-toggle';
  group.setAttribute('role', 'group');
  items.forEach((it) => {
    const on = it.value === String(active);
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'formula-toggle-opt' + (on ? ' active' : '');
    opt.setAttribute('aria-pressed', on ? 'true' : 'false');
    opt.textContent = it.label;
    opt.addEventListener('click', () => onPick(it.value));
    group.appendChild(opt);
  });
  host.appendChild(group);
}

export async function setStoreFormulaSelection(id) {
  const list = await getFormulaStore();
  const f = list.find((x) => String(x.id) === String(id));
  const input = _el('store-formula-select');
  if (input) input.value = f ? String(f.id) : '';
  const btn = _el('store-formula-btn');
  const sp = btn ? btn.querySelector('span') : null;
  if (sp) sp.textContent = f ? (f.name || 'Untitled') : 'Select formula';
}

export async function openStoreFormulaPicker(btn) {
  const old = document.getElementById('_pop_storeFormula');
  const wasOpen = !!old && window.getDisplay(old) !== 'none';
  if (old) old.remove();
  if (wasOpen) return;
  const list = await getFormulaStore();
  if (!list.length) { showToast('Add a formula in the Formula Store first', 'warning'); return; }
  window._mkPopover(btn.parentNode, '_pop_storeFormula', list.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })), (v) => {
    const input = _el('store-formula-select');
    if (input) input.value = v;
  });
  const pop = document.getElementById('_pop_storeFormula');
  if (pop) {
    pop.classList.add('u-2febf94');
    window.setStyle(pop, 'max-height', 'st-max-height__936545');
    pop.classList.add('overflow-y-auto');
    pop.classList.add('has-overflow', 'scroll-y');
  }
}

function _items(view, order) {
  return view ? order.map((k) => ({ value: k, label: view.labels[k] || 'Formula' })) : [];
}

export function syncFactoryFormulaPicker(pool) {
  const view = window._formulaPickerView;
  const input = _el('factory-formula-value');
  if (input) input.value = pool || '';
  _renderChoice('factoryFormulaToggle', _items(view, view ? view.entryOrder : []), pool, (k) => { if (typeof window.selectFactoryFormula === 'function') window.selectFactoryFormula(k); }, 'No formula');
}

export function syncFactoryAvailPicker(pool) {
  const view = window._formulaPickerView;
  const input = _el('factory-avail-value');
  if (input) input.value = pool || '';
  _renderChoice('factoryAvailToggle', _items(view, view ? view.availOrder : []), pool, (k) => { if (typeof window.setFactoryAvailableStore === 'function') window.setFactoryAvailableStore(k); }, 'No formula');
}

export async function refreshFormulaDependentUI() {
  const [names, stores, tracking] = await Promise.all([getFormulaNames(), getAppStores(), sqliteStore.get('tracking')]);
  const poolOfStore = {};
  stores.forEach((s) => { if (names[formulaIdOf(s)]) poolOfStore[s.key] = formulaIdOf(s); });
  const used = new Set(Object.values(poolOfStore));
  const known = Object.keys(names);
  const entryOrder = known.filter((id) => used.has(id));
  const availOrder = known.filter((id) => used.has(id) || _num(tracking && tracking[id] && tracking[id].available, 0) > 0);
  window._formulaNames = names;
  window._formulaPickerView = { labels: names, entryOrder, availOrder };
  let active = poolOfStore[window.currentFactoryEntryStore || getDefaultStoreKey()];
  if (!entryOrder.includes(active)) active = entryOrder[0] || '';
  const rep = stores.find((s) => poolOfStore[s.key] === active);
  if (rep && poolOfStore[window.currentFactoryEntryStore] !== active) _set_currentFactoryEntryStore(rep.key);
  syncFactoryFormulaPicker(active);
  const availInput = _el('factory-avail-value');
  let availPool = availInput ? availInput.value : (availOrder[0] || '');
  if (!availOrder.includes(availPool)) availPool = availOrder[0] || '';
  if (typeof window.setFactoryAvailableStore === 'function') await window.setFactoryAvailableStore(availPool);
  else syncFactoryAvailPicker(availPool);
  refreshFormulaStoreScreens();
  if (typeof window.renderStoreList === 'function' && _el('store-manager-screen') && window.getDisplay(_el('store-manager-screen')) !== 'none') window.renderStoreList();
  if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
  if (typeof window.renderFactoryHistory === 'function') window.renderFactoryHistory();
}

export function refreshFormulaStoreScreens() {
  const listScreen = _el('formula-store-screen');
  if (listScreen && window.getDisplay(listScreen) !== 'none') renderFormulaStoreList();
}

Object.assign(window, { restoreFormulaEntry, openFormulaStore, renderFormulaStoreList, openFormulaStoreEditor, addFormulaIngredientRow, saveFormulaStoreEntry, deleteFormulaStoreEntry, updateFormulaStoreSummary, refreshFormulaStoreScreens, refreshFormulaDependentUI, syncFactoryFormulaPicker, syncFactoryAvailPicker, commitStoresWithFormulas, updateFormulaCalcs, setStoreFormulaSelection, openStoreFormulaPicker, getStoreFormulaNames, getFormulaNames, getFormulaStore });
